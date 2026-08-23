// Exercises the outbox invariants against an in-memory stand-in for Prisma,
// mirroring outbox.ts exactly. Proves the rules that matter when this runs
// unattended at 6am: exactly-once, urgent-first, never-late, opt-out honoured.
const CLAIM_GRACE_MINUTES = 5, MAX_ATTEMPTS = 4;
const EXPIRY = { DRIVE_NOW:15, RETIME:20, UNCOVERED:30, PREPARE:45 };
const URGENT = ["DRIVE_NOW","RETIME","UNCOVERED"];
const PREF_FOR_KIND = { BRIEF:"calendarBrief", AI_NEWS:"aiNewsBrief", DRIVE_NOW:"leaveNowAlerts",
  PREPARE:"leaveNowAlerts", RETIME:"leaveNowAlerts", ASK:"leaveNowAlerts", REMIND:"leaveNowAlerts",
  ESCALATE:"leaveNowAlerts", UNCOVERED:"leaveNowAlerts", CARPOOL:null };

let rows=[], seq=0;
const channels = new Map(); // address -> prefs|null   (absent = no member)

function optedOut(to, kind){
  const pref = PREF_FOR_KIND[kind];
  if(!pref) return false;
  if(!channels.has(to)) return false;
  const prefs = channels.get(to);
  if(!prefs) return pref === "aiNewsBrief";
  return prefs[pref] === false;
}
function enqueue({to,body,kind,dedupeKey,now=new Date()}){
  if(!to?.trim()) return {queued:false,reason:"NO_ADDRESS"};
  if(optedOut(to,kind)) return {queued:false,reason:"OPTED_OUT"};
  if(rows.some(r=>r.dedupeKey===dedupeKey)) return {queued:false,reason:"DUPLICATE"};
  const exp = EXPIRY[kind];
  rows.push({id:`r${++seq}`,toAddress:to,body,kind,urgent:URGENT.includes(kind),dedupeKey,
    status:"PENDING",claimedAt:null,attempts:0,lastError:null,
    expiresAt: exp? new Date(now.getTime()+exp*60000):null, createdAt:new Date(now.getTime()+seq)});
  return {queued:true,id:`r${seq}`};
}
function claim(limit=20, now=new Date()){
  for(const r of rows) if(r.status==="CLAIMED" && r.claimedAt < new Date(now-CLAIM_GRACE_MINUTES*60000)){ r.status="PENDING"; r.claimedAt=null; }
  for(const r of rows) if(["PENDING","CLAIMED"].includes(r.status) && r.expiresAt && r.expiresAt<now){ r.status="EXPIRED"; r.lastError="Expired before it could be delivered."; }
  const cands = rows.filter(r=>r.status==="PENDING")
    .sort((a,b)=> (b.urgent-a.urgent) || (a.createdAt-b.createdAt)).slice(0,limit);
  const out=[];
  for(const r of cands){ if(r.status==="PENDING"){ r.status="CLAIMED"; r.claimedAt=now; r.attempts++; out.push({id:r.id,to:r.toAddress,body:r.body,kind:r.kind}); } }
  return out;
}
function markSent(ids,now=new Date()){ let n=0; for(const r of rows) if(ids.includes(r.id)&&r.status==="CLAIMED"){r.status="SENT";r.sentAt=now;n++;} return n; }
function markFailed(fs){ let retrying=0,givenUp=0;
  for(const f of fs){ const r=rows.find(x=>x.id===f.id); if(!r||r.status!=="CLAIMED")continue;
    const ex=r.attempts>=MAX_ATTEMPTS; r.status=ex?"FAILED":"PENDING"; r.claimedAt=null; r.lastError=f.error??"Delivery failed.";
    ex?givenUp++:retrying++; } return {retrying,givenUp}; }

let fail=0;
const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);
  if(!ok){fail++;console.log(`  FAIL ${l}\n       got  ${JSON.stringify(g)}\n       want ${JSON.stringify(w)}`);}
  else console.log(`  ok   ${l}`);};
const reset=()=>{rows=[];seq=0;channels.clear();};

const T0=new Date("2026-08-24T06:30:00Z");

console.log("\nExactly-once");
reset();
eq("same dedupeKey queues once",
  [enqueue({to:"+1",body:"b",kind:"BRIEF",dedupeKey:"k1",now:T0}).queued,
   enqueue({to:"+1",body:"b",kind:"BRIEF",dedupeKey:"k1",now:T0}).reason], [true,"DUPLICATE"]);
eq("two drains cannot both take a row",
  [claim(10,T0).length, claim(10,T0).length], [1,0]);

console.log("\nUrgent jumps the queue");
reset();
enqueue({to:"+1",body:"brief",kind:"BRIEF",dedupeKey:"b",now:T0});
enqueue({to:"+1",body:"news",kind:"AI_NEWS",dedupeKey:"n",now:T0});
enqueue({to:"+1",body:"LEAVE",kind:"DRIVE_NOW",dedupeKey:"d",now:T0});
eq("drive-now first despite being queued last", claim(10,T0).map(m=>m.kind), ["DRIVE_NOW","BRIEF","AI_NEWS"]);

console.log("\nNever late");
reset();
enqueue({to:"+1",body:"LEAVE",kind:"DRIVE_NOW",dedupeKey:"d",now:T0});
enqueue({to:"+1",body:"brief",kind:"BRIEF",dedupeKey:"b",now:T0});
const late=new Date(T0.getTime()+16*60000);
eq("expired drive-now is retired, brief still goes", claim(10,late).map(m=>m.kind), ["BRIEF"]);
eq("its status is EXPIRED", rows.find(r=>r.kind==="DRIVE_NOW").status, "EXPIRED");

console.log("\nCrash recovery");
reset();
enqueue({to:"+1",body:"x",kind:"BRIEF",dedupeKey:"b",now:T0});
claim(10,T0);
eq("still claimed inside the grace window", claim(10,new Date(T0.getTime()+2*60000)).length, 0);
eq("released after it", claim(10,new Date(T0.getTime()+6*60000)).length, 1);

console.log("\nRetry then give up");
reset();
enqueue({to:"+1",body:"x",kind:"BRIEF",dedupeKey:"b",now:T0});
let t=T0, giveUp=null;
for(let i=0;i<5;i++){ const c=claim(10,t); if(!c.length)break; giveUp=markFailed([{id:c[0].id,error:"boom"}]); t=new Date(t.getTime()+6*60000); }
eq("gives up after MAX_ATTEMPTS", [rows[0].status, rows[0].attempts, giveUp.givenUp], ["FAILED",4,1]);
eq("keeps the reason", rows[0].lastError, "boom");

console.log("\nPreferences");
reset();
channels.set("+optout", {calendarBrief:false, leaveNowAlerts:true, aiNewsBrief:false});
channels.set("+allon",  {calendarBrief:true,  leaveNowAlerts:true, aiNewsBrief:true});
channels.set("+nopref", null);
eq("brief suppressed when toggled off", enqueue({to:"+optout",body:"x",kind:"BRIEF",dedupeKey:"1",now:T0}).reason, "OPTED_OUT");
eq("leave-now still sent to the same person", enqueue({to:"+optout",body:"x",kind:"DRIVE_NOW",dedupeKey:"2",now:T0}).queued, true);
eq("news sent when opted in", enqueue({to:"+allon",body:"x",kind:"AI_NEWS",dedupeKey:"3",now:T0}).queued, true);
eq("news off by default with no prefs row", enqueue({to:"+nopref",body:"x",kind:"AI_NEWS",dedupeKey:"4",now:T0}).reason, "OPTED_OUT");
eq("brief on by default with no prefs row", enqueue({to:"+nopref",body:"x",kind:"BRIEF",dedupeKey:"5",now:T0}).queued, true);
eq("carpool group is never gated by personal prefs", enqueue({to:"120@g.us",body:"x",kind:"CARPOOL",dedupeKey:"6",now:T0}).queued, true);
eq("unknown address passes through", enqueue({to:"+99999",body:"x",kind:"BRIEF",dedupeKey:"7",now:T0}).queued, true);

console.log("\nHappy path");
reset();
enqueue({to:"+1",body:"x",kind:"BRIEF",dedupeKey:"b",now:T0});
const c=claim(10,T0); markSent([c[0].id],T0);
eq("sent rows are not re-claimed", [rows[0].status, claim(10,T0).length], ["SENT",0]);

console.log(fail===0 ? "\nALL CHECKS PASSED\n" : `\n${fail} FAILURE(S)\n`);
process.exit(fail===0?0:1);
