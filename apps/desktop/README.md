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

## Develop

```bash
npm run build --workspace apps/desktop     # renderer bundle + main/preload
npm run start --workspace apps/desktop     # run from source
npm run test --workspace @meshdiff/desktop # unit tests for the library store
npm run smoke --workspace apps/desktop     # launches the real app and checks it
node tests/library-e2e.mjs                 # drives the real UI: projects, versions, comments, restart
```

`npm run pack` builds an unpacked app and `npm run dist` builds the installer into
`release/`. Test a packaged build with
`SMOKE_EXE="...\release\win-unpacked\Meshdiff.exe" npm run smoke --workspace apps/desktop`.

Keep `electron` and `electron-builder` on **exact** versions in `package.json`:
electron-builder cannot read a version range through npm workspace hoisting.

## Release

Installers and the update manifest are published by `.github/workflows/desktop-release.yml`
to the public releases-only repo `Projscope/meshdiff-releases`. Installed apps check that
repo for updates; the source in this repo stays private.

One-time setup:
1. Create the public repo `Projscope/meshdiff-releases` (a README is enough).
2. Create a fine-grained token with *Contents: read and write* on that repo only and add it
   to this repo as the secret `RELEASES_REPO_TOKEN`.

To release: bump `version` in `apps/desktop/package.json`, then
`git tag desktop-vX.Y.Z && git push origin desktop-vX.Y.Z`. The tag must match the version.

Not done yet: code signing. Unsigned installers trigger Windows SmartScreen warnings.
Release notes on the public repo are public: keep admin and internal details out.

## Privacy model

The renderer's CSP is `connect-src 'self'` and the session cancels every request that is not
to `app://`, `blob:` or `data:`. All network access (sign-in, sync, updates) happens in the
main process.
