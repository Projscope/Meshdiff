# Project: Meshdiff— 3D Design Diff & Review Platform

## Identity
You are the principal engineer for MeshDiff, a web-based SaaS that helps hardware teams 
understand what changed between two versions of a 3D model and whether it will print 
successfully. Think "Figma for 3D diffs" plus "print traceability."

The core product is NOT a CAD editor. It is a review, comparison, and versioning layer 
that sits above any CAD or slicer output.

---

## Technical Architecture

### Stack (Non-Negotiable)
- Frontend: React 18 + TypeScript + Tailwind CSS
- 3D Viewer: React Three Fiber (@react-three/fiber) + Drei + Three.js
- Spatial Queries: three-mesh-bvh (for raycasting, distance fields, point sampling)
- Diff Engine: Custom voxelizer + SDF sampling. NO boolean mesh operations on arbitrary STL.
- Backend: Node.js + Express or Fastify
- Database: PostgreSQL (metadata, versions, comments) + S3 (mesh files)
- Auth: Clerk (do not build custom auth)
- Hosting: Render or Railway (no Kubernetes)

### Forbidden Technologies
- Do NOT use Manifold for arbitrary mesh boolean operations. It assumes clean CSG topology.
- Do NOT use CGAL directly in the browser (WASM bloat, licensing complexity).
- Do NOT use Rust for the backend unless explicitly asked. Boring Node.js ships faster.
- Do NOT build a custom geometry kernel. Use existing libraries or approximate.

---

## Core Philosophy: Geometry Engine Owns Truth, LLM Owns Prose

### The Golden Rule
Never ask an LLM to detect changes from raw mesh data. The geometry engine computes 
structured deltas; the LLM narrates them.

### Data Flow
1. User uploads Mesh A and Mesh B (STL, 3MF, OBJ)
2. Geometry engine produces `GeometricDeltaReport` (JSON schema defined in `/src/types/diff.ts`)
3. Renderer produces diff visualization (green=added, red=removed, heatmap=SDF distance)
4. LLM receives JSON + rendered image → outputs commit message / change summary
5. UI displays side-by-side viewer + comment pins + approval status

### GeometricDeltaReport Schema (Summary)
The engine MUST compute:
- Volume delta (mm³ and %)
- Bounding box delta per axis
- Hole inventory: count, diameter changes, additions, removals
- Wall thickness: min, max, thin-wall warnings (< 0.8mm for FDM)
- Overhang analysis: max angle, unsupported area, risk level
- Change regions: array of added/removed/modified regions with approximate location
- Printability gate: pass/warn/fail with specific issue tags
- Alignment metadata: method, confidence score

---

## Code Style & Quality

### TypeScript Rules
- Strict mode enabled. No `any` without a `// SAFETY: ...` comment.
- Prefer `interface` over `type` for object shapes.
- All mesh processing functions return a Result type: `{ success: true, data: T } | { success: false, error: string }`
- Never mutate Three.js geometry in place. Clone before modification.

### 3D Performance Rules
- All heavy computation (voxelization, SDF sampling, BVH building) runs in Web Workers.
- Use `InstancedMesh` for voxel visualization. Never create 10,000+ individual meshes.
- Diff renders must complete in < 3s for models under 50MB.
- Implement progressive loading: coarse voxel diff first, refine with SDF.

### API Design
- RESTful JSON. No GraphQL.
- File uploads use signed S3 URLs (direct-to-S3), not multipart through our server.
- Version IDs are ULIDs, not auto-increment integers.

---

## Feature Boundaries

### In Scope (MVP)
- Drag-and-drop STL/3MF/OBj upload
- Side-by-side 3D viewer with orbit controls
- Voxel-based diff with color coding (green/red)
- SDF heatmap for dimensional deviation
- Comment pins attached to 3D coordinates (raycast from click)
- Version timeline (linear history, no branching for MVP)
- Auto-generated change summaries via LLM
- Slicer profile snapshot per version (text upload, not parsed)
- Print result photo upload per version

### Out of Scope (Post-MVP)
- CAD plugins (Fusion, SolidWorks, Blender) — do not touch until v2
- True mesh merging / branching with conflict resolution
- Real-time multiplayer cursors
- Native mobile apps
- G-code simulation or toolpath visualization

---

## LLM Integration Rules

### Model Selection
- Default: Claude 3.7 Sonnet (best technical precision, follows structured output)
- Fallback: GPT-4o (if Claude is unavailable)
- Never use vision-only for change detection. Always pair with JSON report.

### Prompt Engineering
- System prompt defines the engineer persona and output constraints.
- User prompt includes: (1) JSON report, (2) base64 diff image, (3) explicit task.
- Temperature: 0.2 for commit messages (factual), 0.4 for design review summaries.
- Max tokens: 120 for commits, 300 for detailed reviews.

### Cost & Latency Guardrails
- Skip LLM call if volume delta < 0.5% AND no topological changes. Return: "Minor dimensional adjustment."
- Cache LLM responses by mesh hash pair. Same diff = same summary.
- Timeout LLM calls at 5s. Fallback to rule-based text from JSON.

---

## Domain-Specific Knowledge

### 3D Printing Constraints (FDM Focus)
- Minimum wall thickness: 0.8mm (2 lines at 0.4mm nozzle)
- Maximum overhang without supports: 45°–55° depending on cooling
- Minimum hole diameter: ~2mm (smaller fills with filament)
- Bridge length: ~20mm max without supports
- Tolerance for press-fit: 0.1–0.2mm interference
- Tolerance for clearance fit: 0.2–0.4mm gap

### File Format Behavior
- STL: Triangle soup, no units (assume mm), no color, no metadata. Most common.
- 3MF: Structured XML, units explicit, supports color/material, multiple meshes per file. Preferred.
- OBJ: Can have groups/materials, but often exported without normals.

### Alignment Strategy
- Primary: Centroid + principal component analysis (PCA) for rotation alignment.
- Fallback: Iterative Closest Point (ICP) if bounding boxes differ significantly.
- If alignment confidence < 0.85, flag UI with warning: "Comparison may be approximate."

---

## Testing Requirements

### Unit Tests
- Voxelization: known cube (10x10x10mm) → expect exact voxel count at 0.5mm resolution.
- Hole detection: synthetic cylinder with 5mm hole → detect diameter within 0.1mm.
- SDF sampling: two identical meshes → zero distance everywhere.

### Integration Tests
- End-to-end: upload v1 STL → upload v2 STL → diff renders within 3s → JSON report valid.
- LLM pipeline: mock JSON report → prompt produces text containing expected keywords.

### Visual Regression
- Diff renders must match reference images for 3 standard test models (bracket, gear, enclosure).
- Use pixelmatch threshold of 0.1 (anti-aliasing tolerance).

---

## Security & Privacy
- All file storage encrypted at rest (S3 SSE).
- User A cannot access User B's project IDs (Row-Level Security in Postgres).
- Do not store raw LLM prompts containing sensitive model data in logs.
- Sanitize filenames before S3 upload (strip path traversal, restrict to alphanumeric + dash).

---

## Error Handling Philosophy
- Fail gracefully, never crash the viewer.
- If mesh is corrupt/non-manifold: render what you can, show warning banner, allow manual alignment.
- If diff computation times out: show "Diff computation in progress..." with cancel button.
- Never show raw stack traces to users. Log them, show friendly message.

---

## Commit Message Convention
When generating code for this project, use conventional commits:
- `feat:` new user-facing feature
- `fix:` bug fix
- `perf:` performance improvement
- `refactor:` code change with no behavior change
- `test:` adding or updating tests
- `docs:` documentation only

Example: `feat(diff): add SDF heatmap visualization for wall thickness analysis`

---

## Repository Layout
```
Meshdiff/
  src/types/diff.ts    # GeometricDeltaReport schema — shared source of truth
  apps/web/             # React + TS + Tailwind + R3F frontend
  apps/api/              # Node.js (Fastify) backend
```

---

## Pricing Tiers — IMPLEMENTED (Stripe is live, this is not aspirational)

Auth is **Supabase Auth**, not Clerk — this doc's Identity/Stack section
above still says Clerk; that's stale, ignore it for anything billing/auth-
related. There is no custom `users` table — everything below hangs off
`auth.users(id)` directly.

| Tier     | Price (normal, post-launch-offer)   | Audience                       | Gate                                                                                                                          |
| -------- | ------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Free** | $0                                   | Hobbyists, evaluators           | Live Diff tool (`/live`) always. New signups also get a **14-day full-access trial** of the Projects workspace (see below), then fall back to the Sample Project only. Share-link limits are UI copy, not verified server-enforced as of this writing. |
| **Pro**  | $15/mo                               | Solo engineers, freelancers     | Project workspaces, version history, **comment pins**, PDF diff report export                                                  |
| **Team** | $35/seat/mo, quantity adjustable 1–50 at checkout (default 5) | Hardware startups, print farms  | Everything in Pro + version-approval workflow, slicer profile snapshots, print-result photo log, per-seat billing, audit log   |

Monthly billing only — **no annual/yearly price exists in code**, despite
older drafts of this doc implying one. A time-limited 50%-off "launch offer"
is implemented purely as a **frontend display toggle** keyed off
`LAUNCH_OFFER_DEADLINE` in `apps/web/src/lib/featureFlags.ts` — see
`apps/web/src/components/PricingCards.tsx`'s `getPricingTiers(offerActive)`.
It re-evaluates every render (piggybacking on the countdown's 1s tick) and
reverts both tiers to full price with no badge/reload needed once the
deadline passes. This is cosmetic only; it does **not** change what Stripe
actually charges — a real discount requires a Stripe Promotion Code (see
`STRIPE_DEFAULT_PROMO_CODE` below), which has its own independent expiry
that must be configured in Stripe itself.

**Comment pins are Pro, not Team-exclusive** — gated by `isPro` (see Feature
Gating Logic below), not by team membership. `VersionDetailPage.tsx` used to
gate the comment UI behind `project?.teamId`, which wrongly excluded
personal Pro projects; fixed to check `isPro` instead (three spots: the
toolbar's 💬 button, the 3D-scene comment pins/popovers, and the
`CommentsPanel` side panel).

**14-day free trial (no card, no new table)** — a free-tier signup gets full
Pro-level access (`status: 'pro'`) for their first 14 days, computed on the
fly from `auth.users.created_at` via `computeTrialStatus()` in
`apps/api/src/lib/subscription.ts` — there's no `trial_ends_at` column or
trigger (a prior attempt at this, `20260101000013_user_trials.sql`, was
built and removed in `20260101000014_remove_trial.sql`; this version avoids
reintroducing that table). Once the window closes, the account falls
through to the existing restricted/Sample-Project-only behavior with no
separate "read-only mode" to build — a lapsed trial and a canceled Pro
subscription land in exactly the same `status: 'restricted'` state. See
[pro.md](pro.md) for the full mechanism and what's exempt.

See pro.md's "Admin overrides" for two related, ADMIN_EMAILS-driven
behaviors layered on top of this: admin accounts get permanent access
regardless of trial/subscription state, and admins can flag any account as
a "demo" account to exclude it from the Admin dashboard's user-count
widgets.

---

## Stripe Setup

- Products/Prices: `Meshdiff Pro` and `Meshdiff Team`, one **monthly** recurring
  price each (no yearly price — see above). Team's price is per-seat;
  quantity is chosen on Stripe's own hosted Checkout page via
  `adjustable_quantity`, not a custom seat-picker in the app.
- **No Product ID env var is needed anywhere** — only the Price ID matters
  for Checkout line items. `STRIPE_PRO_PRODUCT_ID` appears as a commented-out
  note-to-self in `apps/api/.env` but is never read by any code; there is no
  `STRIPE_TEAM_PRODUCT_ID` at all. Don't go looking for one.
- Customer Portal enabled for self-service (update card, cancel, resume).
- Checkout: Stripe-hosted pages (`stripe.checkout.sessions.create`), not
  Elements.
- Env vars (`apps/api/.env`, see `.env.example` for the template):
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`,
  `STRIPE_TEAM_PRICE_ID`, `STRIPE_DEFAULT_PROMO_CODE` (optional, a Stripe
  *Promotion Code* — not a raw coupon ID), `FRONTEND_URL`. All billing code
  lives in `apps/api/src/routes/billing.ts`.
- **Production status (as of 2026-08-23)**: live webhook endpoint is
  Active at `https://meshdiff-api.onrender.com/billing/webhook`, correctly
  subscribed to exactly the 3 events the handler processes (see Webhook
  Events below). The live-mode `STRIPE_TEAM_PRICE_ID` was still a literal
  `<live-mode Team price ID, once created>` placeholder in the commented
  "Live credentials" block of `apps/api/.env` — **check whether that's been
  filled in before assuming Team checkout works in production.** Test-mode
  Team checkout (full flow: Checkout session → Stripe test card →
  `checkout.session.completed` webhook → `subscriptions` upsert) was
  verified working end-to-end locally via `stripe listen --forward-to
  http://localhost:3001/billing/webhook`.
- **CSP footgun (this bit us for real)**: `netlify.toml`'s
  `Content-Security-Policy` needs `googletagmanager.com` in **three**
  directives, not just `script-src`:
  - `script-src` — loads the `gtag.js` `<script>` tag itself.
  - `connect-src` — the Google tag's own internal remote-config fetches.
  - `img-src` — **the actual root cause of a real "GA4 shows zero data"
    incident**: gtag.js sends some hits as an `<img>` pixel beacon to
    `googletagmanager.com/a` and `/td` rather than fetch/XHR, and `img-src`
    is evaluated separately from `connect-src` for `<img>` loads. Missing
    it here silently drops the hit before it ever becomes a visible network
    request — `dataLayer` still populates, `gtm.load` still fires, Consent
    Mode still resolves correctly, everything *looks* healthy. Diagnosed
    via Google Tag Assistant's console log, the only tool (of several
    tried — Realtime, DebugView, Resource Timing, a direct Measurement
    Protocol curl test) that actually surfaces `img-src` CSP violations
    instead of just showing a healthy-looking pipeline with zero hits ever
    landing. The only visible symptom otherwise was GA4's own Admin → Data
    Streams panel saying "Data collection isn't active... No data
    received." All three directives now include it — don't regress any of
    them.

## Database Schema (PostgreSQL / Supabase) — actual, not aspirational

No `users` or `usage_limits` table exists. Real schema, spread across
`supabase/migrations/` (mirrored in `apps/api/migrations/`):

```sql
-- 20260101000012_stripe_billing.sql
stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  status text not null check (status in ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired')),
  tier text not null check (tier in ('pro','team')),        -- 'team' added in 20260101000017
  quantity int not null default 1,                           -- seats, added in 20260101000017
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one row per user_id (unique index), upserted by the webhook handler

-- 20260101000006_teams_and_approval.sql (+ 20260101000017_team_billing.sql)
teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,  -- unique: one team per owner
  created_at timestamptz not null default now()
);

team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','approver','member')),  -- 'approver' added in 20260101000010
  joined_at timestamptz not null default now(),
  unique(team_id, user_id)
);

-- 20260101000006: versions gained approval columns
alter table versions add column approval_status text not null default 'pending'
  check (approval_status in ('pending','approved','rejected'));  -- only 3 states, no "changes requested"
alter table versions add column reviewed_by_user_id uuid references auth.users(id);
alter table versions add column reviewed_at timestamptz;
alter table versions add column rejection_reason text;
alter table projects add column team_id uuid references teams(id) on delete set null;
-- team_id null = personal/Pro project (auto-approves on upload); non-null = Team project (needs review)

-- 20260101000025_demo_accounts.sql
demo_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Existence = flagged, no boolean column. An admin flips this per-user from
-- the Admin Users table; excluded from getAdminStats()/getSignupBuckets()'s
-- counts only — no effect on the account's own access. See pro.md.
```

`has_active_team_access(p_user_id uuid) returns boolean` (SQL function,
`security definer`, in `20260101000017_team_billing.sql`) — true if the user
is a `team_members` row whose team's owner has a `subscriptions` row with
`tier = 'team'` and `status not in ('canceled','past_due')`. This is how a
team member with **no subscription of their own** still counts as paid.

## Feature Gating Logic — actual code paths

Backend, `apps/api/src/lib/subscription.ts`:

```
getAccountAccess(supabase, userId):
  tier = getUserTier(userId).tier            // reads `subscriptions` directly
  if tier != 'free': return { status: 'pro', tier, viaTeamMembership: false, isTrialing: false }
  if isAdminEmail(user.email): return { status: 'pro', tier: 'team', ... }   // permanent, see pro.md
  trial = computeTrialStatus(user.created_at)                                // 14-day window, see pro.md
  if trial.isTrialing: return { status: 'pro', tier: 'free', ...trial }
  hasTeamAccess = rpc has_active_team_access(userId)
  return { status: hasTeamAccess ? 'pro' : 'restricted', tier: 'free', viaTeamMembership: hasTeamAccess }
```

`status === 'pro'` is the actual gate almost everything checks — it means
"Pro tier, OR Team subscription owner, OR team member riding the owner's
seats, OR within the 14-day trial window, OR an ADMIN_EMAILS account."
Never gate a feature on a raw `tier === 'pro'` string check; that wrongly
excludes Team owners, members, and trialing free users (`tier` stays
`'free'` during a trial — only `status` becomes `'pro'`). Concretely:

- `requireProjectWriteAccess()` (`apps/api/src/lib/requireProjectTierAccess.ts`)
  — gates comment creation, version approve/reject, deleting a version,
  slicer-profile/print-photo upload, etc. `isSample` (the auto-seeded Sample
  Project) is exempt; everything else requires `status === 'pro'`.
- `requireProUploadAccess()` — uploading a *new* version specifically; no
  Sample Project exemption (it ships pre-seeded, free users explore but
  don't add to it).
- Frontend mirror: `useAccountStatus()` context in
  `apps/web/src/components/ProjectsLayout.tsx` exposes `{ isRestricted,
  isPro }`, fetched once from `GET /billing/subscription`. Use `isPro` for
  any client-side "should I show this button" check — it's the same
  status field, not a re-derived guess.
- Team-only (not just Pro) beyond that: `canReviewVersions()` in
  `apps/api/src/routes/versions.ts` — project owner always reviews; on a
  Team project, `admin` or `approver` role also can (`approver` is
  "reviews only, can't manage members"); `member` role cannot. Team seat
  invites/removals are `admin`/owner-only, enforced in
  `apps/api/src/routes/teams.ts`.

## API Endpoints (no `/api` prefix — routes are unprefixed, e.g. `/billing/checkout`)

| Method | Route                                          | Auth     | Description                                          |
| ------ | ----------------------------------------------- | -------- | ------------------------------------------------------ |
| GET    | `/billing/subscription`                        | Required | Returns `{ tier, status, accountStatus, seats, ... }`  |
| POST   | `/billing/checkout`                            | Required | Body `{ tier: 'pro'\|'team', couponCode? }` → Checkout session URL |
| GET    | `/billing/coupons`                             | None     | The general-availability promo code, if any is active  |
| POST   | `/billing/portal`                              | Required | Creates Stripe Customer Portal session                 |
| POST   | `/billing/cancel` / `/billing/resume`          | Required | Toggles `cancel_at_period_end` on the live subscription |
| POST   | `/billing/webhook`                             | None (Stripe signature) | Stripe webhook handler, raw-body content-type parser |
| POST   | `/projects/:projectId/versions/:versionId/approve` / `/reject` | Required, Team reviewer role | Version-approval actions, see `canReviewVersions()` above |
| GET    | `/teams/:teamId/pending-versions`              | Required | Cross-project queue of pending versions for reviewers   |
| PATCH  | `/admin/users/:userId/demo`                    | Required, admin | Body `{ demo: boolean }` — flags/unflags a demo account, see pro.md |

Frontend callers: `apps/web/src/lib/projectsApi.ts`
(`startProCheckout`/`startTeamCheckout`/`getSubscription`/etc.) and
`apps/web/src/lib/pendingCheckout.ts` (`markPendingCheckout(tier)` /
`consumePendingCheckout()` — persists which tier a signed-out visitor meant
to buy across the signup + email-confirm round trip, resumed automatically
in `ProjectsLayout.tsx`'s `handleAutoResumeCheckout(tier)`).

## Webhook Events — only 3 are actually handled

| Event                            | Action                                                                |
| --------------------------------- | ------------------------------------------------------------------------ |
| `checkout.session.completed`      | Look up the Stripe customer → user, upsert `subscriptions` from the real Stripe subscription object |
| `customer.subscription.updated`   | Same upsert — covers plan/quantity/cancel-at-period-end changes         |
| `customer.subscription.deleted`   | Sets `status = 'canceled'` on the matching row                          |

`invoice.paid` and `invoice.payment_failed` are **not implemented** —
earlier drafts of this doc listed them as required; they were never built.
If you're setting up a webhook endpoint, subscribing to extra events beyond
these 3 is harmless (unhandled types are a no-op default case in the
handler) but does nothing useful. Don't assume past_due/grace-period logic
exists — it doesn't.

## Security Rules

- Never trust client-side tier checks. Always verify server-side via
  `getAccountAccess()`/`requireProjectWriteAccess()`, not a raw `tier`
  string comparison (see Feature Gating Logic above for why).
- Stripe webhook secret in `STRIPE_WEBHOOK_SECRET` env var only — never
  commit a real value to `.env.example` (this happened once with a
  `stripe listen` CLI secret; scrubbed, but check before assuming that
  file's contents are safe to treat as placeholders).
- Whitelist `price_id` server-side via `apps/api/src/lib/priceCatalog.ts`'s
  `tierForPriceId()` — reject unknown price IDs rather than guessing a tier.
- Team seat limits enforced at invite time in `apps/api/src/routes/teams.ts`.
- `blog_posts` (unrelated to billing, but same "don't forget RLS" lesson)
  shipped once without Row Level Security enabled, exposing it to the anon
  key. Fixed in `apps/api/migrations/0023_blog_rls.sql`. When adding a new
  table, enable RLS with a real policy in the same migration — don't defer it.
