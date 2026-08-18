# Teams

Meshdiff's Team tier ($35/seat/mo) turns a personal Projects workspace into a shared
one: multiple people on one subscription, role-based version review, and an audit
trail of who did what. This doc covers the concept, the roles/permissions model, and
how to set up and test Team billing locally.

See [CLAUDE.md](CLAUDE.md) for the full pricing table and the rest of the product
spec; this file is specifically about how Teams work under the hood.

## Concept

- **One subscription, one team, N seats.** A user subscribes to Team via Stripe
  Checkout, choosing a seat count (adjustable right there on Stripe's hosted page).
  That single subscription is capped to owning exactly one team — enforced at the
  database level (`teams.owner_user_id` is unique), not just in application code.
- **Seats are shared access, not per-user billing.** The owner pays; invited members
  get full product access via the owner's active subscription and pay nothing
  individually. This is the entire point of per-seat billing — if members still
  needed their own Pro subscription, nobody would ever buy more than one seat.
  Membership-derived access is resolved by a Postgres function,
  `has_active_team_access()`, checked whenever a user without their own paid
  subscription hits a gated route.
- **Team projects require review.** Uploading a new version to a project owned by a
  team leaves it `pending` until an admin or approver reviews it. Personal (Pro)
  projects auto-approve on upload — there's no team to review against. A decision
  isn't final: a version can be un-rejected or un-approved later if a reviewer
  changes their mind.
- **Everything is auditable.** Team creation, member invites/removals, and version
  approvals/rejections are all written to an append-only log, visible to every team
  member on the team's dashboard.

## Roles

| Role | Invite/remove members | Approve/reject versions | Notes |
|---|---|---|---|
| **Owner** | ✅ | ✅ | The Stripe subscriber. Always also an `admin` team_members row — there's no separate "owner" role for review purposes. Can't be removed. |
| **Admin** | ✅ | ✅ | Full management rights short of billing. |
| **Approver** | ❌ | ✅ | An "upgraded member" — reviews only, no invite/remove rights. |
| **Member** | ❌ | ❌ | Read access to the team's projects, roster, pending queue, and activity log. |

## Where it lives in the app

- **Sidebar** (`ProjectsLayout.tsx`): a "Teams" section lists the teams you belong to;
  clicking one navigates to its dashboard. The "+" button either opens the team
  dashboard's create form (if you're already the Team subscriber) or an upgrade
  prompt (`UpgradeToTeamModal.tsx`) that starts a real Stripe Checkout session.
- **Team dashboard** (`/teams/:teamId`, `TeamDashboardPage.tsx`): the home base for a
  team — seat usage, member roster with invite/remove, a **Pending Approvals** queue
  aggregated across every project the team owns (not just one project at a time),
  and an **Activity** feed of the audit log. A "Manage billing" button (owner only)
  opens the Stripe Customer Portal for seat/payment management.
- **Billing card** (`ProjectsLayout.tsx` sidebar footer): shows plan, renewal date,
  and Manage/Cancel controls for whoever the actual Stripe subscriber is (owner or a
  solo Pro user) — a team member riding someone else's seats sees "Access via your
  team's plan" instead, with no billing controls of their own.

## Data model

```
subscriptions        -- one row per paying user; tier ∈ {pro, team}, quantity = seats purchased
teams                 -- owner_user_id is UNIQUE (one team per Team subscription)
team_members          -- team_id, user_id, role ∈ {admin, approver, member}
team_audit_log         -- team_id, actor_user_id, action, summary (denormalized), created_at
```

`versions.approval_status` (`pending` / `approved` / `rejected`) plus
`reviewed_by_user_id` / `reviewed_at` / `rejection_reason` track the *current* review
state of a version; `team_audit_log` tracks the *history* of every review decision
(and every membership change), since the `versions` columns only ever hold the latest
reviewer.

Key backend files:
- `apps/api/migrations/0006_teams_and_approval.sql`, `0010_team_approver_role.sql` —
  teams/team_members schema, roles, RLS
- `apps/api/migrations/0017_team_billing.sql` — per-seat billing, one-team-per-owner
  constraint, `has_active_team_access()`
- `apps/api/migrations/0018_team_audit_log.sql` — the audit log table
- `apps/api/src/routes/teams.ts` — team CRUD, invites, seat-limit enforcement,
  pending-versions queue, audit-log read endpoint
- `apps/api/src/routes/versions.ts` — approve/reject (`canReviewVersions()`)
- `apps/api/src/lib/subscription.ts` — `getAccountAccess()`, the single source of
  truth for "does this request have paid access" (own subscription OR team
  membership)
- `apps/api/src/lib/priceCatalog.ts` — server-side price-ID → tier whitelist (never
  trust a client-supplied tier)
- `apps/api/src/lib/teamAuditLog.ts` — `logTeamAudit()`, the shared best-effort
  insert helper

## Setup

### 1. Stripe Dashboard — create the Team product

In the Stripe Dashboard (test mode for local dev, live mode for production):

1. **Products → + Create product** → name it "Meshdiff Team".
2. Add a recurring price: **Standard/Licensed pricing** (not metered — quantity is
   the seat count), monthly or annual to match your pricing page.
3. Copy the resulting `price_...` ID.

Seat count itself is **not** configured in the Dashboard — it's set programmatically
via Stripe Checkout's `adjustable_quantity` on the line item (see
`apps/api/src/routes/billing.ts`), defaulting to 5 and adjustable by the customer
right there on the Checkout page.

### 2. Enable seat self-service in the Customer Portal

Settings → Billing → **Customer portal** → expand **Subscriptions** → toggle on
**"Customers can change quantity of their plan"** → add the Meshdiff Team product to
the eligible list → Save. Without this, a team owner's "Manage billing" button opens
the portal but has no way to add/remove seats.

### 3. Environment variables

Add to `apps/api/.env` (see `apps/api/.env.example`):

```bash
STRIPE_TEAM_PRICE_ID=price_...   # the price ID from step 1
```

`STRIPE_PRO_PRICE_ID` must also be set (Team billing shares the same checkout
endpoint, gated by a `tier` field in the request body — see `priceCatalog.ts`).

### 4. Local testing (test mode, Stripe CLI)

Same webhook-forwarding setup the README already documents for Pro (see
[README.md § Stripe CLI](README.md#stripe-cli-local-webhook-testing)) — just make
sure `STRIPE_TEAM_PRICE_ID` in `apps/api/.env` is a **test-mode** price ID matching
whatever `STRIPE_SECRET_KEY` you're using (`sk_test_...` locally). Test-mode and
live-mode prices are entirely separate objects with different IDs, even for the
"same" product.

```bash
stripe listen --forward-to localhost:3001/billing/webhook \
  --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted
```

Then: sign in → sidebar "+" next to Teams → "Upgrade to Team" → complete Checkout
with `4242 4242 4242 4242` → sidebar should flip to "Team plan" within a few seconds
→ create a team → invite members up to your seat count (Supabase Studio or the
`auth.users` table is the fastest way to conjure test accounts locally without going
through real email confirmation).

## Options and edges worth knowing about

- **Lowering seat count never removes members.** If an owner drops their quantity
  below the current member count (via the Portal), existing members keep their
  access — only *new* invites are blocked until the team is back under the new
  limit. There's no auto-eviction.
- **Free/Pro users can go straight to Team.** Team billing doesn't require having
  Pro first; it's an independent Stripe subscription (`tier` is a single column, not
  stacked tiers), so the "+" button and upgrade modal work identically regardless of
  a user's current plan.
- **A canceled Team subscription revokes member access immediately** once Stripe's
  webhook marks the subscription `canceled` (or `past_due`) — `getAccountAccess()`
  re-evaluates on every gated request, there's no grace-period caching.
- **The audit log is append-only and denormalized.** Summaries (e.g. "Approved v3 of
  Bracket Mount") are written as plain text at insert time rather than reconstructed
  by joining against `projects`/`versions` at read time — so the log stays legible
  even after a project or version referenced in it is later deleted. Capped at the
  most recent 50 entries per team for now; no pagination yet.
- **Not yet built**: SSO, print result logging, and slicer profile snapshots are on
  the roadmap but out of scope for what's described here — see CLAUDE.md's pricing
  table for the full target feature set of the Team tier.
