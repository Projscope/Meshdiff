# Meshdiff Desktop

A free Electron client for comparing 3D model versions. Models, history and diffs
stay on the user's machine; cloud review and sync (Team plan) come in later milestones.

## How it fits together

- `src/main` - Electron main process: window, the privileged `app://` protocol that
  serves the renderer, a strict CSP, IPC, and the auto-updater.
- `src/preload` - the only API the renderer gets (`window.meshdiffDesktop`).
- The **renderer is in `apps/web`** (`desktop.html`, `src/desktop/`, `vite.desktop.config.ts`)
  so it reuses the existing viewers and diff engine. It makes no network calls.
- Main and preload are bundled into single files by esbuild (`scripts/build.mjs`), so the
  installer ships no `node_modules`.

## The local library

Projects, versions and comments live on the user's disk under `<userData>/library`:
one `project.json` per project plus model files stored by SHA-256 in `blobs/`. Plain JSON
(no database) so it is inspectable, atomic to write, and needs no native module. The store
is `src/main/library/store.ts`; the renderer talks to it through `window.meshdiffDesktop.library`
(IPC in `src/main/library/ipc.ts`, contract in `apps/shared/src/localLibrary.ts`).

Adding a version stores the file, then the renderer analyzes it with the same diff engine and
worker as the website (`apps/web/src/desktop/lib/analyzeVersion.ts`) and saves the result. Ids
(ULID versions, UUID comments) and comment coordinates match the cloud's, so a later sync can
reuse them. Set `MESHDIFF_LIBRARY_DIR` to point the app at a throwaway library (tests do).

### Staying safe with damaged data

- A project file the app can't read is hidden from the list but never changed or deleted, and
  Settings says how many there are.
- While any project is unreadable, no model file is deleted (the app can't prove a file is unused).
- A saved analysis with missing or malformed numbers is recomputed from the model file
  (`apps/web/src/desktop/lib/analysisValidity.ts`); a page that still fails to render shows a
  recovery screen instead of a blank window (`ErrorBoundary.tsx`).
- Fonts (IBM Plex Sans, Space Grotesk) are bundled with `@fontsource`, so nothing is fetched from a CDN.

## Large models

The website caps analysis at 50,000 triangles per mesh, a limit set to protect the shared server
(`MAX_TRIANGLES_PER_MESH` in `apps/shared/src/engine/diffVoxels.ts`). The desktop app analyses on the
user's own computer, so it uses a higher limit sized to that computer instead of a fixed one:

- **How the limit is set** (`apps/shared/src/analysisLimits.ts`): from the memory that is free right
  now (never counting on more than half the installed memory), at 3 KB per triangle, kept between
  50,000 and 1,000,000. The cost was measured with `node tests/bench-analysis.mjs`: about 1.4 KB and
  8 microseconds per triangle, scaling linearly to at least 2 million (2M triangles = 2.7 GB, 18 s on
  a fast desktop CPU); the budget assumes twice that for parsing and the 3D view.
- **Checked early:** a binary STL states its triangle count in its header, so an oversized one is
  refused before any parsing. 3MF/OBJ are checked right after parsing, before the step that copies
  every vertex.
- **Safe if the estimate is wrong:** analysis runs in a worker, and a worker that dies (e.g. out of
  memory) now fails its pending requests with a message instead of hanging, and the next request starts
  a fresh one (`apps/web/src/lib/createWorkerClient.ts`, which the website benefits from too). A running
  analysis can be cancelled, and is stopped after 5 minutes.
- **What the user sees:** a large model says so and offers Cancel; one over the limit is refused with its
  size, the limit on this computer and what to do (simplify the mesh). The file stays in the library.
  A refused version can't be synced (the cloud needs its stats), and because versions are diffed against
  the one before, a refused version also blocks the analysis of the next one.
- **For testing/support:** `MESHDIFF_ANALYSIS_MAX_TRIANGLES=<n>` forces the limit.

## Team sync (optional, Team plan)

The app is fully usable without an account. Signing in (Settings) and connecting a
project to a team adds sync; the server enforces the plan (`requireSyncAccess`), so
free and Pro accounts get `team_required`, which the app shows as a calm status.

What is sent for a connected project: each version's file name, size, SHA-256 and
analysis stats, and the comments. **Never the model file.** Teammates open the project
and see stats and comments; they attach their own copy of a file, which is accepted
only if its hash matches. A version a teammate uploaded through the website has no
file anywhere here (nothing to attach).

How it works (`src/main/sync/`):
- `engine.ts` reconciles a project with its cloud project. There is no queue: what still
  needs to go up is read from the project's own data (a version with no `cloud` info, a
  comment with `dirty` set) and every call is idempotent on the item's id, so an interrupted
  or failed sync resumes and a repeated one does nothing. Network calls run outside the
  store lock; results are applied in short transactions that re-check the item.
- Comments are append-only; status is last-writer-wins by when it reaches the cloud. A
  comment with a change waiting to go up is never overwritten by a pull. The comment feed
  cursor only advances in the same transaction that applies a page.
- Removing a synced version here never removes it from the cloud, and it won't come back
  (`ignoredVersionIds`). A version the team deleted is kept here but never pushed again.
- `auth.ts` signs in with Supabase Auth over REST; the session is kept encrypted with the
  OS key store (`secrets.ts`, Electron `safeStorage`). If encryption isn't available the
  session is simply not saved. Going offline never signs the user out.
- `service.ts` is what the IPC calls: single-flight per project, one retry after a token
  refresh, expected failures (offline, signed out, no plan) returned as a status.
  Connected projects also sync every 5 minutes while the app is open.

Where the cloud lives is baked in at build time: `MESHDIFF_API_URL`,
`MESHDIFF_SUPABASE_URL`, `MESHDIFF_SUPABASE_ANON_KEY` (set as repository *variables* for the
release workflow; the anon key is public by design). Environment variables of the same
names override them at runtime, which is how the tests (and you) point a build at a local
stack. With none set, the app runs fully locally and says syncing isn't set up.

## Develop

```bash
npm run build --workspace apps/desktop     # renderer bundle + main/preload
npm run start --workspace apps/desktop     # run from source
npm run test --workspace @meshdiff/desktop # unit tests for the library store
npm run smoke --workspace apps/desktop     # launches the real app and checks it
node tests/library-e2e.mjs                 # drives the real UI: projects, versions, comments, restart
node tests/sync-e2e.mjs                    # two app instances syncing through a local stand-in cloud
node tests/large-model-e2e.mjs             # big generated models: analyse, refuse with an explanation, cancel, retry
node tests/bench-analysis.mjs              # measures analysis time/memory at 50k-2M triangles (on demand)
```

`npm run pack` builds an unpacked app and `npm run dist` builds the installer into
`release/`. Test a packaged build with
`SMOKE_EXE="...\release\win-unpacked\Meshdiff.exe" npm run smoke --workspace apps/desktop`.

Keep `electron` and `electron-builder` on **exact** versions in `package.json`:
electron-builder cannot read a version range through npm workspace hoisting.

## Release

Step-by-step instructions, setup, verification and troubleshooting are in
[docs/RELEASING.md](docs/RELEASING.md). In short: bump `version` in `apps/desktop/package.json`, merge to
`main`, then `git tag desktop-vX.Y.Z && git push origin desktop-vX.Y.Z` (the tag must match the version).
`.github/workflows/desktop-release.yml` tests the app, builds the installer and publishes it to the public
releases-only repo `Projscope/meshdiff-releases`, which installed apps update from. The source in this
repo stays private. Before the first public release see [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)
(code signing, terms and privacy review).

Release notes on the public repo are public: keep admin and internal details out.

## Privacy model

The renderer's CSP is `connect-src 'self'` and the session cancels every request that is not
to `app://`, `blob:` or `data:`. All network access (sign-in, sync, updates) happens in the
main process.
