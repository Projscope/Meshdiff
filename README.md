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
- **Teams**: invite members with a role (`admin` / `approver` / `member`), team
  projects require an admin/approver to approve or reject each version before it
  becomes the project's stable version; personal (Pro) projects auto-approve on
  upload. Decisions can be changed later, not just made once.
- Client-side-generated project thumbnails, pagination, "compare any two versions,"
  and a lazily-created per-user workspace seeded with a sample project

Not built yet (see [CLAUDE.md](CLAUDE.md) for the intended scope): Stripe billing/plan
enforcement (tiers are currently cosmetic), LLM-generated change summaries (currently
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

```bash
npm install
npm run dev:web      # frontend dev server at http://localhost:5173
npm run dev:api      # backend dev server at http://localhost:3001
```

The API workspace needs a few secrets to run — copy `apps/api/.env.example` to
`apps/api/.env` and fill in ConvertKit and Supabase credentials (never committed).

### Local Supabase (Docker)

Rather than pointing dev at the live Supabase project, run a fully isolated
local stack (Postgres, Auth, Storage, PostgREST) via the Supabase CLI —
migrations under `supabase/migrations/` apply automatically:

```bash
supabase start        # first run pulls several Docker images, can take a few minutes
supabase status        # prints the local Project URL + anon/service_role keys
supabase stop           # when done — data persists in a Docker volume between runs
```

Copy the printed values into `apps/api/.env` (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) and `apps/web/.env` (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`). If another local Supabase project is already
running, either `supabase stop --project-id <name>` it first or change the
ports in `supabase/config.toml`.

Other useful commands:

```bash
npm run typecheck                          # all workspaces
npm run build                               # all workspaces
npm run test --workspace apps/shared        # diff/voxelize engine unit tests (Vitest)
npm run test --workspace apps/web           # client engine + lib unit tests (Vitest)
```

## Project structure

```
Meshdiff/
  CLAUDE.md                 # product spec and engineering rules
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
