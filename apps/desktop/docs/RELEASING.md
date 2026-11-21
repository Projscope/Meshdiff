# How to release Meshdiff Desktop

A release is made by pushing a git tag. A GitHub Actions workflow in this (private) repo then tests
the app, builds the Windows installer, and publishes it to the **public** repo
[`Projscope/meshdiff-releases`](https://github.com/Projscope/meshdiff-releases). Installed apps
update themselves from that public repo, so a published release is what your users get.

The source code never leaves this repo; the public repo holds only installers and update information.

> Before the **first public** release (1.0.0), also work through [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md):
> code signing, terms and privacy review, and a real support address.

---

## One-time setup (already done for this project)

| What | Where | Notes |
| --- | --- | --- |
| Public repo `Projscope/meshdiff-releases` | GitHub | Needs at least one commit (it has a README). |
| Secret `RELEASES_REPO_TOKEN` | This repo → Settings → Secrets and variables → Actions → **Secrets** | Fine-grained token, owner **Projscope**, repository access **only** `meshdiff-releases`, permission **Contents: Read and write**, nothing else. It has an **expiry date**: put a reminder in your calendar, and replace the secret before it expires. If the org requires approval for fine-grained tokens, an org owner must approve it. |
| Variable `MESHDIFF_SUPABASE_URL` | Same page → **Variables** tab | The production Supabase project URL. |
| Variable `MESHDIFF_SUPABASE_ANON_KEY` | Same page → **Variables** tab | The **publishable** (`sb_publishable_…`) key. Never the secret key. It is public by design and ends up inside the installer. |
| Variable `MESHDIFF_API_URL` (optional) | Same page → **Variables** tab | Defaults to `https://meshdiff-api.onrender.com`. |

Without the two Supabase variables the installer still builds and works, but fully locally: Settings →
Team sync says "Team sync isn't set up in this build".

---

## Releasing a new version

### 1. Decide the version
Use semantic versioning: `MAJOR.MINOR.PATCH` (for example `0.0.2`, `1.0.0`). The updater only offers a
version that is **higher** than the one installed, so never reuse or lower a version number once anyone
may have installed it. If a release has a problem, fix it and publish the next patch version.

### 2. Make sure the backend is ready
If the release needs API or database changes (anything under `apps/api` or a new
`supabase/migrations` file), apply the migration and deploy the API **first**. A desktop build that
talks to an API without those changes will fail to sync.

### 3. Bump the version and merge it
```powershell
npm version X.Y.Z --workspace apps/desktop --no-git-tag-version
```
This changes `apps/desktop/package.json` and `package-lock.json`. Commit them on a branch, open a PR
into `main`, and merge it. Everything you want in the release must be on `main` first.

### 4. Tag `main` and push the tag
```powershell
git checkout main
```
```powershell
git pull
```
```powershell
git tag desktop-vX.Y.Z
```
```powershell
git push origin desktop-vX.Y.Z
```
The tag **must** be `desktop-v` plus exactly the version in `apps/desktop/package.json`. The workflow
refuses to continue if they differ ("Tag … does not match").

### 5. Watch the workflow
GitHub → this repo → **Actions** → **Desktop Release**. It takes about 5 minutes and runs, in order:

1. checkout, install dependencies, check the tag matches the version;
2. typecheck, then build the renderer and the app (the cloud addresses from the variables are baked in);
3. unit tests;
4. smoke test, then the end-to-end suites (local library, two-user sync, large models);
5. **make sure the public release exists** (creates an empty `vX.Y.Z` release in `meshdiff-releases`);
6. build the installer and upload it into that release.

Any failing step stops the run and nothing is published.
Windows runners count as **2×** against your Actions minutes (the Free plan has 2,000 a month), so avoid
re-running needlessly.

### 6. Check the result
Open <https://github.com/Projscope/meshdiff-releases/releases>. The release `X.Y.Z` should have three files:

- `Meshdiff-Setup-X.Y.Z.exe` (the installer, roughly 120 MB)
- `Meshdiff-Setup-X.Y.Z.exe.blockmap`
- `latest.yml` (what installed apps read to find updates; it must say `version: X.Y.Z`)

The release text is a generic one-liner. Edit the release on GitHub to add proper notes.
**Release notes are public**: describe user-visible changes only, nothing about admin tools or internal
details.

### 7. Test it like a user
1. **Fresh install:** run `Meshdiff-Setup-X.Y.Z.exe` on a clean Windows machine. Unsigned installers show a
   Windows SmartScreen warning ("More info" → "Run anyway") until code signing is set up.
2. **Sign in and sync** with a real account (Settings → Team sync) and connect a test project.
3. **Auto-update:** on a machine with the *previous* version installed, open Settings → **Check for
   updates**. It should show "Downloading version X.Y.Z…", then **Restart to update**. After restarting,
   the version shown in the top bar should be X.Y.Z, and your projects should still be there. (Installed
   apps also check by themselves 10 seconds after launch and every 4 hours.)

---

## Trying a build locally (no release)

```powershell
npm run build --workspace apps/desktop
```
```powershell
npm run start --workspace apps/desktop
```
Runs the app from source. If an installed Meshdiff is open, add `-- --user-data-dir=<some folder>` (or run
`npx electron . --user-data-dir=<folder>` in `apps/desktop`): the app allows one instance per profile.

To build the real installer layout without publishing:
```powershell
cd apps/desktop
```
```powershell
npx electron-builder --dir -c.directories.output=release/pack-test
```
Then run `release/pack-test/win-unpacked/Meshdiff.exe`, or point the tests at it:
`$env:SMOKE_EXE = "...\Meshdiff.exe"; node tests/smoke.mjs`. (Use a fresh output folder: Windows sometimes
keeps a lock on a previous `win-unpacked` and the build then fails with EBUSY.)

To point a local build at a cloud, set `MESHDIFF_API_URL`, `MESHDIFF_SUPABASE_URL` and
`MESHDIFF_SUPABASE_ANON_KEY` in the environment before starting it.

---

## When something goes wrong

| Symptom | Cause and fix |
| --- | --- |
| Workflow doesn't start after pushing the tag | The tag isn't `desktop-v…`, or it wasn't pushed (`git ls-remote --tags origin`). The workflow file must exist in the tagged commit, so tag from `main` after merging. |
| "Tag … does not match … version" | `apps/desktop/package.json` has a different version than the tag. Bump it, merge, then delete and re-create the tag on the new commit (see below). |
| A test or e2e step fails | Nothing was published. Read the log, fix on a branch, merge, move the tag (see below). |
| Publish step: `422 Published releases must have a valid tag` | The race the "make sure the public release exists" step prevents. If you see it on an old tag, re-run the failed job: the release now exists, so the upload goes into it. |
| Publish step: `401` / `403` / "Resource not accessible" | `RELEASES_REPO_TOKEN` is missing, expired, wrong owner (must be **Projscope**), lacks **Contents: Read and write** on `meshdiff-releases`, or an org owner hasn't approved it. Create a new token with the settings in the table above and run `gh secret set RELEASES_REPO_TOKEN --repo Projscope/Meshdiff` (paste it at the prompt; never share it in chat or commit it). |
| Installed app says "Team sync isn't set up" | The two Supabase variables were missing when that version was built. Set them and release a new version. |
| Installed app never offers the update | `latest.yml` in the release doesn't say the new version, the release is still a draft, or the installed version is already the same or newer. Also check Settings → Check for updates for an error message. |
| Windows SmartScreen warns on install | Expected until the installer is code-signed. See RELEASE_CHECKLIST.md. |

### Re-doing a release that never published
If the run failed **before** publishing (tests, build), nothing is public. After fixing the cause on `main`:
```powershell
git push origin --delete desktop-vX.Y.Z
```
```powershell
git tag -d desktop-vX.Y.Z
```
then tag the new commit and push the tag again.

### Withdrawing a bad release
If the release is already public, don't delete and re-use the version: apps that already updated to it
will not go back. Fix the problem and publish the **next** version (for example `1.0.1`), which the updater
then offers to everyone. If you must hide a release immediately, delete it (and its tag) in
`meshdiff-releases` so no new installs or updates pick it up, then ship the fixed version.

---

## Reference

- Workflow: `.github/workflows/desktop-release.yml`
- Installer and update settings: `apps/desktop/electron-builder.yml` (the `publish` block names the public repo)
- Cloud addresses are baked in at build time by `apps/desktop/scripts/build.mjs`
- Updater: `apps/desktop/src/main/updater.ts` (checks at launch +10 s and every 4 h, downloads in the
  background, installs on quit or via "Restart to update")
- Security notes and what the app sends to the cloud: `docs/PRIVACY.md`
