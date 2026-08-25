# Pro

Meshdiff's Pro tier ($15/mo) unlocks the full Projects workspace for a single user —
persistent project workspaces, version history, comment pins, and PDF diff reports.
Every new free signup also gets a 14-day full-access trial of all of this before
paying anything. This doc covers the concept, what exactly is gated, and how to set
up and test Pro billing locally.

See [CLAUDE.md](CLAUDE.md) for the full pricing table and the rest of the product
spec, and [teams.md](teams.md) for the Team tier (per-seat billing, roles, shared
access) built on top of the same billing plumbing described here.

## Concept

- **One subscription per user.** Each Pro subscriber has exactly one row in
  `subscriptions` (`tier='pro'`), created/updated by the Stripe webhook handler.
- **New free signups get a 14-day full-access trial, no card required.**
  `getAccountAccess()` resolves a free-tier account to `status: 'pro'` for its
  first 14 days (computed on the fly from `auth.users.created_at`, no
  `trial_ends_at` column or cron job — see "The 14-day trial" below). After
  that it falls through to `restricted`, same as a canceled subscription.
- **The Sample Project is the exception.** Every new workspace is seeded with a
  read/write-but-not-uploadable Sample Project (`seedSampleProject.ts`) so a free
  user can see what a real project looks like — compare, delete, share, export a
  report, measure — before paying. Uploading a *new* version is Pro-only everywhere,
  including on the Sample Project; everything else on it is exempt from the paywall.
- **Team access counts as Pro access.** A user who isn't personally subscribed but is
  a member of an active Team subscription's roster gets the same unrestricted access
  a Pro subscriber gets — see `getAccountAccess()`'s `viaTeamMembership` check. Pro
  and Team share every gate described below; Team is additive (seats, roles, a team
  dashboard), not a separate access model.
- **Promo codes are Stripe Promotion Codes, not raw coupon IDs.** A coupon's `id` is
  an opaque token and its `name` isn't guaranteed unique/lookup-able, but a
  Promotion Code's `code` field is exactly the human-readable string that gets
  emailed or shown in the UI (e.g. a launch-offer code). `STRIPE_DEFAULT_PROMO_CODE`
  is auto-applied at checkout when the customer doesn't type one in themselves; a
  hand-emailed code (e.g. a special discount for a specific group) is entered
  manually via the same field and always takes priority.

## What's gated

| Action | Free (restricted) | Free, Sample Project | Trialing / Pro / Team |
|---|---|---|---|
| Sign in, view/delete own projects | ✅ | — | ✅ |
| View, compare, share, export PDF report, measure | ❌ | ✅ | ✅ |
| Create a new project | ❌ | — | ✅ |
| Upload a new version | ❌ | ❌ | ✅ |
| Create/join a team | ❌ | — | Team only (see [teams.md](teams.md)) |

A trialing free-tier account (see "The 14-day trial" below) resolves to
`status: 'pro'` from `getAccountAccess()`, so it passes every check in this
table identically to a real Pro/Team subscriber — there's no separate
"trial-tier" column anywhere in the gating code.

Enforced by two different checks, deliberately kept separate:
- **`requireActiveAccess.ts`** — the route-level gate. Blocks a restricted account
  from most of the API with 403 `subscription_required`, except what's explicitly
  left reachable so a restricted user can still see/delete their projects and
  actually subscribe: `GET /projects`, `DELETE /projects/:id`, `GET /workspace`, and
  all of `billing.ts`.
- **`requireProjectTierAccess.ts`** — the per-project, per-action gate, called after
  `getProjectAccess()` has already confirmed the requester has *some* role on the
  project. `requireProjectTierAccess()` carries the Sample Project exemption;
  `requireProUploadAccess()` (used only by the version-upload route) does not.

Both now call `getAccountAccess()` rather than checking `tier === "pro"` directly —
this is what makes Team ownership/membership transparently equivalent to Pro access
everywhere in the product, instead of needing a parallel set of Team-aware checks.

## Where it lives in the app

- **Billing card** (`ProjectsLayout.tsx` sidebar footer): plan label, renewal/cancel
  date, and Manage/Cancel/Resume controls for the actual Stripe subscriber. A
  restricted (free) account sees an "Upgrade" prompt here instead.
- **`UpgradeToProModal.tsx`**: the subscribe flow — shows an auto-applied default
  promo if one's active, a "Have a coupon code?" field for a manually-entered one,
  and starts a real Stripe Checkout session on submit.
- **Gated buttons throughout the UI** (`ProjectsListPage.tsx`'s "+ New Project",
  `ProjectDetailPage.tsx`'s "Upload new version") read `isPro` from
  `AccountStatusContext`, which — despite the name — is `accountStatus === "pro"`,
  not a raw tier check, so it's true for Pro, Team owners, and team members alike.
- **Landing page** (`LandingPage.tsx`): the pricing section and the "Subscribe to
  Pro" call-to-action that lands a signed-out visitor on `/login` and resumes
  checkout automatically once they're authenticated (`pendingCheckout.ts`).

## The 14-day trial

A free-tier signup gets full Pro-level access for their first 14 days, no
credit card required — implemented entirely as day-math, no new table:

```ts
// apps/api/src/lib/subscription.ts
const TRIAL_DAYS = 14;
function computeTrialStatus(createdAt) {
  const daysSinceSignup = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (daysSinceSignup < TRIAL_DAYS) return { isTrialing: true, trialDaysRemaining: ceil(TRIAL_DAYS - daysSinceSignup) };
  return { isTrialing: false, trialDaysRemaining: null };
}
```

`getAccountAccess()` calls this for any free-tier user (i.e. no active
subscription row) and returns `status: 'pro'` while `isTrialing` is true.
Both `GET /billing/subscription` and the Admin Users list expose
`isTrialing`/`trialDaysRemaining` from the same helper, so the sidebar
billing card, the pricing page copy, and the admin trial badge can't drift
on the day count.

**Why no new table.** A prior attempt at a trial (`20260101000013_user_trials.sql`,
a `user_trials` table + an `on_auth_user_created` trigger) was built and
then removed (`20260101000014_remove_trial.sql`) when Pro billing first
shipped. Computing the window from `auth.users.created_at` instead means:
no backfill needed (an existing free user's `created_at` is already >14
days old, so they're immediately `restricted` exactly as before this
feature shipped), and no trigger to keep in sync with anything.

**What happens after the trial ends.** The account falls through to the
same `restricted` status a canceled Pro subscription gets — read-only
access to what already exists (`GET` routes were never write-gated), no new
projects/comments/version-uploads. There is no separate "read-only mode"
implementation; trial expiry and subscription cancellation share one code
path.

## Admin overrides

Two more behaviors live in `subscription.ts`/`admin.ts`, both keyed off the
same `ADMIN_EMAILS` env var that already gates the `/admin/*` panel
(`requireAdmin.ts`'s `isAdminEmail()`):

- **Permanent access.** An admin account always resolves to `status: 'pro'`,
  `tier: 'team'` from `getAccountAccess()` — checked *before* the trial/team
  logic for a free-tier admin, so it's unaffected by trial expiry, having no
  subscription, or a canceled one. There's no "admin" row anywhere; it's
  purely an email-list check re-run on every request.
- **Demo accounts.** Any admin can flag another account as a "demo" account
  from the Admin Users table ("Mark demo" toggle → `PATCH
  /admin/users/:userId/demo`). This writes/deletes a row in `demo_accounts`
  (existence = flagged, no boolean column) and only affects the Admin
  dashboard's aggregate counts — `getAdminStats()`'s Total Users/Conversion
  Rate/Free-Trialing-Pro-Team breakdown and `getSignupBuckets()`'s trend
  chart all skip flagged user ids. The flagged account's own access,
  billing, and everything else about it is completely unaffected — this
  exists purely so seeded/test/showcase accounts don't skew what the
  dashboard reports about real users.

## Data model

```
stripe_customers     -- user_id -> stripe_customer_id
subscriptions         -- user_id (unique), tier ∈ {pro, team}, status, quantity, stripe_price_id
demo_accounts         -- user_id (PK) -- existence = flagged as a demo account, see "Admin overrides" above
```

Key backend files:
- `apps/api/migrations/0012_stripe_billing.sql` — original Pro-only schema
- `apps/api/migrations/0017_team_billing.sql` — added the `team` tier value and
  `quantity` column (Team billing reuses this same table)
- `apps/api/migrations/0025_demo_accounts.sql` — the `demo_accounts` table
- `apps/api/src/routes/billing.ts` — checkout, Customer Portal, cancel/resume, and
  the webhook handler (`checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`)
- `apps/api/src/lib/subscription.ts` — `getUserTier()`, `getAccountAccess()`,
  `computeTrialStatus()` — the single source of truth for "what tier is this
  user" and "does this request have paid access"
- `apps/api/src/lib/demoAccounts.ts` — `getDemoUserIds()`, `setDemoAccount()`
- `apps/api/src/lib/requireAdmin.ts` — `isAdminEmail()`, shared by the
  `/admin/*` panel gate and the permanent-access check above
- `apps/api/src/lib/priceCatalog.ts` — server-side price-ID → tier whitelist (CLAUDE.md's
  security rule: never trust a client-supplied tier or an unrecognized price ID)
- `apps/api/src/lib/requireActiveAccess.ts`, `apps/api/src/lib/requireProjectTierAccess.ts`
  — the two gates described above

## Setup

### 1. Stripe Dashboard — create the Pro product

In the Stripe Dashboard (test mode for local dev, live mode for production):

1. **Products → + Create product** → name it "Meshdiff Pro".
2. Add a recurring price (or two — monthly and annual, matching the pricing page's
   $15/mo / $144/yr).
3. Copy the resulting `price_...` ID.

### 2. (Optional) Set up a launch/promo code

**Products → Coupons** → create a coupon (percent or amount off, with a duration) →
**Promotion codes** tab → create a code pointing at that coupon. The `code` field
(e.g. `LAUNCH_501M`) is what goes in `STRIPE_DEFAULT_PROMO_CODE` — leave that env var
unset if you don't want a default discount auto-applied.

### 3. Environment variables

Add to `apps/api/.env` (see `apps/api/.env.example`):

```bash
STRIPE_SECRET_KEY=sk_test_...          # test mode locally, live in production
STRIPE_WEBHOOK_SECRET=whsec_...        # from `stripe listen` locally, the Dashboard's webhook endpoint in prod
STRIPE_PRO_PRICE_ID=price_...          # from step 1
STRIPE_DEFAULT_PROMO_CODE=LAUNCH_...   # optional, from step 2
```

### 4. Local testing (test mode, Stripe CLI)

Full walkthrough already in [README.md § Stripe CLI](README.md#stripe-cli-local-webhook-testing):
install the CLI, `stripe login`, forward webhooks with `stripe listen`, update
`STRIPE_WEBHOOK_SECRET`, restart the API, then sign in → Projects → "Subscribe to
Pro" → complete Checkout with `4242 4242 4242 4242` → sidebar should flip to "Pro
plan" within a few seconds.

## Options and edges worth knowing about

- **The Stripe `trialing` status is still unused.** `INACTIVE_SUBSCRIPTION_STATUSES`
  (`canceled`, `past_due`) are the only statuses treated as "not paying" —
  `trialing` and `incomplete` both count as active access, but nothing in this
  codebase creates a Stripe-side `trialing` subscription; the 14-day trial
  described above is a separate, no-subscription-row mechanism computed from
  signup date, not this column.
- **Cancel is end-of-period, not immediate.** `POST /billing/cancel` sets
  `cancel_at_period_end` rather than canceling outright, matching Stripe's own
  Portal cancel flow — the user keeps access through what they already paid for.
  `POST /billing/resume` undoes it before the period ends.
- **The webhook is the source of truth, not the checkout redirect.** The frontend's
  "success" redirect just triggers a short poll (`ProjectsLayout.tsx`'s
  `checkout=success` handler) waiting for the webhook to actually land and write the
  `subscriptions` row — Stripe's webhook can take a few seconds, so the UI shows
  "Activating your plan…" rather than assuming success immediately.
- **Price IDs are whitelisted, not trusted from the client.** `POST /billing/checkout`
  resolves the Stripe price to charge from `priceCatalog.ts` based on a `tier` field
  in the request, and the webhook resolves tier back from the price ID it receives
  from Stripe — an unrecognized price ID is refused rather than guessed at, so a
  stale test-mode price ID leaking into a production `.env` fails loudly instead of
  silently mis-tiering someone.
