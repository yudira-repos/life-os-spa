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

**2. Create a Google OAuth client**

Google Cloud Console → [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
→ **Create Credentials → OAuth client ID** → Application type: **Web application**.

- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
- If prompted to configure the OAuth consent screen first, choose **External**,
  fill in an app name/support email, and add yourself as a test user — you
  don't need Google's review to use it yourself.

Copy the generated **Client ID** and **Client secret**.

**3. Configure environment**

```bash
cp .env.example .env.local
```

Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET`
(generate one with `openssl rand -base64 32`). `DATABASE_URL` is already set
to a local SQLite file — nothing else to configure.

**4. Set up the database**

```bash
npx prisma migrate deploy
```

**5. Run it**

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
- **PropertyOS / HealthOS / TravelOS / FinancialOS** → registered as real
  modules with real routes and real entitlement checks, showing a
  "coming soon" / "locked" placeholder — proving modules can be added
  without rewriting the Shell.
- **Settings** → household name, family member list, add a member.
- **Subscription** → shows what's included, in plain language. No billing
  yet, on purpose.

Every module route checks its entitlement **server-side** — see
`src/lib/entitlements.ts` and how each `(shell)/app/*/page.tsx` calls
`isEntitled()` before rendering anything real.

## Next steps (not built yet, see DESIGN.md)

Real recommendation logic instead of static content, one more module built
out for real, then a simple Stripe checkout once there's something worth
paying for.
