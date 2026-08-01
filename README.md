# Meshdiff

A web-based review and comparison layer for 3D printable parts — upload two versions
of a mesh (STL/OBJ) and see what actually changed: added/removed material, dimensional
deviation, and (eventually) whether the change still prints. Not a CAD editor; it sits
above whatever produced the mesh.

See [CLAUDE.md](CLAUDE.md) for the full product spec, architecture rules, and domain
knowledge this project is built against.

<img width="1873" height="1257" alt="Meshdiff screenshot" src="https://github.com/user-attachments/assets/1d140075-3198-435b-b660-b52b660784d8" />

## Status

Early, client-side-only prototype. Working today:

- Drag-and-drop STL/OBJ upload with live preview (3MF not implemented yet)
- **Voxel diff**: both meshes voxelized into a shared grid, classified
  added/removed/unchanged, rendered as instanced cubes
- **Surface heatmap**: per-vertex signed-distance deviation painted directly on the
  mesh surface, plus a translucent "ghost" overlay and a voxel-removed overlay so
  interior material removal (holes, hollow-outs) is visible even where the newer
  version has no surface left to color
- Adjustable dimensional tolerance (slider + input) shared by both diff views, so
  deviations within manufacturing tolerance don't get flagged as changes

Not built yet (see [CLAUDE.md](CLAUDE.md) for the intended scope): backend
persistence (Postgres/S3), auth, version history, comment pins, LLM-generated change
summaries, real printability gate (wall thickness/overhang/hole checks — the status
badge in the UI is currently a hardcoded placeholder), PCA/ICP alignment, and moving
the diff computation off the main thread into a Web Worker.

## Stack

- Frontend: React 18 + TypeScript + Tailwind CSS + React Three Fiber/Drei + Three.js
- Spatial queries: three-mesh-bvh (raycasting, nearest-point queries)
- Backend: Node.js + Fastify (skeleton only — `/health` and a stubbed `/diff` route)
- Tests: Vitest

## Getting started

```bash
npm install
npm run dev:web      # frontend dev server at http://localhost:5173
npm run dev:api      # backend dev server at http://localhost:3001
```

Other useful commands:

```bash
npm run typecheck                          # both workspaces
npm run build                               # both workspaces
npm run test --workspace apps/web           # engine unit tests (Vitest)
```

## Project structure

```
Meshdiff/
  CLAUDE.md            # product spec and engineering rules
  src/types/diff.ts     # GeometricDeltaReport schema shared by both apps
  apps/web/             # React + R3F frontend
    src/engine/          # voxelizer, voxel diff, surface deviation (pure, tested)
    src/components/       # Viewer, DiffView, SurfaceHeatmap
  apps/api/              # Fastify backend skeleton
```
