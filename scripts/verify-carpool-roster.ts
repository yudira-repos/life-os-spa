// Replays the seeded roster through the real DayOS engines and checks it
// against every date Ravi listed. No database — the engines are pure.
import { expandOccurrences, parseWeekdays, type Weekday } from "@/lib/dayos/recurrence";
import {
  occurrenceIndexFor,
  resolveAssignment,
  type AssignmentOverride,
  type Rotation,
} from "@/lib/dayos/rotation";
import { utcDay, dayKey, addDays } from "@/lib/travelos/dates";
import { composeCarpoolMessage } from "@/lib/dayos/carpool";

const ANCHOR = utcDay(2026, 8, 14);
const TERM_START = utcDay(2026, 8, 10);
const TERM_END = utcDay(2027, 6, 11);

type Slot = { weekday?: number; who: string };
const rot = (kind: "FIXED_WEEKDAY" | "ROUND_ROBIN", slots: Slot[]) => ({
  id: "r", kind, anchorDay: ANCHOR,
  slots: slots.map((s, i) => ({ weekday: s.weekday as Weekday | undefined, orderIndex: i, assigneeId: s.who })),
});

const ROTATIONS = {
  dropWeek: rot("FIXED_WEEKDAY", [
    { weekday: 1, who: "Aarti" }, { weekday: 2, who: "Divya" },
    { weekday: 3, who: "Divya" }, { weekday: 4, who: "Pranav" }]),
  dropFri: rot("ROUND_ROBIN", [
    { who: "Pranav" }, { who: "Divya" }, { who: "Aarti" }, { who: "Divya" }]),
  pickWeek: rot("FIXED_WEEKDAY", [
    { weekday: 1, who: "Nitya" }, { weekday: 3, who: "Aniruddha" }, { weekday: 4, who: "Nitya" }]),
  pickTue: rot("FIXED_WEEKDAY", [{ weekday: 2, who: "Shivangi" }]),
  pickFri: rot("ROUND_ROBIN", [
    { who: "Shivangi" }, { who: "Nitya" }, { who: "Aniruddha" }, { who: "Nitya" }]),
};

const ACTIVITIES = [
  { key: "dropWeek", weekdays: "1,2,3,4", from: TERM_START, min: 480, role: "DROPOFF" },
  { key: "dropFri", weekdays: "5", from: ANCHOR, min: 480, role: "DROPOFF" },
  { key: "pickWeek", weekdays: "1,3,4", from: TERM_START, min: 930, role: "PICKUP" },
  { key: "pickTue", weekdays: "2", from: TERM_START, min: 1005, role: "PICKUP" },
  { key: "pickFri", weekdays: "5", from: ANCHOR, min: 930, role: "PICKUP" },
] as const;

const OVERRIDES: Record<string, AssignmentOverride[]> = {
  pickWeek: [{ day: utcDay(2026, 8, 27), assigneeId: "Pranav", kind: "SWAP",
              replacedAssigneeId: "Nitya", swappedWithDay: utcDay(2026, 9, 8) }],
  pickTue: [{ day: utcDay(2026, 9, 8), assigneeId: "Nitya", kind: "SWAP",
             replacedAssigneeId: "Shivangi", swappedWithDay: utcDay(2026, 8, 27) }],
};

function runsFor(day: Date) {
  const out: { role: string; who: string | null; min: number; source: string; replaced?: string | null }[] = [];
  for (const a of ACTIVITIES) {
    const rec = { weekdays: parseWeekdays(a.weekdays), effectiveFrom: a.from, effectiveTo: TERM_END };
    if (expandOccurrences(rec, day, day).length === 0) continue;
    const r: Rotation = ROTATIONS[a.key];
    const days = r.kind === "ROUND_ROBIN"
      ? expandOccurrences({ ...rec, effectiveFrom: ANCHOR }, ANCHOR, day).map(o => o.day) : [];
    const asg = resolveAssignment(r, day, occurrenceIndexFor(days, day), OVERRIDES[a.key] ?? []);
    out.push({ role: a.role, who: asg.assigneeId, min: a.min, source: asg.source, replaced: asg.rosterAssigneeId });
  }
  return out;
}

let failures = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log(`  FAIL ${label}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${label} -> ${JSON.stringify(got)}`);
};

console.log("\nFriday rotation — all eight dates Ravi listed");
const FRIDAYS: [number, number, string, string][] = [
  [8, 14, "Pranav", "Shivangi"], [8, 21, "Divya", "Nitya"], [8, 28, "Aarti", "Aniruddha"],
  [9, 4, "Divya", "Nitya"], [9, 11, "Pranav", "Shivangi"], [9, 18, "Divya", "Nitya"],
  [9, 25, "Aarti", "Aniruddha"], [10, 2, "Divya", "Nitya"],
];
for (const [m, d, drop, pick] of FRIDAYS) {
  const day = utcDay(2026, m, d);
  const r = runsFor(day);
  check(`${dayKey(day)}`, [r.find(x => x.role === "DROPOFF")?.who, r.find(x => x.role === "PICKUP")?.who], [drop, pick]);
}

console.log("\nWeekday grid (week of Aug 24)");
const WEEK: [number, string, string, number][] = [
  [24, "Aarti", "Nitya", 930], [25, "Divya", "Shivangi", 1005],
  [26, "Divya", "Aniruddha", 930], [27, "Pranav", "Pranav", 930],
];
for (const [d, drop, pick, pickMin] of WEEK) {
  const day = utcDay(2026, 8, d);
  const r = runsFor(day);
  const p = r.find(x => x.role === "PICKUP");
  check(`Aug ${d}`, [r.find(x => x.role === "DROPOFF")?.who, p?.who, p?.min], [drop, pick, pickMin]);
}

console.log("\nSwaps");
check("Aug 27 pickup is a SWAP off Nitya",
  (() => { const p = runsFor(utcDay(2026, 8, 27)).find(x => x.role === "PICKUP")!; return [p.who, p.source, p.replaced]; })(),
  ["Pranav", "SWAP", "Nitya"]);
check("Sep 8 pickup is a SWAP off Shivangi",
  (() => { const p = runsFor(utcDay(2026, 9, 8)).find(x => x.role === "PICKUP")!; return [p.who, p.source, p.replaced]; })(),
  ["Nitya", "SWAP", "Shivangi"]);

console.log("\nWeekend produces nothing");
check("Sat Aug 22", runsFor(utcDay(2026, 8, 22)).length, 0);
check("Sun Aug 23", runsFor(utcDay(2026, 8, 23)).length, 0);

console.log("\nFairness over the whole term (Fridays only)");
const tally: Record<string, number> = {};
for (let d = new Date(ANCHOR); d <= TERM_END; d = addDays(d, 1)) {
  if (d.getUTCDay() !== 5) continue;
  for (const r of runsFor(d)) if (r.who) tally[`${r.who} (${r.role[0]})`] = (tally[`${r.who} (${r.role[0]})`] ?? 0) + 1;
}
console.log("  " + Object.entries(tally).sort().map(([k, v]) => `${k}=${v}`).join("  "));

console.log("\nRendered group message — Thursday Aug 27");
const msg = composeCarpoolMessage({
  groupName: "School carpool", dayLabel: "Thursday 27 August",
  runs: runsFor(utcDay(2026, 8, 27)).map(r => ({
    kind: r.role === "PICKUP" ? "PICKUP" : "DROPOFF", responsibleName: r.who, startMinute: r.min,
    source: r.source, replacedName: r.source === "SWAP" ? r.replaced : null })),
});
console.log("  ---\n" + msg.reply_text.split("\n").map(l => "  | " + l).join("\n") + "\n  ---");

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
