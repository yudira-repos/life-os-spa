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
TravelOS/FinancialOS real business logic · extra hardening for
Health/Financial data (must happen before real health/financial data is
entered — HealthOS and FinancialOS need explicit, stronger access
controls than the rest of LifeOS before they're real).

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
src/components/shell/AppShell.tsx — nav, rendered from the module registry
src/components/kidsos/            — child sub-nav, practice session UI, activity/career toggles
src/app/(shell)/app/kids/         — KidsOS: overview + per-child Today/Study/Practice/Activities/Careers/Progress
src/app/(shell)/                  — everything behind auth+household (Home, modules, Settings, Subscription)
src/app/sign-in/, onboarding/     — everything before a household exists
```

## Next slices (not this one)

Real recommendation logic instead of static KidsOS/FunOS content, one
more module built out for real (PropertyOS or HealthOS), then a simple
Stripe checkout for "buy a module" once there's something worth paying
for.
