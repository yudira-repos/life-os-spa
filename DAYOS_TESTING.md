# Testing DayOS

Four layers, cheapest first. The first two need nothing but the repo; the third
and fourth need a database.

---

## 1. The engines — no database, no network

```bash
npm run verify:day
```

80 assertions across time/DST, recurrence, rotations, the leave-time solver,
re-timing thresholds, origin inference, conflicts, the brief and the escalation
ladder. Runs in about a second. This is the one to run on every change, and the
one CI should gate on.

It asserts the PRD's own worked examples to the minute (§9's 4:23 PM departure,
§20's 3:56 PM), so a regression in the arithmetic fails loudly rather than
subtly.

---

## 2. The schema

```bash
npx prisma validate
npx prisma migrate dev --name dayos      # first time only
npx tsx scripts/enable-dayos.ts          # or: npm run dayos:enable
```

`enable-dayos.ts` backfills the `day` entitlement and a `DayPreferences` row for
households that already exist. `FREE_MODULES` only seeds entitlements at
household *creation*, so without this the module shows as locked on an account
you already have — which is exactly the kind of thing that gets debugged for an
hour before someone remembers.

Proactive messaging stays **off**. Nobody gets messaged because a migration ran.

---

## 3. A realistic household

```bash
npm run dayos:seed          # or: npx tsx scripts/seed-dayos-demo.ts
```

Attaches to your existing household (sign in first) and builds the PRD's own
example family, because the interesting cases are all in it:

| What | Why it's there |
| --- | --- |
| A rotation over **two adults and two external carpool parents** | The case a members-only model can't express |
| Ravi's Mon/Fri pickup, 15 min after a meeting ends 25 min away | The clash no calendar can see |
| A dance class that asks for confirmation | Gives the escalation ladder something to climb |
| Carpool parents with **no reachable channel** | Exercises the "can't be reached" warning |
| A Saturday soccer practice | So the Today page isn't empty at the weekend |

Every member gets an `IN_APP` channel **and nothing else**, deliberately: the
loop then writes dispatch rows you can read without a message reaching a real
phone.

Then `npm run dev` and open `/app/day`. You should see the day ordered by time,
leave times against each trip, who is responsible, and — on a Monday or Friday —
the clash banner.

Undo it with `npx tsx scripts/seed-dayos-demo.ts --reset`.

---

## 4. A whole day of the agent, in ten seconds

This is the one worth knowing about.

```bash
npm run dayos:simulate -- --date 2026-08-24
npm run dayos:simulate -- --date 2026-08-25 --traffic-spike 15:30
npm run dayos:simulate -- --date 2026-08-24 --from 14:00 --to 17:00 --step 1
```

`tickHousehold(householdId, now)` takes its clock as a parameter, deliberately,
so it can be driven by something other than the wall clock. The simulator walks
a simulated day in 5-minute steps, calls the tick at each, and prints every
message that appears — the entire behaviour of the proactive loop, without
waiting a day for it.

Typical output:

```
  07:00  BRIEF      → member · IN_APP · sent
            Good morning, Ravi.
            8:00 AM  Ayuktha's School drop-off — Ravi
                     leave 7:22 AM · 20 min drive from Home (assumed)
            3:15 PM  Ayuktha's School pickup — Ravi
                     leave 2:37 PM · 20 min drive from Work (assumed)
            Ravi is down for both Design review and Ayuktha's School pickup
            — they overlap by 15 min.

  07:10  PREPARE    → member · IN_APP · sent
            Heads up — leave in 12 min for Ayuktha's School drop-off (7:22 AM).

  15:30  ~~ traffic rises to 40 min (4 cached route(s) invalidated) ~~
  15:30  RETIME     → member · IN_APP · sent
            Traffic is up 20 min for Ayuktha's Dance class. Leave by 4:10 PM instead.
```

### Safety

It writes to the real database and, with real channels configured, would send
real messages. Two guards:

1. **It refuses to run** if any member or contact has a channel other than
   `IN_APP`, naming them, unless you pass `--allow-real-sends`.
2. It flips `proactiveEnabled` on for the run and **restores it afterwards**,
   including on Ctrl-C.

It also resets the day first — occurrences, dispatch log, escalation rungs, and
cached routing estimates — so a re-run shows the whole stream again instead of
being correctly deduplicated into silence. Pass `--keep-dispatches` to test the
deduplication itself: a second run should then print nothing at all, which is
the send-exactly-once guarantee working.

### Options

| Flag | Default | Notes |
| --- | --- | --- |
| `--date YYYY-MM-DD` | today | Pick a Monday to see the clash; a Tuesday for dance |
| `--from` / `--to` | `06:00` / `20:00` | Local wall clock |
| `--step` | `5` | Minutes per tick. 5 matches production |
| `--traffic-spike HH:MM` | off | Raises the mock drive time and invalidates the cache |
| `--spike-factor` | `2` | How much worse traffic gets |
| `--household <id>` | first | When you have more than one |
| `--keep-dispatches` | off | Don't reset — test deduplication |
| `--allow-real-sends` | off | Actually deliver. Be sure |

### Days worth simulating

- **Monday 2026-08-24** — Ravi has both the design review and pickup. The clash.
- **Tuesday 2026-08-25** — pickup falls to an external carpool parent, so there
  is deliberately *no* leave time for it, and the brief says why. Dance class in
  the evening drives the confirmation ladder: ASK → REMIND → ESCALATE.
- **Saturday 2026-08-22** — soccer only. A quiet day should look quiet.
- **Sunday 2026-08-23** — nothing. Should print "Nothing scheduled that day."

---

## 5. The real loop

```bash
export DAYOS_TICK_SECRET=$(openssl rand -base64 32)
curl -X POST localhost:3000/api/day/tick -H "x-dayos-tick-secret: $DAYOS_TICK_SECRET"
```

Returns a count of briefs, departure alerts, re-timings and escalations, plus
any errors. Without the secret set the route returns 503 and nothing is ever
sent — an endpoint that can message an entire user base is not something to
leave open in a misconfigured environment.

In production, point the Railway scheduler at this every 5 minutes. Five is the
right cadence: the DRIVE_NOW window is five minutes either side of the
departure, so a 5-minute tick can never step over it, and anything faster mostly
re-reads a cached estimate.

To test real delivery, add a Telegram channel by hand and set
`TELEGRAM_BOT_TOKEN`:

```sql
UPDATE "MemberChannel" SET channel = 'TELEGRAM', address = '<your chat id>'
WHERE "memberId" = '<your member id>';
```

Then `npm run dayos:simulate -- --allow-real-sends` and watch your phone. Use
`--from`/`--to` to narrow it to one hour first — a full simulated day is about
ten real messages.

---

## Without a Maps key

Everything works. `routing.ts` falls back to a MOCK provider that returns a flat
20 minutes, every leave time is labelled as an estimate, and the Today page says
so at the bottom. Set `GOOGLE_MAPS_API_KEY` when you want real traffic; nothing
else changes.

`DAYOS_MOCK_TRAVEL_MINUTES` overrides the mock answer, which is what makes the
re-timing path testable without a paid key. It is ignored whenever a real key is
set.

---

## What the simulator has already caught

Worth recording, because all three were invisible to the unit suite and would
have been found by a family instead:

**The tick could never bootstrap a departure.** Occurrences were selected for
re-pricing by `leaveAt` — which is null until a refresh computes one, so the
refresh never ran and every trip sat at "no travel estimate yet" forever. Now
selected by start time, which is a superset and can select a trip that has never
been priced.

**The parking buffer was dropped when messages were re-rendered.** `leaveAt` is
computed with the activity's arrival buffer *plus* the destination's parking
buffer; the brief and the reminders recomputed with only the first, and quoted
leave times eight minutes apart for the same school run. Both now rebuild the
plan from what was stored, via `planFromOccurrence()`.

**Re-timing never fired for anything mentioned in the brief.** The "what were
they last told" check read the travel time back out of the last message's text —
but the morning brief covers every trip of the day in one message anchored to a
single occurrence, so every other trip had nothing to read. Replaced with an
explicit `lastToldTravelMinutes` column.
