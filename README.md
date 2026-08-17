# LifeOS

One account, one household, one LifeOS — Kids, Fun, Property, Health,
Travel, and Financial, all behind Google sign-in. This is V1: a small,
real, daily-usable slice of a much bigger platform spec. See
[`DESIGN.md`](./DESIGN.md) for the architecture and what's deliberately not
built yet.

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Start local Postgres + Redis**

```bash
docker compose up -d
```

This runs Postgres and Redis in Docker, matching what Railway provisions in
production (see [Deployment](#deployment-docker--railway) below). The app
itself still runs directly on your machine via `npm run dev` for a fast dev
loop — `docker compose` only brings up the two infra containers.

**3. Create a Google OAuth client**

Google Cloud Console → [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
→ **Create Credentials → OAuth client ID** → Application type: **Web application**.

- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
- If prompted to configure the OAuth consent screen first, choose **External**,
  fill in an app name/support email, and add yourself as a test user — you
  don't need Google's review to use it yourself.

Copy the generated **Client ID** and **Client secret**.

**4. Configure environment**

```bash
cp .env.example .env.local
```

Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET`
(generate one with `openssl rand -base64 32`). `DATABASE_URL` and
`REDIS_URL` are already set to match `docker compose up -d` above — nothing
else to configure for local dev.

For **FinancialOS**, two more:

```bash
# Required before any bank account can be linked. Without it the module
# refuses to store a Plaid access token rather than writing it in plaintext.
openssl rand -base64 32   # -> FINANCIAL_ENC_KEY
```

and Plaid credentials from <https://dashboard.plaid.com> → Team Settings →
Keys: `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV=sandbox`. In sandbox
you can link Plaid's test institutions with the credentials
`user_good` / `pass_good`.

Optionally set `ANTHROPIC_API_KEY` to enable the "Explain in plain English"
button on recommendations. It rewrites already-decided advice in warmer
language; without the key the module falls back to the rules' own wording and
nothing else changes.

For **TravelOS**, set `TRAVELPAYOUTS_TOKEN` — free and instant on signup at
<https://travelpayouts.com>, no approval needed. It supplies cached flight
prices (real fares seen in the last few days, not a live search, which is why
every price shows when it was last checked). The same `ANTHROPIC_API_KEY`
enables reading PDF and photo school calendars; `.ics` and `.csv` uploads work
without it.

**5. Set up the database**

```bash
npx prisma migrate deploy
```

**6. Run it**

```bash
npm run dev
```

Open `http://localhost:3000`, sign in with Google, create your household,
and you're in.

## What's here

- **Sign in with Google** (NextAuth) → creates a `User` row on first login.
- **Onboarding** → create a household, optionally add your first family
  member.
- **LifeOS Home** → a card per module, driven by `src/lib/modules.config.ts`
  (the module registry) — nothing hardcoded into the nav.
- **KidsOS** → real Studies (grade 3-6 curriculum across Math/Reading/
  English/Science/Social Studies, computed practice problems, mastery
  tracking, points/streaks/badges), Activities (a browsable catalog a
  family can mark interested/doing), and Career Paths (browsable career
  cards linked to school subjects). Set a child's grade and interests in
  Settings to unlock Studies. See DESIGN.md for what's ported from the
  real lifeos-kids product vs. net-new.
- **FunOS** → real, working, using a small curated static content set (not
  AI-generated yet — see DESIGN.md).
- **FinancialOS** → the second module built for real. Link bank accounts
  through Plaid (`/transactions/sync`, encrypted access tokens, webhook +
  manual sync), automatic categorization with rules you can override,
  income/expense/savings-rate tracking, recurring-charge detection, net
  worth, savings goals from templates (emergency fund, vacation, house
  down payment, college, funeral, car, wedding, new baby), and a
  deterministic advice engine that works the contribution waterfall in
  order — employer match, HSA, max the 401(k), Roth or Backdoor Roth, Mega
  Backdoor Roth, 529, taxable index funds — plus term-vs-whole-life,
  disability, umbrella, and estate basics. Every recommendation shows its
  arithmetic and its sources. There's also a Learn library of plain-language
  explanations for anyone who was never taught this. Access is restricted to
  OWNER/ADULT members and every access is audited; see DESIGN.md.
- **TravelOS** → upload each child's school calendar (.ics/.csv parsed
  exactly; PDF or a photo of the printed calendar read by a model, with
  every date reviewed by you before it counts), and it works out the
  stretches when the whole family is off at once — intersecting siblings'
  calendars, bridging weekends, subtracting blackout periods, costing the
  PTO each window needs, and flagging the expensive travel weeks. Pick a
  window and it suggests destinations that suit those dates and those kids'
  ages, prices real flights, and on confirmation creates a vacation savings
  goal in FinancialOS with a deadline a month before departure. It never
  books anything.
- **PropertyOS** → the bills and the upkeep. Tracks property tax (with
  California's two-installment schedule built in), insurance, utilities, HOA,
  warranty, gardener and pest control — and if FinancialOS is connected, finds
  the recurring home charges you're already paying and adopts them with the
  amount and cadence pre-filled. A maintenance catalog covers HVAC filters,
  water softener salt, drinking water filters, water heater flushing, gutters,
  dryer vents, smoke alarms, GFCI tests and smart-home firmware and batteries,
  with intervals that adjust for hard water, tree cover and dusty air. Plus a
  vendor book with service history and an equipment registry that tracks filter
  sizes, warranty expiry and how old things really are.
- **HealthOS** → registered as a real module with a real route and a real
  entitlement check, showing a "coming soon" / "locked" placeholder — proving
  modules can be added without rewriting the Shell.
- **Settings** → household name, family member list, add a member.
- **Subscription** → shows what's included, in plain language. No billing
  yet, on purpose.

Every module route checks its entitlement **server-side** — see
`src/lib/entitlements.ts` and how each `(shell)/app/*/page.tsx` calls
`isEntitled()` before rendering anything real. FinancialOS goes further and
also checks the member's role, because bank balances aren't household-wide
information the way a shared calendar is — see
`src/lib/financialos/authz.ts`.

FinancialOS, TravelOS and PropertyOS are not on the FREE plan. To turn them
all on for every household in your local database:

```bash
docker compose exec -T postgres psql -U lifeos -d lifeos -c \
"INSERT INTO \"Entitlement\" (\"id\",\"householdId\",\"moduleId\",\"enabled\")
 SELECT gen_random_uuid()::text, h.id, m, true
 FROM \"Household\" h, (VALUES ('financial'),('travel'),('property')) AS t(m)
 ON CONFLICT (\"householdId\",\"moduleId\") DO UPDATE SET \"enabled\" = true;"
```

## Deployment (Docker + Railway)

The app ships as a multi-stage `Dockerfile` (Next.js standalone output,
non-root user, migrations applied automatically on container start) and a
`railway.toml` that points Railway at it. One-time setup in the Railway
dashboard:

1. **New Project → Deploy from GitHub repo** → this repo.
2. **Add a Postgres plugin** to the project — Railway sets `DATABASE_URL`
   on the web service automatically.
3. **Add a Redis plugin** to the project — same thing for `REDIS_URL`.
   Nothing depends on Redis yet (see DESIGN.md); it's provisioned and
   health-checked, not on the critical path for anything today.
4. **Set these env vars manually** on the web service (see `.env.example`):
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`,
   `NEXTAUTH_URL` (the Railway-assigned or custom domain, e.g.
   `https://life-os-spa-production.up.railway.app`), plus the FinancialOS
   ones: `FINANCIAL_ENC_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`,
   and TravelOS's `TRAVELPAYOUTS_TOKEN`.
   Set `PLAID_WEBHOOK_URL` to the deployed domain so Plaid can push
   transaction updates — it can't reach localhost, which is why webhooks are
   inert in local dev and you sync with the button instead.

   `FINANCIAL_ENC_KEY` must be the same value everywhere and must not change
   after accounts are linked: rotating it makes existing Plaid tokens
   undecryptable and every household would have to re-link.
5. **Add that domain's redirect URI** —
   `https://<your-railway-domain>/api/auth/callback/google` — to the same
   Google OAuth client from setup step 3 above.

Railway auto-detects and builds the `Dockerfile` on every push to `main`.
`GET /api/health` checks both Postgres and Redis are actually reachable
(not just that the process started) and is wired as the deploy health
check in `railway.toml`.

To build and smoke-test the image locally before pushing:

```bash
docker build -t life-os-spa .
docker compose up -d   # postgres + redis, if not already running
docker run --rm -p 3000:3000 --network life-os-spa_default \
  -e DATABASE_URL="postgresql://lifeos:lifeos@postgres:5432/lifeos" \
  -e REDIS_URL="redis://redis:6379" \
  -e NEXTAUTH_SECRET="dev-secret" -e NEXTAUTH_URL="http://localhost:3000" \
  -e GOOGLE_CLIENT_ID="..." -e GOOGLE_CLIENT_SECRET="..." \
  life-os-spa
curl http://localhost:3000/api/health
```

## Verifying the engines

```bash
npm run verify           # all three suites
npm run verify:advice    # FinancialOS — 53 assertions
npm run verify:travel    # TravelOS — 40 assertions
npm run verify:property  # PropertyOS — 70 assertions
```

No database, no network, no API keys — the engines are pure functions, so the
whole chain can be asserted directly.

The FinancialOS suite checks the things that cost real money if they're
wrong: that the employer match is ordered ahead of credit card debt, that a
pre-tax IRA balance triggers the pro-rata warning before a Backdoor Roth is
recommended, that the Mega Backdoor Roth is never suggested without the plan
features that make it possible, and that the Roth phase-out and catch-up age
bands match the published 2026 figures.

The TravelOS suite checks the things that would send a family to the airport
on a school day: that an ICS `DTEND` is treated as exclusive, that a date
parses to the same day in every timezone, that two siblings' overlapping
breaks intersect to only the shared days, that PTO cost excludes federal
holidays, and that a blackout demotes a window with its reason shown rather
than hiding it.

The PropertyOS suite checks the things that make a maintenance list
trustworthy or useless: that completing a task late reschedules from the day
it was done rather than the day it was due, that seasonal tasks stay in their
season, that California's tax installments land on the right delinquency dates
(and that the gap between them is 3 months and 9, not 6 and 6), that a bill due
on the 31st clamps to February 28 instead of overflowing into March, and that a
price-jump alert doesn't fire on an $8 bill going to $11.

## Next steps (not built yet, see DESIGN.md)

Real recommendation logic instead of static content in KidsOS/FunOS, HealthOS
built out for real (adopting the FinancialOS access-control pattern), then a
simple Stripe checkout once there's something worth paying for. Three modules
now want a notification service and a shared calendar — see DESIGN.md.
