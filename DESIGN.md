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
domain event bus (`SCHOOL_HOLIDAY_CREATED` etc.) · shared calendar
aggregation across modules · centralized notification service · real AI
assistant / intent router · Stripe/billing · Apple/Microsoft/passkey
login · feature flags · observability pipeline · PropertyOS/HealthOS/
TravelOS real business logic · extra hardening for Health data (HealthOS
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
scripts/verify-advice-engine.ts   — 53 assertions against the advice engine, no DB (npm run verify:advice)
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
