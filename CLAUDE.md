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

## Pricing Tiers

| Tier     | Price                               | Billing        | Audience                       | Gate                                                                                                                                                     |
| -------- | ------------------------------------ | -------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Free** | $0                                   | —              | Hobbyists, evaluators           | 3 active shareable links, 3-day expiry, watermark, no saved projects                                                                                        |
| **Pro**  | $15/mo or $144/yr (20% off)          | Monthly/Annual | Solo engineers, freelancers     | Unlimited links, custom expiry (1/3/7/30/never), no watermark, unlimited projects, comment pins, diff report export (PNG/PDF)                               |
| **Team** | $35/seat/mo or $336/yr (20% off)     | Monthly/Annual | Hardware startups, print farms  | Everything in Pro + team approvals (Pending/Changes/Approved/Rejected), slicer profile snapshots, print result logging, SSO, admin dashboard, audit log     |

Billing via Stripe (see roadmap — not yet implemented). Tier gates above are the
target end state; until Stripe is wired up, no plan enforcement exists in code.

---

## Stripe Setup

- Products: `Meshdiff Pro`, `Meshdiff Team`
- Prices: monthly + yearly for each
- Customer Portal enabled for self-service (update card, cancel, switch plan)
- Checkout: Stripe hosted pages, not Elements

## Database Schema (PostgreSQL)

```sql
users (
  id uuid primary key,           -- Clerk user ID
  email text not null,
  stripe_customer_id text,
  created_at timestamptz default now()
);

subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  stripe_subscription_id text unique not null,
  stripe_price_id text not null,
  status text not null check (status in ('active','canceled','past_due','unpaid','trialing')),
  tier text not null check (tier in ('pro','team')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references users(id),
  stripe_subscription_id text references subscriptions(stripe_subscription_id),
  created_at timestamptz default now()
);

team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  joined_at timestamptz default now(),
  unique(team_id, user_id)
);

usage_limits (
  user_id uuid primary key references users(id) on delete cascade,
  active_share_links_count int default 0,
  projects_count int default 0,
  reset_at timestamptz default now()
);
```

## Feature Gating Logic

```
Is user authenticated?
  └─ No → Free tier limits (3 links, watermark, no save)
  └─ Yes → Check subscriptions table
      └─ status = 'active' or 'trialing'?
          └─ tier = 'pro' → Pro limits
          └─ tier = 'team' → Team limits (check team_members for seat)
      └─ Else → Free tier limits
```

## API Endpoints

| Method | Route                        | Auth     | Description                             |
| ------ | ----------------------------- | -------- | ---------------------------------------- |
| POST   | `/api/billing/checkout`       | Required | Creates Stripe Checkout session          |
| POST   | `/api/billing/portal`         | Required | Creates Stripe Customer Portal session   |
| GET    | `/api/billing/subscription`   | Required | Returns current subscription status      |
| POST   | `/api/billing/webhook`        | None     | Stripe webhook handler                   |

## Webhook Events to Handle

| Event                            | Action                                                             |
| --------------------------------- | -------------------------------------------------------------------- |
| `checkout.session.completed`      | Create subscription record, update user tier, send welcome email     |
| `invoice.paid`                    | Mark active, update period dates                                     |
| `invoice.payment_failed`          | Mark past_due, 7-day grace period                                    |
| `customer.subscription.updated`   | Sync cancel_at_period_end, tier changes, quantity                    |
| `customer.subscription.deleted`   | Downgrade to Free, preserve data 30 days                             |

## Security Rules

- Never trust client-side tier checks. Always verify server-side.
- Stripe webhook secret in `STRIPE_WEBHOOK_SECRET` env var only.
- Whitelist `price_id` server-side — reject unknown price IDs.
- Team seat limits enforced at invite time.
