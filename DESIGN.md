# LifeOS — Architecture (V1)

## Why this shape

The long-term vision is a full platform: Google/Apple/Microsoft SSO, a
household/family model, six-plus independently developed OS modules
(KidsOS, FunOS, PropertyOS, HealthOS, TravelOS, FinancialOS, and more
later), real micro-frontend deploys, an entitlements/billing system,
shared calendar, notifications, and a cross-domain AI assistant.

Building all of that before anyone uses it daily would mean months of
infrastructure for zero real usage in the meantime. So V1 is a
deliberately small **first slice**: architected so every later piece
(more modules, real entitlements, billing, a real microfrontend split,
an event bus) slots in without a rewrite, but scoped down hard to what
makes LifeOS genuinely useful today.

## Stack

- **Next.js (App Router) + TypeScript + Tailwind** — one app, one deploy.
- **NextAuth (Auth.js v4) with the Google provider**, JWT sessions. No
  Account/Session/VerificationToken tables — we only need "who is this
  Google user," which the `User` row already captures.
- **PostgreSQL via Prisma** (the new Prisma 7 client + `@prisma/adapter-pg`
  driver adapter, pure JS — no native query-engine binary to cross-compile
  for Docker/Alpine). Started as SQLite for zero-infra local dev; moved to
  Postgres everywhere (local via `docker compose`, production via
  Railway's managed Postgres) once deployment target was decided, so
  there's one migration history and one dialect instead of two diverging
  ones. `src/lib/db.ts` is the only file that knows about the driver
  adapter.
- **Redis**, provisioned and health-checked (`src/lib/redis.ts`,
  `GET /api/health`) but not used by any feature yet — same
  "registered, not deeply used" pattern as PropertyOS/HealthOS below.
  No feature reads/writes through it today, so there's no
  cache-invalidation correctness surface to get wrong for zero present
  benefit. Add real usage (session cache, rate limiting, background job
  queue) when a feature actually needs it.
- **Docker + Railway** for deployment — a multi-stage `Dockerfile`
  (Next.js `output: "standalone"`, non-root user, `prisma migrate deploy`
  run automatically on every container start) and `railway.toml`. Local
  dev runs the app directly (`npm run dev`, for fast reload) against
  Postgres/Redis started via `docker compose up -d` — the app itself is
  only containerized for the Railway deploy path, not for local dev. See
  the README's Deployment section for the one-time Railway dashboard
  setup (Postgres/Redis plugins, env vars, OAuth redirect URI).
- **Module boundary discipline instead of real microfrontends today.**
  Each OS lives in its own route folder, only talks to shared code
  through defined contracts (the module registry, the entitlement check,
  shared types), and never imports another module's internals. That's
  the same seam a real microfrontend split (Module Federation, separate
  deploys) would use later — we're just not paying for independent
  builds/deploys until there's a reason to (a second team, or a module
  that needs its own release cadence).

## Data model (intentionally minimal)

```
User            (id, googleId, email, name, image)
Household       (id, name, ownerId, plan default "FREE")
HouseholdMember (id, householdId, userId?, name, role[OWNER|ADULT|CHILD|GUEST], birthdate?, grade?, interests?)
Entitlement     (id, householdId, moduleId, enabled)
```

No `Product` / `Plan` / `Subscription` / `UsageLimit` tables yet. The
entire "licensing model" for V1 is a boolean per (household, module),
seeded on household creation: `kids=true, fun=true`, everything else
absent (locked). "Upgrade" is a static contact-us stub, not a payment
flow — see `src/app/(shell)/subscription/page.tsx`.

### KidsOS Studies (mastery, points, streaks, badges)

```
Mastery          (childId, subject, conceptCode, level 0-1, attempts)
PracticeSession  (childId, subject, conceptCode, correct, total, passed)
PointsEntry      (childId, reason, points)
Streak           (childId, currentDays, longestDays, lastActive, bonusPaidWeek)
EarnedBadge      (childId, badgeKey)
ChildActivity    (childId, activityKey, status[INTERESTED|ACTIVE])
ChildCareerInterest (childId, careerKey)
```

This is a deliberate, scoped port of the real `lifeos-kids` product
(`ai-learning-companion`), not a 1:1 copy. Ported faithfully: grade-scoped
concepts (3-6) with real prereq chains and standard codes
(`src/lib/kidsos/curriculum.ts`), computed (never LLM-predicted) math
problem generators (`problem-bank.ts`), tiered grading — exact match,
numeric/fraction equivalence, keyword credit (`grading.ts`) — and the real
product's point values, level thresholds, and a representative badge
catalog (`gamification.ts`). Deliberately NOT ported: billing/plan tiers,
real-money rewards/redemption, diagnostics/placement tests, district/admin,
COPPA-purge retention policy, campaign multipliers — none of that belongs
in a household platform (see "keep the licensing model simple" in the
product ask this was built from).

### FinancialOS

```
FinancialProfile   (householdId, filingStatus, stateCode, emergencyFundMonthsTarget,
                    riskTolerance, financialLiteracy, hasWill, highInterestDebt*)
EarnerProfile      (memberId, salary, bonus, plan features, IRA balance, HSA)
PlaidItem          (householdId, itemId, accessTokenEnc, cursor, status)
FinancialAccount   (householdId, plaidAccountId?, type, mask, balanceCents, visibility)
Transaction        (householdId, accountId, date, amountCents, categoryKey, categorySource)
CategoryRule       (householdId, matchField, matchType, pattern, categoryKey)
SavingsGoal        (householdId, templateKey?, kind, targetCents, monthlyContributionCents)
GoalContribution   (goalId, amountCents, occurredAt)
InsurancePolicy    (householdId, memberId?, type, coverageCents, annualPremiumCents)
RecommendationSnapshot (householdId, engineVersion, inputHash, payload)
ExplanationCache   (cacheKey, ruleId, text, model)
FinancialAuditLog  (householdId, actorUserId, action, resource, outcome)
```

Four decisions worth stating, because they're the ones that would be
expensive to change later:

**Money is integer cents, everywhere.** No floats, no decimal library.
`src/lib/financialos/money.ts` is the only place that converts. Int caps a
single row at ~$21.4M — documented, and fine for a household app.

**One sign convention, flipped once.** Plaid reports a grocery charge as
`+50` and a paycheck as `-2000`. That's inverted from how a person reads a
ledger, so `sync.ts` flips it exactly once on ingest: positive means money
in, everywhere else in the codebase. Every downstream total depends on that
happening once and only once.

**Transfers are not income or spending.** Moving $2,000 from checking to
savings is neither, and counting it as either is the most common way
budgeting tools produce numbers nobody believes. `TRANSFER` is its own
category group, excluded from every total. Money moved into a 401(k) or 529
counts as *saved*, not spent — otherwise a household that saves hard looks
like it's overspending.

**A user's category correction is permanent.** Setting a category by hand
marks the row `categorySource: "USER"`, and no sync ever overwrites it. A
correction that silently reverts is worse than no correction feature.

### FinancialOS: the advice engine

The recommendation engine (`src/lib/financialos/advice/`) is deterministic —
same inputs, same output, always. It reads published IRS constants from one
file (`constants.ts`, tax year 2026, every figure cited to its source) and
runs a set of pure rules against a context object assembled by `profile.ts`.
No rule hardcodes a dollar amount, so rolling the tax year forward is one
file.

The output order is the advice: employer match → HSA → max 401(k) → Roth or
Backdoor Roth → Mega Backdoor Roth → 529 → taxable index funds, with the
emergency fund and high-interest debt gating the front of it. Every
recommendation carries its reasoning (`why`), the arithmetic behind it
(`math`), and what would change the answer (`caveats`).

The two strategies people most often get wrong are gated on facts we ask for
rather than infer: the Backdoor Roth checks for a pre-tax IRA balance (the
pro-rata rule), and the Mega Backdoor Roth checks three specific plan
features. Where we don't know, the module says "ask your plan administrator
this exact question" instead of recommending something the user can't do.

`src/lib/financialos/explain.ts` is the only place a language model is
involved, and the boundary is strict: **the rules decide what to recommend;
the model only rewrites the why.** It receives an already-decided
recommendation and returns plainer prose, is cached by (rule, engine version,
inputs), validates that no dollar figure appeared that wasn't in the source,
and falls back to the rule's own wording if the key is missing or the call
fails. A model outage degrades tone, never substance.

`npm run verify:advice` exercises the engine against 53 assertions covering
the ordering, the phase-outs, the catch-up age bands, the pro-rata warning,
the Mega Backdoor gating, and determinism — no database, no network.

### FinancialOS: access control

This is the module DESIGN.md previously said needed "explicit, stronger
access controls than the rest of LifeOS before it's real". What that turned
into:

- **Adults only.** `requireFinancialAccess()` checks session → entitlement →
  OWNER/ADULT role, in that order. A CHILD member is a first-class LifeOS
  user with their own login and their own KidsOS data, and must never read a
  row from this module. There is no second path in; the module layout and
  every API route go through the same guard.
- **Encrypted provider secrets.** Plaid access tokens are AES-256-GCM
  encrypted before they touch the database (`crypto.ts`), with a version
  prefix so key rotation doesn't require decrypting everything at once. If
  `FINANCIAL_ENC_KEY` isn't set, linking is refused rather than storing a
  bank credential in plaintext.
- **Record-level visibility.** An account can be marked `OWNER_ONLY` so one
  adult's account isn't visible to the other. Applied as a Prisma `where`
  fragment on every account and transaction query, not filtered in the UI.
- **Audit log.** Every read and write is appended to `FinancialAuditLog`,
  including denials. It records the shape of an access (who, what action,
  which record) and never the content — no amounts, balances, account
  numbers, or merchant names. An audit log that copies the sensitive data
  it protects is a liability, not a safety feature.
- **Last four digits only.** Full account numbers are never stored, even on
  the manual-entry path.

Activities and Career Paths (`activities.ts`, `careers.ts`) are net-new —
confirmed absent from the real product, which has only a free-text
`interests` field. Static catalogs for V1; a family marks an activity
interested/active or bookmarks a career, no scheduling/matching yet.

## TravelOS

Plan trips around when the family can actually go. The chain is:

```
school calendar (.ics/.csv/PDF/photo)
        -> no-school days, reviewed by a human
        -> contiguous breaks per child
        -> intersect across children  <- the part you can't do by eye
        -> subtract blackouts, cost PTO, price the season
        -> ranked travel windows
        -> destinations that suit that window
        -> real cached flight prices
        -> a human confirms
        -> a trip + a funded FinancialOS savings goal
```

### The data model

```
TravelPreferences  (householdId, homeAirport, maxFlightHours, domesticOnly, budget, styles)
SchoolCalendar     (householdId, sourceType, status[DRAFT|CONFIRMED], extractionModel)
SchoolCalendarChild(calendarId, childId)  -- siblings share one calendar
SchoolCalendarEntry(calendarId, start, end, kind, noSchool, source, confidence, confirmed)
TravelAvailability (memberId, ptoDaysPerYear, ptoDaysRemaining)
BlackoutPeriod     (householdId, memberId?, start, end, reason)
TravelWindow       (householdId, start, end, totalDays, ptoDaysRequired, score, status)
FlightOption       (windowId?, tripId?, price, airline, bookingUrl, priceSeenAt)
Trip               (householdId, windowId?, destination, dates, savingsGoalId)
```

### Four decisions worth stating

**A date is a calendar day, not an instant.** Everything goes through
`dates.ts` and is stored at UTC midnight. A break starting "March 23" starts
on March 23 in every timezone. This is the single most common source of
off-by-one-day bugs in calendar code, and the verification script asserts
timezone stability explicitly.

**ICS `DTEND` is exclusive.** A one-day holiday on the 23rd is
`DTSTART=20270323, DTEND=20270324`. Treating that as inclusive adds a phantom
day to every break and produces vacation windows the school never gave you.
Handled once in `calendar/parse.ts`, asserted in the tests.

**Nothing extracted is trusted.** A calendar read from a PDF or a photo lands
in `DRAFT` with a per-entry confidence score and `confirmed: false`. It cannot
be confirmed while any entry is unreviewed, and only `CONFIRMED` calendars
feed the window engine. Editing an entry flips its source to `MANUAL`, so six
months later it's clear which dates a person actually checked.

**Prices are cached, and say so.** See the flights note below.

### The window engine

`src/lib/travelos/windows.ts` is pure — no database, no network. Same shape
and same reasoning as the FinancialOS advice engine: deterministic, every
output carries the reasons that produced it, and `service.ts` is the only
thing that touches Prisma.

The interesting step is the intersection. Two children at different schools
have overlapping-but-not-identical breaks, and the shared stretch is
routinely several days shorter than either parent assumed. Weekends count as
free for everyone (otherwise every break fragments at the weekend), but a run
containing no weekday is discarded — a weekend is not a travel window.

Scoring is stated in the code and shown in the UI: length, cost seasonality,
PTO cost (working days minus federal holidays, computed by rule rather than
listed so they don't expire), lead time, and conflicts. A blackout demotes a
window and prints the reason; it never silently removes it.

### Flights: a provider constraint, made visible

`src/lib/travelos/flights.ts` is the only file that talks to a flight
provider. It uses Travelpayouts' Aviasales Data API (`/aviasales/v3/...` —
the v1 endpoints are deprecated).

That choice was forced: Amadeus decommissioned its self-service API on
17 July 2026, and Kiwi and Skyscanner are partner-approval only. What remains
self-serve returns **cached** fares — real prices from recent searches, not a
live quote.

So the module never claims otherwise. Every `FlightOption` stores
`priceSeenAt`, the UI prints "cached fare, checked Nh ago", and booking links
send you to the airline to see the real number. **LifeOS never books
anything.** Presenting a two-day-old fare as bookable-right-now is the one
failure that would make the whole feature untrustworthy.

### Cross-module integrations

`src/lib/travelos/integrations.ts` is the entire cross-module surface — no
other file in TravelOS reaches into another module. Calls are one-directional
(TravelOS calls out; nothing calls in) and every one degrades to nothing if
the other module isn't entitled.

- **FinancialOS** — confirming a trip creates or updates a vacation savings
  goal with a real target date (a month before departure, because the trip
  gets booked before it happens). This closes the loop on "save for vacation":
  the deadline is a school break we detected, not a number someone guessed.
  Deleting a trip does **not** delete the goal — money set aside is still money
  set aside.
- **KidsOS** — windows are checked against children's ACTIVE activities. Those
  carry no dates, so this surfaces as "check the schedule", not a hard
  conflict. Overstating it would train people to ignore the warnings.
- **FunOS** — short windows get local ideas instead of flight prices.

This is the module that most wants a domain event bus. It doesn't have one
yet, and this file is what gets rewritten when it arrives.

### Access control

Two tiers, because the module holds two kinds of data. **Viewer** (any member,
including children) sees calendars, breaks and confirmed trips — a ten-year-old
should be able to see when spring break is. **Planner** (OWNER/ADULT) is
required for budgets, PTO balances, blackouts, flight prices, and anything that
touches a savings goal. Deliberately softer than FinancialOS: a bank balance is
not family information the way a school holiday is.

## PropertyOS

Running a house generates two streams of obligation — money out on a schedule
and work on a schedule — and both are easy to forget until something breaks or
a penalty lands. Everything in this module exists to make the next 30 days
visible.

```
Property        (householdId, state, assessed value, tax rate, + condition flags)
PropertyBill    (propertyId, category, cadence, typicalAmount, nextDue, detectedKey?)
BillPayment     (billId, amountCents, paidOn, transactionId?)
MaintenanceTask (propertyId, templateKey?, intervalDays, nextDue, seasonalMonths?)
MaintenanceLog  (taskId, completedAt, costCents, vendorId?)
Vendor          (householdId, trade, phone, rating, lastUsedAt)
Equipment       (propertyId, kind, isIot, installedOn, warrantyExpiresOn, filterSize, batteryType)
```

### The three decisions that matter

**Completion, not schedule, drives the next due date.** A 90-day filter change
due March 1 and actually done March 20 is next due June 18 — not May 30.
Anchoring to the due date leaves every late task permanently late, and a list
that's permanently red is a list people stop opening. This is asserted first in
the verification suite because it's the one that decides whether the module
gets used after week three.

**The house decides the list.** `catalog.ts` tasks carry conditions and
adjustments: no water softener, no salt reminder; hard water shortens the
softener, filter and water-heater intervals; wildfire smoke halves the air
filter; tree cover doubles gutter cleaning. The interval changes, rather than a
footnote nobody reads being appended.

**Seasonal is not interval.** "Clean the gutters before the rains" is a month,
not a spacing. Consecutive months (`[10,11]`) describe one window, so doing it
on October 5 schedules next October — while separated months (`[4,10]`)
correctly mean genuinely twice a year. A 60-day minimum separation is what
distinguishes the two.

### Bills, and where the state data stops

California's property tax schedule is modelled properly — two installments,
each with a nominal due date and a later delinquency date — because it's
unambiguous and verified against a county treasurer. The reminder uses the
**delinquency** date, since that's the one with a 10% penalty attached. The
installments are 3 and 9 months apart, not 6 and 6, which is why property tax
recurrence bypasses the generic cadence arithmetic.

Every other state ships as an editable default marked `verified: false`, and
states where the schedule is genuinely set locally (NY, PA, IL, and others) say
so and decline to guess. Property tax deadlines vary by county and the
aggregators that publish state-level tables disagree with each other;
presenting a scraped date as authoritative is how someone misses a payment.

Bill amounts flag a **price jump** only when a charge is 25% above its own
trailing average AND at least $25 higher in absolute terms. Percentage alone
fires constantly on small bills ($8 to $11 is +37%), and an alert that cries
wolf gets ignored.

### Detection: reading the bills you already pay

`detect.ts` reuses FinancialOS's existing recurring-charge detection and maps
known utility, insurance and service merchants onto bill categories, so a
homeowner adopts "PG&E, ~$284, monthly" with one click rather than typing
twelve bills. Detection produces **suggestions only** — an auto-created bill
with a wrong cadence produces confident reminders on wrong dates, which is
worse than no bill. Where the observed spacing doesn't map cleanly to a
standard cadence, the adopted bill says so instead of silently rounding.

It also names the gaps: essential categories with no bill and no detected
charge. Not seeing insurance or property tax usually means escrow or an
unlinked account — worth confirming rather than assuming.

### Equipment, including IoT

The registry answers the three questions nobody can answer when they need to:
what size is the filter, is it still under warranty, and how old is it really.
Each costs money when unanswered. `assessEquipment` reports age against a
typical service life — "past its life" means plan for it, not that it's broken
— and surfaces a warranty expiring within 90 days, which is the moment to raise
anything that's been not-quite-right.

IoT devices are treated as equipment with batteries and firmware rather than a
separate concept. The maintenance catalog carries firmware updates, sensor
battery checks (a leak detector with a dead battery is worse than none, because
you believe you're covered), and an annual review of who still has access.

### Access control

Two tiers, same shape as TravelOS. **Viewer** (any member) sees maintenance
tasks, equipment and vendors, and can mark a task done — whoever cleaned the
gutters should be able to log it. **Manager** (OWNER/ADULT) is required for
bills, amounts, payment history and cost rollups. The split is money again.

### Cross-module

`propertyos/integrations.ts` is the whole surface. Confirming the cost rollup
resizes the FinancialOS home maintenance goal from a rule-of-thumb placeholder
to a number derived from this house — a year of scheduled maintenance plus a
year of replacement reserve across the recorded equipment — with the derivation
written into the goal's notes.

## The module registry — the extensibility seam

`src/lib/modules.config.ts` is the one place that knows what OS modules
exist. The Shell's nav and the Home dashboard render *from this array*.
Adding a new module later (CareerOS, PetOS, whatever's next) means:

1. Add one entry to `MODULES` in `modules.config.ts`.
2. Add a route folder under `src/app/(shell)/app/<module>/page.tsx`.

Nothing in `AppShell.tsx` or the Home page needs to change — they already
iterate the registry. `status: "comingSoon"` modules are fully wired into
nav, registry, and entitlement checks today; they just don't have real
functionality behind them yet. That's how PropertyOS, HealthOS, TravelOS,
and FinancialOS work right now — proving the pattern before investing in
the business logic.

## Entitlements — checked server-side, not just hidden in the UI

Every module page calls `isEntitled(householdId, moduleId)` from
`src/lib/entitlements.ts` — a plain Prisma query — **before** rendering
any real content. The nav also greys out locked modules, but that's a
convenience, not the security boundary. Try hitting `/app/property`
directly while signed in with the default FREE plan: you get a "not
included in your plan yet" page, not the real module, even though you
typed the URL directly. That's the whole point of "never rely only on
hiding UI components."

## Auth flow

```
Sign in with Google (NextAuth)
        ↓
signIn() callback upserts a User row (googleId, email, name, image)
        ↓
jwt() callback resolves and caches the internal User.id on the token
        ↓
(shell) layout: getCurrentUser() + getCurrentHousehold()
        ↓
no user      -> /sign-in
user, no household -> /onboarding
user + household -> render Home / module / settings / subscription
```

Adding Apple/Microsoft/passkey providers later is a config change in
`src/lib/auth.ts` (add another provider to the array) — not a rewrite,
because NextAuth already abstracts the provider away from everything
else in the app.

## What's explicitly deferred

Real independent microfrontend deploys · multi-service backend split ·
domain event bus (`SCHOOL_HOLIDAY_CREATED` etc. — TravelOS is the first
module that would genuinely use one; see its integrations note below) ·
shared calendar aggregation across modules · centralized notification
service · real AI assistant / intent router · Stripe/billing ·
Apple/Microsoft/passkey login · feature flags · observability pipeline ·
HealthOS real business logic · extra hardening for Health data (HealthOS
still needs the stronger access controls FinancialOS now has, before real
health data is entered).

## File map

```
prisma/schema.prisma              — the whole data model
src/lib/modules.config.ts         — the module registry
src/lib/entitlements.ts           — the server-side gate every module calls
src/lib/auth.ts                   — NextAuth config (Google provider, JWT callbacks)
src/lib/session.ts                — getCurrentUser() / getCurrentHousehold()
src/lib/db.ts                     — Prisma client + Postgres driver adapter
src/lib/redis.ts                  — Redis client, provisioned but not yet used by any feature
src/app/api/health/route.ts       — Railway deploy health check: verifies Postgres + Redis are reachable
Dockerfile, docker-compose.yml,
railway.toml                      — see README's Deployment section
src/lib/seed-content.ts           — static FunOS content, and the pre-Studies age-band fallback KidsOS uses for kids without a grade set
src/lib/kidsos/                   — KidsOS Studies engine: curriculum, problem-bank, grading, gamification, progress (the one place that writes Mastery/PracticeSession/PointsEntry/Streak/EarnedBadge), activities & careers catalogs, authz
src/lib/financialos/              — FinancialOS: constants (IRS figures, one file per tax year), money (integer cents), crypto (AES-256-GCM), authz (the adults-only gate), audit, plaid (the only file importing the SDK), sync (the sign flip, idempotent upserts), categories/categorize, cashflow, profile, goals, learn, explain (the LLM boundary), advice/ (the rules engine)
src/app/api/financial/            — Plaid link/exchange/sync/webhook/unlink, accounts, transactions, rules, profile, earners, goals, insurance, recommendations, explain
src/app/(shell)/app/financial/    — FinancialOS: Overview, Accounts, Transactions, Cashflow, Plan, Goals, Learn, Setup (the layout is the module-wide adults-only gate)
src/lib/travelos/                 — TravelOS: dates (UTC calendar days), calendar/parse (ICS+CSV, no deps) & calendar/extract (PDF/photo via the model, everything unconfirmed), holidays (computed by rule), seasonality, windows (the pure engine), destinations (curated catalog), flights (the only file talking to a flight provider), integrations (the entire cross-module surface), authz (viewer vs planner), service (engine <-> database)
src/app/api/travel/               — calendar upload/review/confirm, windows, flight search, trip confirmation, preferences, PTO, blackouts
src/app/(shell)/app/travel/       — TravelOS: Windows, School calendars (+ per-calendar review), Trips, Settings
scripts/verify-advice-engine.ts   — 53 assertions against the advice engine, no DB (npm run verify:advice)
scripts/verify-travel-engine.ts   — 40 assertions against calendar parsing and the window engine (npm run verify:travel)
src/lib/propertyos/               — PropertyOS: catalog (maintenance templates with conditions and interval adjustments), schedule (completion-anchored due dates), bills (cadence math + state property tax schedules), detect (reads FinancialOS recurring charges), equipment (age/warranty/IoT), authz (viewer vs manager), integrations (the home maintenance fund), service (engines <-> database)
src/app/api/property/             — property, bills (+ adopt, pay), tasks (+ seed, complete, snooze), vendors, equipment, cost sync
src/app/(shell)/app/property/     — PropertyOS: Overview, Bills, Maintenance, Equipment, Vendors, Property
scripts/verify-property-engine.ts — 70 assertions against scheduling, bills, tax dates and equipment (npm run verify:property)
src/components/shell/AppShell.tsx — nav, rendered from the module registry
src/components/kidsos/            — child sub-nav, practice session UI, activity/career toggles
src/app/(shell)/app/kids/         — KidsOS: overview + per-child Today/Study/Practice/Activities/Careers/Progress
src/app/(shell)/                  — everything behind auth+household (Home, modules, Settings, Subscription)
src/app/sign-in/, onboarding/     — everything before a household exists
```

## Next slices (not this one)

Real recommendation logic instead of static KidsOS/FunOS content, one
more module built out for real (PropertyOS or HealthOS — HealthOS should
adopt the FinancialOS access-control pattern wholesale), then a simple
Stripe checkout for "buy a module" once there's something worth paying
for. Inside FinancialOS: a background job for scheduled syncs rather than
webhook-plus-button, investment holdings via Plaid's /investments
endpoints, and letting a household mark a recommendation as dismissed.
Inside TravelOS: hotel pricing, a packing/todo checklist per trip, and
subscribing to a school's ICS feed by URL so calendars refresh themselves
instead of being re-uploaded each year. Inside PropertyOS: automatic
matching of bill payments to bank transactions (the matcher exists in
integrations.ts but isn't wired to a scheduled job yet), photo attachments
on maintenance logs, and warranty document storage.

Three modules now want the same two things — a notification service and a
shared calendar. That's the strongest argument yet for building both, and
for the domain event bus underneath them.
