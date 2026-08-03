# Meshdiff

A web-based review and comparison layer for 3D printable parts — upload two versions
of a mesh (STL/OBJ) and see what actually changed: added/removed material, dimensional
deviation, and (eventually) whether the change still prints. Not a CAD editor; it sits
above whatever produced the mesh.

See [CLAUDE.md](CLAUDE.md) for the full product spec, architecture rules, and domain
knowledge this project is built against.

<img width="1600" height="1966" alt="image" src="https://github.com/user-attachments/assets/d5e94b49-bf51-41f5-ae71-ec189762c0ae" />


## Status

Client-side diffing with a thin persistence layer for sharing. Working today:

- Drag-and-drop STL/OBJ/3MF upload with live preview
- **Voxel diff**: both meshes voxelized into a shared grid, classified
  added/removed/unchanged, rendered as instanced cubes
- **Surface heatmap**: per-vertex signed-distance deviation painted directly on the
  mesh surface, plus a translucent "ghost" overlay and a voxel-removed overlay so
  interior material removal (holes, hollow-outs) is visible even where the newer
  version has no surface left to color
- Adjustable dimensional tolerance (slider + input) shared by both diff views, so
  deviations within manufacturing tolerance don't get flagged as changes
- **Shareable diff links**: uploads both meshes direct-to-storage (Supabase) via
  signed URLs, then a `?share=<id>` link reproduces the exact same diff (both
  files, mode, tolerance) for anyone who opens it. Links expire after 1/3/7 days;
  a `pg_cron` job purges expired rows and their storage files daily. Every share
  creation is also logged to a permanent `share_stats` table for a future admin
  dashboard.
- Waitlist signup (ConvertKit-backed)

Not built yet (see [CLAUDE.md](CLAUDE.md) for the intended scope): auth, version
history beyond a single share link, comment pins, LLM-generated change summaries,
real printability gate (wall thickness/overhang/hole checks — the status badge in
the UI is currently a hardcoded placeholder), PCA/ICP alignment, and moving the
diff computation off the main thread into a Web Worker.

## Stack

- Frontend: React 18 + TypeScript + Tailwind CSS + React Three Fiber/Drei + Three.js
- Spatial queries: three-mesh-bvh (raycasting, nearest-point queries)
- Backend (local dev): Node.js + Fastify — `/health`, a stubbed `/diff` route, and
  the real `/share` create/retrieve routes (talk to the same live Supabase project
  as production)
- Backend (production): Netlify Functions — `waitlist`, `share-create`, `share-get`,
  deployed alongside the static site, no separately hosted server
- Persistence: Supabase (Postgres for `shares`/`share_stats` metadata, Supabase
  Storage for the mesh files, `pg_cron` + `pg_net` for expired-share cleanup)
- Tests: Vitest

## Getting started

```bash
npm install
npm run dev:web      # frontend dev server at http://localhost:5173
npm run dev:api      # backend dev server at http://localhost:3001
```

The API workspace needs a few secrets to run the waitlist and share endpoints —
copy `apps/api/.env.example` to `apps/api/.env` and fill in ConvertKit and
Supabase credentials (never committed).

Other useful commands:

```bash
npm run typecheck                          # both workspaces
npm run build                               # both workspaces
npm run test --workspace apps/web           # engine + lib unit tests (Vitest)
```

## Project structure

```
Meshdiff/
  CLAUDE.md              # product spec and engineering rules
  src/types/diff.ts       # GeometricDeltaReport schema shared by both apps
  apps/web/               # React + R3F frontend
    src/engine/            # voxelizer, voxel diff, surface deviation (pure, tested)
    src/components/         # Viewer, DiffView, SurfaceHeatmap, ShareModal
    src/lib/                # API endpoint config, expiry helper
  apps/api/                # Fastify backend (local dev — mirrors the Netlify Functions)
    src/routes/              # health, diff (stub), waitlist, share
  netlify/functions/       # Production serverless functions (deployed with the site)
```
