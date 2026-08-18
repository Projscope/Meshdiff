# Meshdiff

A web-based review and comparison layer for 3D printable parts — upload versions of a
mesh (STL/OBJ/3MF), see exactly what changed between them, and whether the change still
prints. Not a CAD editor; it sits above whatever produced the mesh.

See [CLAUDE.md](CLAUDE.md) for the full product spec, architecture rules, and domain
knowledge this project is built against.

<img width="1754" height="5826" alt="full page" src="https://github.com/user-attachments/assets/44d8082a-b037-4adf-9129-556a06d941ef" />

## Status

Two entry points: a free, anonymous **Live Diff** tool (upload two files, get an
instant diff, share a link — no account) and a signed-in **Projects workspace** with
persistent version history, comments, and team review.

### Live Diff (no account)

- Drag-and-drop STL/OBJ/3MF upload with live preview
- **Voxel diff**: both meshes voxelized into a shared grid, classified
  added/removed/unchanged, rendered as instanced cubes
- **Surface heatmap**: per-vertex signed-distance deviation painted directly on the
  mesh surface, plus a translucent "ghost" overlay and a voxel-removed overlay so
  interior material removal (holes, hollow-outs) is visible even where the newer
  version has no surface left to color
- Adjustable dimensional tolerance (slider + input) shared by both diff views
- **Shareable diff links**: uploads both meshes direct-to-storage (Supabase) via
  signed URLs, then a `?share=<id>` link reproduces the exact same diff for anyone
  who opens it. Links expire after 1/3/7 days; a `pg_cron` job purges expired rows
  and their storage files daily.

### Projects workspace (signed in via Supabase Auth)

- Persistent projects with a full version history (not just a single share link)
- **Printability gate** — real per-version wall-thickness, overhang, and unsupported-
  area analysis (not a placeholder), with a tooltip explaining the pass/warn/fail
  thresholds
- 3D viewer with an axes indicator (this app treats Z as up) and 3D-pinned comments
  on any version
- **Teams** ([full docs](teams.md)): per-seat billing, invite members with a role
  (`admin` / `approver` / `member`), team projects require an admin/approver to
  approve or reject each version before it becomes the project's stable version;
  personal (Pro) projects auto-approve on upload. Decisions can be changed later,
  not just made once. A team dashboard (seat usage, pending-approvals queue, audit
  log) is available at `/teams/:teamId`.
- Client-side-generated project thumbnails, pagination, "compare any two versions,"
  and a lazily-created per-user workspace seeded with a sample project

Not built yet (see [CLAUDE.md](CLAUDE.md) for the intended scope): SSO, print result
logging, slicer profile snapshots, LLM-generated change summaries (currently
deterministic prose from the computed stats), PCA/ICP alignment, and moving the diff
computation off the main thread into a Web Worker.

## Stack

- Frontend: React 18 + TypeScript + Tailwind CSS + React Three Fiber/Drei + Three.js
- Spatial queries: three-mesh-bvh (raycasting, nearest-point queries, wall-thickness
  sampling)
- Auth/DB/Storage: Supabase (Postgres, Supabase Auth, Supabase Storage, `pg_cron` +
  `pg_net` for expired-share cleanup)
- Backend (local dev): Node.js + Fastify — health, diff, waitlist, share, projects,
  versions, comments, teams, and workspace routes
- Backend (production): Netlify Functions for the anonymous Live Diff endpoints
  (`waitlist`, `share-create`, `share-get`), deployed alongside the static site
- Tests: Vitest

## Getting started

### Prerequisites

- **Node.js**: 18+ (check with `node --version`)
- **Docker**: For local Supabase (check with `docker --version`)
- **Stripe CLI** (optional): For local payment testing with real Stripe webhooks

### Installation

```bash
# Install dependencies for all workspaces
npm install
```

### Running the full stack locally

**Terminal 1: Start local Supabase**
```bash
supabase start
```
This starts Postgres, Auth, Storage, and PostgREST. First run downloads Docker images (~5 min).

**Terminal 2: Start the API server**
```bash
npm run dev:api    # Fastify backend at http://localhost:3001
```

**Terminal 3: Start the web frontend**
```bash
npm run dev:web    # React dev server at http://localhost:5173
```

### Applications & URLs

| App | Port | URL | Purpose |
|-----|------|-----|---------|
| **Web (Frontend)** | 5173 | http://localhost:5173 | React app with Live Diff + Projects workspace |
| **API (Backend)** | 3001 | http://localhost:3001 | Fastify REST API (projects, versions, diffs, billing) |
| **Supabase (Local)** | 54321 | http://localhost:54321 | Local Postgres + Auth + Storage |

### Environment setup

The API workspace needs secrets — copy and configure:

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` with:
- **Supabase credentials** (from `supabase status` output)
  - `SUPABASE_URL`: From local Supabase
  - `SUPABASE_SERVICE_ROLE_KEY`: From local Supabase
- **Stripe credentials** (optional, for payment testing)
  - `STRIPE_SECRET_KEY`: Test key from Stripe Dashboard
  - `STRIPE_WEBHOOK_SECRET`: Will update when running Stripe CLI
  - `STRIPE_PRO_PRICE_ID`: Test price ID from Stripe
  - `STRIPE_TEAM_PRICE_ID`: Test price ID for the Team tier — see [teams.md](teams.md#setup) for creating this product/price
- **Other**
  - `FRONTEND_URL`: http://localhost:5173 (already set)
  - `CONVERTKIT_API_KEY` / `CONVERTKIT_API_SECRET`: Leave as-is for local dev

For the frontend, create `apps/web/.env`:
```bash
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<from supabase status output>
```

### Supabase (local development)

Run a fully isolated local Postgres + Auth + Storage stack via Docker:

```bash
supabase start     # First run: downloads Docker images (~5 min), then starts services
supabase status    # Prints Project URL + anon/service_role keys
supabase stop      # Stops services; data persists in Docker volume for next run
```

Copy the output values into your config files:
- `apps/api/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `apps/web/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Migrations under `supabase/migrations/` apply automatically on start.

### Stripe CLI (local webhook testing)

To test the full checkout → webhook → subscription flow locally, use Stripe CLI to forward webhooks to your local API:

**Step 1: Install Stripe CLI** (if not already installed)
```bash
# macOS (Homebrew)
brew install stripe/stripe-cli/stripe

# Windows (Scoop)
scoop install stripe

# Linux
# See https://stripe.com/docs/stripe-cli
```

**Step 2: Authenticate with your Stripe account**
```bash
stripe login
```
This opens your browser to authorize. Follow the prompts.

**Step 3: Forward webhooks to your local API** (new terminal)
```bash
stripe listen --forward-to localhost:3001/billing/webhook \
  --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted
```

This outputs a webhook signing secret like: `whsec_test_xxxxxxxxxxxx`

**Step 4: Update your environment**
Copy the signing secret and update `apps/api/.env`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxxxxxxxxx
```

**Step 5: Restart the API server** to pick up the new secret.

**Now you can test payments:**
1. Sign in at http://localhost:5173
2. Go to Projects → click "Subscribe to Pro"
3. Complete checkout with test card: `4242 4242 4242 4242`, any future date, any CVC
4. Stripe CLI will log the webhook: `checkout.session.completed`
5. Watch your sidebar — it should update to "Pro plan" within seconds

**Note:** Before shipping to production, update `STRIPE_WEBHOOK_SECRET` in your production environment with your **live** Stripe webhook secret (not the test one).

### Other useful commands

```bash
# Type checking & building
npm run typecheck                          # TypeScript check (all workspaces)
npm run build                               # Production build (all workspaces)

# Testing
npm run test --workspace apps/shared        # Diff/voxelize engine tests (Vitest)
npm run test --workspace apps/web           # Client engine + lib tests (Vitest)

# Database
supabase db pull                             # Sync Postgres schema from local to supabase/ folder
supabase migration new <name>                # Create a new migration file
```

### Troubleshooting

**Q: "Cannot find module" or build errors**
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
npm run build
```

**Q: Supabase won't start**
```bash
# Check if port 54321 is already in use, or reset Docker
docker ps                           # List running containers
docker stop <container_id>          # Stop conflicting container
supabase start --force-pull         # Force re-download images
```

**Q: Stripe webhooks not arriving**
- Make sure `stripe listen` is running in a separate terminal
- Confirm `STRIPE_WEBHOOK_SECRET=whsec_test_...` is in `apps/api/.env`
- Restart the API server after updating the secret
- Check API logs for "Stripe webhook received" message

**Q: Sample project thumbnail is empty**
- Navigate into the project (triggers 3D render)
- Exit back to project list
- Thumbnail will appear after first view (generated client-side)

## Project structure

```
Meshdiff/
  CLAUDE.md                 # product spec and engineering rules
  teams.md                  # Team tier: concept, roles, billing setup, audit log
  apps/shared/               # Pure diff/voxelize engine, shared by web + api
    src/engine/               # voxelizer, voxel diff + printability analysis (tested)
  apps/web/                  # React + R3F frontend
    src/engine/                # client-side mesh loading, thumbnail rendering
    src/components/             # 3D viewers, team/project modals, diff views
    src/pages/                   # Live Diff tool + the Projects workspace pages
    src/lib/                     # API client, Supabase auth provider
  apps/api/                  # Fastify backend (local dev — mirrors the Netlify Functions)
    src/routes/                # health, diff, waitlist, share, projects, versions,
                                 # comments, teams, workspace
    src/lib/                    # ownership/RBAC, server-side mesh loading, seeding
    migrations/                 # SQL migrations (mirrored under supabase/migrations/)
  netlify/functions/         # Production serverless functions (deployed with the site)
```
