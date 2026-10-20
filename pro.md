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
table identically to a real Pro/Team subscriber. `tier` itself normally
stays `'free'` during a trial — except when the user has chosen to trial
Team specifically (see "Trial tier choice" below), which is the one case
where a trialing account's `tier` becomes `'team'` with no real
subscription behind it.

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
- **`TrialTierChoiceModal.tsx`**: shown once at the start of a trial, and
  reopenable via a "switch" link in the account panel — see "Trial tier
  choice" below.
- **Gated buttons throughout the UI** (`ProjectsListPage.tsx`'s "+ New Project",
  `ProjectDetailPage.tsx`'s "Upload new version") read `isPro` from
  `AccountStatusContext`, which — despite the name — is `accountStatus === "pro"`,
  not a raw tier check, so it's true for Pro, Team owners, and team members alike.
- **Landing page** (`LandingPage.tsx`): the pricing section and the "Subscribe to
  Pro" call-to-action that lands a signed-out visitor on `/login` and resumes
  checkout automatically once they're authenticated (`pendingCheckout.ts`).

## The 14-day trial

A free-tier signup gets full Pro-level access for 14 days, no credit card
required — and the 14 days start at the user's **first real upload** (a
version in a non-sample project), not at signup. Comparing versions is
episodic, so a signup without a file handy shouldn't burn their trial
before they have anything to compare. Implemented as day-math over one
derived view (`first_user_uploads`, migration 0040 — min `versions.created_at`
per user, excluding `is_sample` projects), no new table:

```ts
// apps/api/src/lib/subscription.ts
const TRIAL_DAYS = 14;
const PRE_UPLOAD_TRIAL_DAYS = 30;
function trialEndsAtMs(createdAt, overrideEndsAt, firstUploadAt) {
  if (overrideEndsAt) return ms(overrideEndsAt);                       // admin override wins verbatim
  if (firstUploadAt) return ms(firstUploadAt) + TRIAL_DAYS * DAY;      // clock started
  return ms(createdAt) + PRE_UPLOAD_TRIAL_DAYS * DAY;                  // clock not started yet
}
```

Until that first upload the clock hasn't started: the account is trialing
for up to `PRE_UPLOAD_TRIAL_DAYS` after signup (bounded so an account that
never uploads can't hold trial access forever), and `trialDaysRemaining`
reports the full `TRIAL_DAYS` rather than the pre-upload window.

`getAccountAccess()` calls this for any free-tier user (i.e. no active
subscription row) and returns `status: 'pro'` while `isTrialing` is true.
The admin users list, admin stats, and the "+days" extension endpoint all
use the same helpers (`computeTrialStatus`/`trialEndsAtMs`).
Both `GET /billing/subscription` and the Admin Users list expose
`isTrialing`/`trialDaysRemaining` from the same helper, so the sidebar
billing card, the pricing page copy, and the admin trial badge can't drift
on the day count.

**Why no new table.** A prior attempt at a trial (`20260101000013_user_trials.sql`,
a `user_trials` table + an `on_auth_user_created` trigger) was built and
then removed (`20260101000014_remove_trial.sql`) when Pro billing first
shipped. Computing the window from existing data (`auth.users.created_at`
and the `first_user_uploads` view over `versions`) instead means: no
backfill needed and no trigger to keep in sync with anything. Note the
first-upload change reopened a trial for lapsed accounts that never
uploaded anything and signed up within the last `PRE_UPLOAD_TRIAL_DAYS`.

**What happens after the trial ends.** The account falls through to the
same `restricted` status a canceled Pro subscription gets — read-only
access to what already exists (`GET` routes were never write-gated), no new
projects/comments/version-uploads. There is no separate "read-only mode"
implementation; trial expiry and subscription cancellation share one code
path.

## Trial tier choice

A trialing free-tier user can choose to trial **Team** instead of the
default Pro-level access — `TrialTierChoiceModal.tsx`, shown once
(localStorage-gated, same "shown once" convention as the Sample Project
tour) the first time a trialing user lands in the Projects workspace, and
reopenable anytime during the trial via a "switch" link in the account
panel (`ProjectsLayout.tsx`).

Unlike the admin overrides below, this is a **user's own choice**, not an
admin action, and it's a real functional unlock, not just different
copy: `getUserTier()` (`apps/api/src/lib/subscription.ts`) checks a new
`trial_tier_choice` table — existence = "chose Team" (there's no row for
"chose Pro"; that's simply the default/absence) — only while
`computeTrialStatus()` says the account is actually trialing. When it
applies, `getUserTier()` returns `tier: 'team'` with `row: null` and
`viaTrialChoice: true`; `getAccountAccess()` treats that as
`status: 'pro'` same as any trialing account, but keeps computing real
`isTrialing`/`trialDaysRemaining` for it (unlike a real Team subscriber,
who is never "trialing"). Every call site that reads `getUserTier()`
directly (`POST /teams`'s tier check, `GET /billing/subscription`) sees
`tier: 'team'` automatically — no special-casing needed anywhere except
`ProjectsLayout.tsx`'s `isBillingOwner`/`isTeamMember` display logic,
which explicitly excludes `viaTrialChoice` so a Team-trialing user isn't
shown "Manage Plan"/payment links for a subscription that doesn't exist.

Choosing Team for the first time also kicks off a short guided
walkthrough of team creation and roles (`TeamCreateSpotlight.tsx` →
`TeamDashboardTour.tsx`, tracked by `teamTour.ts`'s own localStorage
stage machine) before handing off to the existing Sample Project tour —
see [teams.md](teams.md) for that flow. Switching back to Pro just
deletes the `trial_tier_choice` row; there's no separate "cleared" state
to distinguish from "never chose."

## Admin overrides

Several more behaviors live in `subscription.ts`/`admin.ts`, all keyed off
either the same `ADMIN_EMAILS` env var that gates the `/admin/*` panel
(`requireAdmin.ts`'s `isAdminEmail()`), or an admin acting on someone
else's account from the Admin Users table:

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
- **Manually granted tier.** An admin can grant any account Pro or Team
  from the Admin Users table's tier selector (`PATCH
  /admin/users/:userId/subscription` → `adminGrants.ts`'s
  `setUserGrantedTier()`, backed by the `admin_granted_tier` table —
  existence = granted, `'free'` clears it). `getUserTier()` checks this
  *first*, ahead of a real Stripe subscription, so it's a floor a real
  subscription can't be undercut by, but the two never actually conflict
  in practice (an admin grant is for accounts with no real subscription).
  `row` stays `null` for a grant, same as a trial-tier choice — every
  caller already treats a null row as "nothing billing-related to show,"
  which is correct for both.
- **Trial extension.** An admin can push a specific account's trial end
  date out (or in) from the Admin Users table's `+7d`/`+30d`/`clear`
  buttons (`PATCH /admin/users/:userId/trial` → `trialExtensions.ts`'s
  `setTrialExtension()`, backed by the `trial_extensions` table). When
  present, `computeTrialStatus()` uses this date verbatim instead of the
  default `created_at + 14 days` — it can extend *or* shorten the window.
  Stacks with itself (a later `+7d` extends from whichever is later, now
  or the current effective end date) rather than resetting from today
  every time.

## Data model

```
stripe_customers     -- user_id -> stripe_customer_id
subscriptions         -- user_id (unique), tier ∈ {pro, team}, status, quantity, stripe_price_id
demo_accounts         -- user_id (PK) -- existence = flagged as a demo account, see "Admin overrides" above
admin_granted_tier    -- user_id (PK), tier ∈ {pro, team} -- existence = manually granted, see "Admin overrides" above
trial_extensions      -- user_id (PK), trial_ends_at -- overrides the default created_at + 14 days, see "Admin overrides" above
trial_tier_choice     -- user_id (PK), tier ∈ {team} -- existence = chose to trial Team, see "Trial tier choice" above
```

Key backend files:
- `apps/api/migrations/0012_stripe_billing.sql` — original Pro-only schema
- `apps/api/migrations/0017_team_billing.sql` — added the `team` tier value and
  `quantity` column (Team billing reuses this same table)
- `apps/api/migrations/0025_demo_accounts.sql` — the `demo_accounts` table
- `apps/api/migrations/0037_admin_granted_tier.sql` — the `admin_granted_tier` table
- `apps/api/migrations/0038_trial_extensions.sql` — the `trial_extensions` table
- `apps/api/migrations/0039_trial_tier_choice.sql` — the `trial_tier_choice` table
- `apps/api/src/routes/billing.ts` — checkout, Customer Portal, cancel/resume,
  `PATCH /billing/trial-tier`, and the webhook handler
  (`checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`)
- `apps/api/src/lib/subscription.ts` — `getUserTier()`, `getAccountAccess()`,
  `computeTrialStatus()` — the single source of truth for "what tier is this
  user" and "does this request have paid access"
- `apps/api/src/lib/demoAccounts.ts` — `getDemoUserIds()`, `setDemoAccount()`
- `apps/api/src/lib/adminGrants.ts` — `getAdminGrantsByUser()`, `setUserGrantedTier()`
- `apps/api/src/lib/trialExtensions.ts` — `getTrialExtension()`, `setTrialExtension()`
- `apps/api/src/lib/trialTierChoice.ts` — `getTrialTierChoice()`, `setTrialTierChoice()`
- `apps/web/src/components/TrialTierChoiceModal.tsx` — the Pro/Team trial-choice UI
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
