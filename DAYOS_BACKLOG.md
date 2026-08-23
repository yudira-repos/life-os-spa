# DayOS — Backlog

Decomposed from the Family & Daily Activity Agent PRD. Sized in the usual
S/M/L/XL. Status reflects this repo as of the DayOS foundation commit.

**Legend** — ✅ done · 🟡 partial · ⬜ not started

The ordering is not arbitrary. The MVP loop is
**activity → responsibility → travel → reminder → confirmation**, and each epic
below is placed so that the loop is closeable as early as possible. E5 is the
first point at which a family gets real value; everything before it is
scaffolding for that moment, and everything after it is widening.

---

## E1 — Foundations: time, recurrence, rotation ✅

The pure engines. No database, no network. Everything else depends on these
being right, and being right here is cheap to verify and expensive to retrofit.

| # | Story | Size | Status |
| --- | --- | --- | --- |
| E1.1 | Wall-clock ↔ instant conversion in an IANA zone, DST-correct in both directions | M | ✅ |
| E1.2 | Weekday-set recurrence with effective window, skip days, school-days-only | S | ✅ |
| E1.3 | Fixed-weekday and round-robin rotations, reproducible from the calendar | M | ✅ |
| E1.4 | Cover vs swap, with turn-debt accounting | M | ✅ |
| E1.5 | `npm run verify:day` wired into `npm run verify` | S | ✅ |

**E1.1 acceptance** — 5 PM in `America/Los_Angeles` resolves to 01:00Z in
January and 00:00Z in July. 2:30 AM on the spring-forward day resolves *forward*
to 3:30, not backward to 1:30. 1:30 AM on the fall-back day resolves to the
first of the two. All three asserted.

**E1.4 acceptance** — after a swap, every participant's `net` is 0. After a
cover, the coverer is +1 and the covered is −1. A swap between the same person
on both dates is refused rather than written.

---

## E2 — Domain: household, activities, places, contacts ✅

| # | Story | Size | Status |
| --- | --- | --- | --- |
| E2.1 | Prisma models for Place, Activity, Occurrence, Rotation, Contact, Channel, Dispatch | L | ✅ |
| E2.2 | `materializeDay()` — idempotent, never overwrites a human decision | M | ✅ |
| E2.3 | Assignee namespace covering both members and external contacts | S | ✅ |
| E2.4 | Viewer / Coordinator access control, with the responder exception | M | ✅ |
| E2.5 | Entitlement + module registry entry (`day`) | S | ✅ |
| E2.6 | Activity CRUD UI — create, edit, pause, skip a date | L | ⬜ |
| E2.7 | Place management UI, with geocoding on save | M | ⬜ |
| E2.8 | Carpool group + rotation editor (the weekly grid) | L | ⬜ |

**E2.2 acceptance** — running `materializeDay` twice produces the same rows.
An occurrence whose `assignmentSource` is `MANUAL`, or whose confirmation is
`CONFIRMED`, keeps its responsible person across a re-run.

**E2.6 is the largest remaining gap to a usable product.** The engines and the
API exist; there is no way for a person to enter an activity without a database
client. This is the next thing to build.

---

## E3 — Travel: routing, origin, leave time ✅

| # | Story | Size | Status |
| --- | --- | --- | --- |
| E3.1 | Distance Matrix provider with departure-time pricing, cached per 15-min bucket | M | ✅ |
| E3.2 | LIVE / TYPICAL / MOCK quality labelling, surfaced in copy and UI | S | ✅ |
| E3.3 | Departure fixed-point solver, bounded and honest about non-convergence | M | ✅ |
| E3.4 | Origin inference with confidence, chained from earlier commitments | M | ✅ |
| E3.5 | Re-timing threshold: absolute floor, ratio floor, send cap, past-departure override | M | ✅ |
| E3.6 | Multi-stop chaining (drop two children at two schools on one run) | L | ⬜ |
| E3.7 | Transit and walking modes | M | ⬜ |
| E3.8 | Weather buffer on the departure (the Python service already has this) | S | ⬜ |

**E3.1 acceptance** — no more than two provider calls per occurrence per
refresh. A second refresh inside the LIVE TTL makes zero calls. With no API key
the module returns MOCK and says so rather than failing.

**E3.6 note** — the Python service's `get_multi_stop_travel()` already solves
the routing half of this with optimized waypoints. The missing half is the
domain question: two children, two schools, one adult, one car — which is a
different kind of occurrence, not a longer drive.

---

## E4 — Messaging: channels, dedupe, quiet hours ✅

| # | Story | Size | Status |
| --- | --- | --- | --- |
| E4.1 | Channel registry with per-channel capability declarations | S | ✅ |
| E4.2 | Send-exactly-once via a dispatch row written before the attempt | M | ✅ |
| E4.3 | Telegram, email and SMS drivers | M | ✅ |
| E4.4 | Quiet hours, with an urgent-kind override | S | ✅ |
| E4.5 | "This member can't be reached" warning on the Today page | S | ✅ |
| E4.6 | Inbound Telegram replies mapped to Confirm / Decline | M | ⬜ |
| E4.7 | Bridge to the existing Python Telegram bot (see DAYOS.md) | M | ⬜ |
| E4.8 | WhatsApp Business templates — submit, get approved, wire up | L | ⬜ |

**E4.8 is a procurement task with a lead time, not a sprint task.** Template
approval takes days to weeks and gates the whole channel. Start the paperwork
before the sprint that needs it.

---

## E5 — The loop: brief, departure alerts, confirmation 🟡

The first epic that delivers the product. Everything above is scaffolding for
this moment.

| # | Story | Size | Status |
| --- | --- | --- | --- |
| E5.1 | Morning brief composed as structure, rendered per channel | M | ✅ |
| E5.2 | Conflict scan computed from departure time, not event time | M | ✅ |
| E5.3 | PREPARE and DRIVE_NOW phase messages, each sent once | M | ✅ |
| E5.4 | Traffic re-timing alerts | S | ✅ |
| E5.5 | Confirmation ladder: ask → remind → escalate → broadcast → uncovered | M | ✅ |
| E5.6 | `POST /api/day/tick`, secret-guarded, opt-in per household | S | ✅ |
| E5.7 | Scheduler wired on Railway at a 5-minute cadence | S | ⬜ |
| E5.8 | Settings UI for brief time, ladder timings, proactive on/off | M | ⬜ |
| E5.9 | Delivery log a household can actually read ("what did you send me?") | M | ⬜ |

**E5.7 is the gate on the whole module being real.** Everything else in E5 is
built and tested; nothing fires until something calls the tick route on a
schedule.

**E5.9 matters more than it looks.** The first question a family asks when a
reminder feels wrong is "what did it actually send, and when?". The dispatch
table already records it; it needs a page.

---

## E6 — Today dashboard 🟡

| # | Story | Size | Status |
| --- | --- | --- | --- |
| E6.1 | Today page: ordered day, responsibilities, departures, conflicts | M | ✅ |
| E6.2 | Confirm / Can't-do-it inline | S | ✅ |
| E6.3 | Reassign an occurrence, with the departure recalculated from the new person | M | ✅ |
| E6.4 | Week view, and a per-person "what am I down for" view | M | ⬜ |
| E6.5 | Family view: members, channels, rotations, fairness balance | M | ⬜ |
| E6.6 | Activities management view | L | ⬜ (= E2.6) |

---

## E7 — Calendar ingestion ⬜

The PRD's §5. Deliberately after the loop works: an activity typed by hand is
worth more than a calendar event nobody has decided anything about.

| # | Story | Size | Status |
| --- | --- | --- | --- |
| E7.1 | Google Calendar OAuth in the SPA, per member | M | ⬜ |
| E7.2 | Normalize events into a common internal shape | M | ⬜ |
| E7.3 | Promote a recurring event to an Activity, with a human confirming | L | ⬜ |
| E7.4 | Map free-text event locations onto Places, with review | M | ⬜ |
| E7.5 | Microsoft / Outlook | M | ⬜ |
| E7.6 | ICS subscription import | S | ⬜ |
| E7.7 | Apple Calendar (via ICS or app-specific password) | M | ⬜ |

**E7.3 acceptance** — no calendar event ever becomes a *responsibility* without
a person saying so. The DRAFT/CONFIRMED discipline TravelOS uses for school
calendars applies here for the same reason: an auto-created reminder on a
misparsed event is worse than no reminder.

**Reuse note** — the Python service already has working Google, Microsoft and
Apple providers plus a normalized event model (`calendar_providers/`,
`calendar_events.py`). E7.1–E7.2 and E7.5–E7.7 are a port, not a design.

---

## E8 — The agent ⬜

The PRD's §12 and §16: natural language in, structured responsibilities out.

| # | Story | Size | Status |
| --- | --- | --- | --- |
| E8.1 | Tool schemas over the DayOS service layer (the §16 list) | M | ⬜ |
| E8.2 | Read-only agent first: "who has pickup?", "when should I leave?" | M | ⬜ |
| E8.3 | Write tools behind a confirmation step | L | ⬜ |
| E8.4 | "Swap my Wednesday with Divya" → a real swap, not a cover | M | ⬜ |
| E8.5 | Conversational surface in the SPA | M | ⬜ |

**Sequencing rule for E8:** read-only tools ship first and stay first. A model
that can *answer* questions about the day is useful on day one and can't do
damage. A model that can silently reassign a school pickup is a different risk
class, and every write goes through a confirmation the household sees.

The tool layer is thin on purpose — every tool in §16 maps to a function that
already exists in `service.ts`. That's the point of having kept the engines
pure: the agent is a caller, not a second implementation.

---

## E9 — Hardening ⬜

| # | Story | Size | Status |
| --- | --- | --- | --- |
| E9.1 | Integration tests against a real database (materialize → plan → tick) | L | 🟡 |
| E9.2 | Rate and cost ceilings on the routing provider, per household per day | S | ⬜ |
| E9.3 | Structured logging on every dispatch decision, including suppressions | M | ⬜ |
| E9.4 | Timezone-per-member for a travelling parent | M | ⬜ |
| E9.5 | Backfill/repair job for occurrences after an activity is edited | M | ⬜ |

**E9.1** — `scripts/dayos-simulate.ts` covers the manual half of this: it replays
a whole day through the tick against a real database and prints every message.
What's missing is the assertions — turning "read the output and see if it looks
right" into a suite that fails on its own.

**E9.2 before any real user load.** The solver caps calls per occurrence, but
nothing caps a household with fifty activities and a broken cache.

---

## Suggested sequence

| Sprint | Contents | Outcome |
| --- | --- | --- |
| 1 | E2.6, E2.7, E2.8 | A family can enter their week without a database client |
| 2 | E5.7, E5.8, E4.6 | The loop actually fires, and can be tuned and answered |
| 3 | E6.4, E6.5, E5.9 | The dashboard is worth opening daily |
| 4 | E7.1–E7.4 | Google Calendar stops being typed in twice |
| 5 | E8.1, E8.2 | The agent answers questions about the day |
| 6 | E3.6, E9.1, E9.2 | Multi-stop, and safe under real load |

Sprint 1 and 2 together are the shortest path from here to a family using this
every morning. Everything in sprints 3–6 widens a loop that already works.
