# DayOS — Architecture

> Who's doing what today, and when to leave.
>
> Companion to `DESIGN.md`, which covers the platform and the other five
> modules. Read that first; this document assumes its conventions.

## What this module is for

Every other LifeOS module answers a question about a horizon. FinancialOS
answers a decade, TravelOS answers a school year, PropertyOS answers the next
ninety days. DayOS answers the next four hours, and that changes what the code
has to be good at.

The product is one sentence a calendar cannot say:

> Ayuktha has dance at 5:00. You're down for it. Traffic is 27 minutes from the
> office, so leave at 4:23. I'll tell you again at 4:08, and if you can't do it
> I'll ask the carpool.

A calendar says *what is happening*. A family needs *what do I have to do, when
do I set off, whose turn is it, and does anyone else need to know*. Everything
below exists to answer those four.

## Where this module lives, and why not in the Python service

LifeOS today is two codebases. The Python repo (`LifeOS/`) is a Telegram-first
assistant: it already has Google/Microsoft/Apple calendar providers, a Maps
call, an APScheduler loop, morning briefs, "leave now" alerts, Slack and
Telegram outbound, and a Stripe tier. It knows how to *send*. The SPA
(`life-os-spa/`) owns the household: `Household`, `HouseholdMember` with
roles, entitlements, and four modules that already read from all of it.

DayOS needs both halves, and only one of them can own the data.

It is built here, in the SPA, because **the household model is the expensive
half**. Every question this module asks — whose turn, which child, which adult
can be told, who counts as an adult — is a query against `HouseholdMember`.
Rebuilding that in the Python service would mean two schemas of the same family
drifting apart, and the drift would show up as a reminder sent to the wrong
parent. The scheduler, by contrast, is a cron hitting one route.

What the Python service is *better* at is not the domain but the channel
plumbing — a live Telegram bot with a webhook and an inbound command parser.
The path forward there is stated in "The Telegram bridge" below: it becomes a
message transport DayOS calls, not a second source of truth about the family.

## The chain

```
recurring activity (weekday set + wall-clock time)
        -> occurrences for a day, materialized
        -> whose turn is it (rotation + covers + swaps)
        -> where is that person actually starting from
        -> how long is that drive, AT the departure time
        -> leave time, ready time, and a phase
        -> the right message, on a channel that can carry it
        -> confirmed, or escalated to someone who can
```

Each arrow is a file in `src/lib/dayos/`. The first six are pure — no database,
no network, no clock of their own — and are exercised by
`npm run verify:day` (80 assertions, no infrastructure).

| File | What it owns |
| --- | --- |
| `time.ts` | Wall-clock ↔ instant conversion in an IANA zone. DST correctness. |
| `recurrence.ts` | Weekday sets, effective windows, skips → the days a thing happens. |
| `rotation.ts` | Whose turn. Fixed-weekday and round-robin. Covers vs swaps. |
| `leave.ts` | Departure arithmetic, the phase machine, the re-timing threshold. |
| `origin.ts` | Where the responsible person is likely starting from, with confidence. |
| `brief.ts` | The morning brief, and the conflict scan behind it. |
| `escalation.ts` | The confirmation ladder: ask → remind → escalate → broadcast. |
| `routing.ts` | The only file that talks to a routing provider. Cache and honesty. |
| `notify.ts` | Channels, what each can actually do, send-exactly-once. |
| `service.ts` | The only file that touches Prisma. |
| `agent.ts` | The proactive loop. |
| `integrations.ts` | The entire cross-module surface. |
| `authz.ts` | Viewer / Coordinator. |

Two columns on `ActivityOccurrence` exist only to keep messages honest.
`arriveBy` records the buffer that was actually applied (the activity's plus the
destination's parking time), so every later message can rebuild the same
departure instead of recomputing a different one — see `planFromOccurrence()`.
`lastToldTravelMinutes` records what the household was last actually *told*,
which is what a re-timing alert has to compare against: a change nobody heard
about is not a change to them.

## Six decisions worth stating

These are the ones that would be expensive to change later, or that are wrong
in the obvious implementation.

### 1. A recurring activity stores a wall-clock time, never an instant

`Activity.startMinute` is minutes since local midnight. "Dance at 5 PM every
Tuesday" has to survive a daylight-saving change, and an instant does not — a
schedule stored as instants silently moves an hour twice a year, in the
direction that makes you late. The instant is resolved per occurrence, in the
household's zone, by `zonedTimeToUtc()`.

That function does not take the naive two-pass shortcut. It produces two
candidate instants, reads the wall clock back from each, and *verifies*. On the
spring-forward day the naive version resolves 2:30 AM to **1:30 AM** — an hour
*before* the requested time, which is the dangerous direction. Ours resolves
forward to 3:30, like every calendar app. On the fall-back day, when 1:30
happens twice, it takes the earlier. Both are asserted in the suite.

### 2. Travel time is solved *at* the departure, not at "now"

This is the bug every first version of this feature ships with, including the
one in the Python service today, which calls `get_travel_time(home, location)`
with the current time for an event up to two hours out.

Travel time depends on when you leave; when you leave depends on travel time.
`solveDeparture()` closes the loop: estimate, compute a departure, re-estimate
*for that departure*, repeat until it stops moving — capped at three provider
calls, and it reports `converged: false` rather than pretending when a traffic
cliff makes it oscillate. Asking about current traffic at 3 PM for a 5 PM
departure is routinely fifteen minutes wrong in the wrong direction.

### 3. A cover and a swap are different operations

"Divya is taking her today" and "swap my Wednesday with Divya" look the same in
a naive schema — one nullable override column — and collapsing them is how a
rotation quietly becomes unfair. A **cover** is one-directional: someone does
your turn and you still owe it. A **swap** is two records exchanging two dates,
so both turn counts stay level.

`debtFor()` reports the resulting imbalance, which is what lets the agent say
"Divya has covered for you twice this month" instead of letting it accumulate
until somebody is annoyed. A carpool that feels unfair stops being a carpool.

### 4. A conflict is computed from the departure, not the event

One person, two commitments, and the interval that matters is
`[leaveAt, endAt]` — not `[startAt, endAt]`. A 3:15 pickup with a 25-minute
drive occupies a parent from 2:50, so a meeting ending at 3:00 is *already* a
clash even though no calendar in the world shows an overlap. Comparing event
times is exactly the check a calendar already does, and exactly the one that
misses this. It's the flagship assertion in the verification suite.

### 5. An inferred origin says that it is inferred

Routing from Home when the responsible parent is at the office produces a leave
time that is confidently, uselessly wrong — and one wrong "drive now" is enough
for someone to stop trusting the next fifty. `resolveOrigin()` returns a
confidence with every answer:

- `CHAINED` — they have an earlier commitment today ending too close to this one
  to have got home. The only branch that actually *knows* something.
- `SCHEDULE` — a weekday inside their stated working hours, with a work address
  on file. A guess, and labelled "assuming you're leaving from Work".
- `DEFAULT` — home.

The UI prints "(assumed starting point)" for the last two. Overstating this
would train people to ignore the warnings — the same reason TravelOS refuses to
call a KidsOS activity a hard conflict.

### 6. Alerts have a floor, a ratio, a cap — and one override

Same doctrine as PropertyOS's price-jump rule. A re-timing alert requires both
a 5-minute absolute change *and* a 15% relative one, because either alone cries
wolf: two minutes on a 12-minute school run is noise, two minutes on a
90-minute airport run is nothing. Routine updates are capped at two per trip.

The one thing that overrides all three: if the new estimate says the departure
has **already passed**, it sends. Staying quiet there to respect a rate limit
would be the single worst thing this engine could do.

## Data model

```
DayPreferences   (householdId, timeZone, briefMinute, ladder timings, proactiveEnabled)
MemberDayProfile (memberId, homePlaceId, workPlaceId, workWeekdays, workStart/End)
Place            (householdId, kind, label, address, geocode, parkingBufferMinutes)
ExternalContact  (householdId, name, channel, channelAddress)   -- the other carpool parents
MemberChannel    (memberId, channel, address, isPrimary, quiet hours)
CoordinationGroup / CoordinationGroupMember                      -- a carpool, the family
Rotation         (householdId, groupId?, kind[FIXED_WEEKDAY|ROUND_ROBIN], anchorDay)
RotationSlot     (rotationId, weekday?, orderIndex, memberId? | contactId?)
AssignmentOverride (rotationId, day, kind[COVER|SWAP], assignee, replaced, swappedWithDay?)
Activity         (householdId, name, subjectMemberId?, placeId?, startMinute, weekdays,
                  effectiveFrom/To, travelRequired, buffers, rotationId?, requiresConfirmation)
ActivitySkip     (activityId, day)
ActivityOccurrence (activityId, day, startAt, responsible, origin, travelMinutes,
                    leaveAt, phase, confirmationState, escalationsSent)
TravelEstimate   (household, originKey, destKey, weekday, 15-min bucket, minutes, quality)
NotificationDispatch (occurrenceId, kind, recipient, status, body)  -- unique, written first
```

Three shapes in there are load-bearing.

**Occurrences are materialized, one row per activity per day.** Computing the
day on the fly would be cheaper, but an occurrence is where a *human decision*
lands — who confirmed, who covered, what was sent — and those cannot live in a
projection that gets recomputed. `materializeDay()` is idempotent and will
never overwrite an answered confirmation or a hand-set responsible person;
everything else is a derivation and tracks its inputs.

**Anyone assignable is a member *or* an external contact.** Every assignment
field is a nullable pair with exactly one side set, namespaced as
`member:<id>` / `contact:<id>` by `assigneeKey()`. Refusing to model the other
carpool parents because they have no LifeOS login would make the carpool
feature useless.

**A dispatch row is written before the send is attempted**, under a unique key
of (occurrence, kind, recipient). A worker that ticks every few minutes and
crashes mid-send must not be able to deliver the same "drive now" twice — a
duplicate urgent message is not a cosmetic bug, it teaches people the alerts
are noise.

## Channels: the capability table is part of the interface

The PRD asks for Telegram, WhatsApp, iMessage, SMS, email and push behind one
notification service. The abstraction is right; a registry that pretends the
six are equivalent is worse than none, because it lets the product promise a
family a WhatsApp reminder that will never arrive.

| Channel | Automatable today | Buttons | Notes |
| --- | --- | --- | --- |
| Telegram | Yes | Yes | The best channel. Bot API, inline keyboards, inbound replies. |
| Email | Yes | No | Fine for the brief, too slow for a 12-minute warning. |
| SMS | Yes | No | Instant, costs per message. Right for a grandparent. |
| In-app | Yes | Yes | Always available; only seen if someone opens LifeOS. |
| Push | **No** | Yes | Needs a mobile client that doesn't exist yet. |
| WhatsApp | **No** | Yes | Business Platform + pre-approved templates. A procurement lead time, not a sprint task. |
| iMessage | **Never** | No | Apple exposes no send API. Recorded as a preference so the UI can say "you'll forward this" — never silently dropped. |

`CHANNEL_CAPABILITIES` in `notify.ts` is read by the sender *and* by the UI, so
a member picking an unsendable channel is told at that moment rather than at
3:15 on a Tuesday.

## The proactive loop

`POST /api/day/tick`, hit by the platform scheduler every 5 minutes, calls
`tickAll()`. Five minutes is the right cadence: the DRIVE_NOW window is five
minutes either side of the departure, so a 5-minute tick can never step over
it, and anything faster mostly re-reads a cached estimate.

Three properties, enforced in `agent.ts` rather than left to the caller:

- **Opt-in.** `proactiveEnabled` defaults to `false`. A household discovers
  this feature by turning it on, never by being messaged at 6:55 AM by software
  it was still evaluating.
- **Idempotent.** Nothing is tracked in memory. The dispatch unique key is the
  only truth about whether a message went out.
- **Short-sighted on purpose.** Only departures within 150 minutes are
  re-priced. A routing estimate for tonight, taken this morning, is worth
  nothing and costs money.

The route refuses to run at all unless `DAYOS_TICK_SECRET` is set.

## Access control

Two tiers, same shape as TravelOS and PropertyOS, but the line is drawn
somewhere different and it's worth saying why.

**Viewer** is any household member, children included. The day's schedule is
the most legitimately shared information on the platform; a twelve-year-old
should be able to see that Mum has pickup and the car leaves at 2:58. Hiding it
produces exactly the phone call this module exists to prevent.

**Coordinator** (OWNER/ADULT) is required to change who is responsible, edit a
rotation, or message anyone outside the household. The split is not money this
time — there is none here — it is the ability to commit another adult's
afternoon and to message people who never signed up for LifeOS. A child
reassigning the school run is a family problem; a child triggering a broadcast
to four other parents is someone else's problem, and it is ours to prevent.

One deliberate exception: the person a job is assigned to can always confirm or
decline it, whatever their role. "Decline" is the answer we most need people to
feel free to give, because the alternative is a silent no.

## Cross-module

`integrations.ts` is the entire surface, one-directional, and every call
degrades to nothing when the other module isn't entitled.

- **TravelOS** — no-school days from CONFIRMED school calendars, so DayOS never
  sends "leave now for pickup" on a teacher in-service day. Only CONFIRMED
  counts: skipping a real pickup because a model misread a PDF is worse than
  the alternative. Also confirmed trip dates, so a family in Hawaii isn't
  reminded about the school run.
- **KidsOS** — children's ACTIVE activities, as a setup *prompt* only. Those
  rows carry no schedule, so presenting one as a known commitment would mean
  inventing a time, which is the worst output this module could produce.

## What is deliberately not here

- **No RFC 5545 RRULE.** Every activity this module coordinates is "these
  weekdays, between these dates, except when school is out". RRULE's
  monthly-by-set-position machinery buys nothing and costs a parser, an
  expander, and a class of bugs where a reminder fires on a day nobody
  expected. Genuinely one-off things are single-date activities.
- **No language model in the loop.** The brief is composed as *structure* and
  rendered per channel; the facts — who, when, where, leave by — are computed,
  never generated. A hallucinated pickup time is worse than no brief. An LLM
  rewriting the brief's tone is a fine later addition, on FinancialOS's
  `explain.ts` precedent: the rules decide, the model only rewrites the why.
- **No two-way calendar sync yet.** Reading Google Calendar into activities is
  the next milestone (see the backlog); writing back is not, because a bug that
  edits a user's real calendar is unrecoverable.

## The Telegram bridge

The Python service already runs a live Telegram bot with a webhook and an
inbound command parser. Rebuilding that in Next.js is waste. The plan is a
narrow, one-way contract:

1. DayOS calls the existing service's outbound endpoint instead of the Telegram
   API directly (`notify.ts`'s Telegram driver is the only file that changes).
2. Inbound Confirm / Can't-do-it taps POST back to
   `/api/day/occurrences/:id/respond` with a signed token.
3. The Python service stops keeping its own `User.home_address`,
   `brief_time` and family tables for anything DayOS covers, and becomes a
   transport.

Until that exists, `notify.ts` talks to the Telegram Bot API itself with
`TELEGRAM_BOT_TOKEN`, which works and is about forty lines.

## Verification

```
npm run verify:day        # 80 assertions, no database, no network
npm run dayos:seed        # a realistic household to look at
npm run dayos:simulate    # a whole day of the agent, in ten seconds
```

`DAYOS_TESTING.md` covers all four layers. The one worth knowing about is the
simulator: `tickHousehold()` takes its clock as a parameter, so a script can
walk a simulated day in 5-minute steps and print every message the loop would
send. It has already caught three bugs the unit suite could not see — a tick
that could never bootstrap a departure, a parking buffer dropped when messages
were re-rendered, and a re-timing check that never fired for anything the
morning brief had mentioned.

80 assertions, no database and no network, in the same style as the other three
suites. The cases it exists for:

1. A wall-clock time survives DST in both directions, including the hour that
   doesn't exist and the hour that happens twice.
2. The leave-time arithmetic matches the worked examples in the PRD (§9 and
   §20) to the minute.
3. Travel time is estimated *for* the departure, and an oscillating traffic
   curve terminates instead of looping.
4. A re-timing alert fires on a real change and stays quiet on noise — except
   when the departure has already passed, which overrides the send cap.
5. A swap keeps the rota level; a cover leaves a debt on the books.
6. A round robin is a pure function of the calendar and reproduces exactly.
7. Two commitments that don't overlap on the calendar still clash once travel
   is counted.
8. The confirmation ladder fires each rung once, in order, and stops dead on a
   confirmation.
