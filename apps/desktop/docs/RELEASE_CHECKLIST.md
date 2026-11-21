# Releasing Meshdiff Desktop 1.0: what's left, and who does it

Everything below is a step only the owner can take (accounts, secrets, decisions) or a
check to run before announcing. Engineering work for 1.0 is otherwise done.

## One-time setup

- [ ] **Public releases repo.** Create `Projscope/meshdiff-releases` (public, a README is enough).
- [ ] **Token.** Fine-grained personal access token, *Contents: read and write*, on that one repo
      only. Add it to this repo as the secret `RELEASES_REPO_TOKEN`.
- [ ] **Cloud addresses.** In this repo's Settings → Variables add `MESHDIFF_SUPABASE_URL` and
      `MESHDIFF_SUPABASE_ANON_KEY` (the production Supabase project's URL and *anon* key; these are
      public by design, never put the service-role key here). `MESHDIFF_API_URL` defaults to
      `https://meshdiff-api.onrender.com`.
- [ ] **Production migration.** Apply `apps/api/migrations/0042_local_versions.sql` to production
      *before* deploying the API that needs it, then deploy the API.

## Decide before a public release

- [ ] **Code signing.** Unsigned installers trigger Windows SmartScreen ("unknown publisher"),
      which will cost you installs, and an unsigned auto-updater has no publisher check, so
      anyone who gained write access to the releases repo could push a malicious update.
      Options: **Azure Trusted Signing** (cheapest, needs an Azure account and identity validation),
      or an OV/EV code-signing certificate (`CSC_LINK`, `CSC_KEY_PASSWORD` secrets; EV removes the
      SmartScreen warning immediately, OV builds reputation over time). The workflow already
      has the spot for it. Once signed, set `publisherName` under `win` in `electron-builder.yml`
      so the updater only accepts updates signed by you.
- [ ] **Pro and sync.** Sync is Team-only today. Decide whether Pro should include syncing a
      single user's own cloud projects.
- [ ] **Terms, privacy and a contact address.** Both docs have a `[add a real support address]` placeholder to fill in. `docs/PRIVACY.md` is written to match the code; `docs/TERMS.md` is a
      draft for freeware use. Have both reviewed before publishing them (and link them from the
      website and the releases repo README).

## Before tagging

- [ ] One real sign-in check against production Supabase (the app's sign-in was verified against a
      stand-in; the format is Supabase's documented one).
- [ ] Connect a test project to a test team, sync from two machines, attach a file, comment both ways.
- [ ] Install the signed installer on a clean Windows machine; check SmartScreen, uninstall/reinstall
      keeps the library.
- [ ] Auto-update: release `desktop-v0.0.1`, install it, release `desktop-v0.0.2`, confirm the
      installed app finds, downloads and installs it.
- [ ] Release notes: public. No admin or internal details.

## Release

Bump `version` in `apps/desktop/package.json`, then
`git tag desktop-vX.Y.Z && git push origin desktop-vX.Y.Z`. The workflow type-checks, tests, runs the
smoke and both end-to-end suites, builds the installer and publishes it.

## Known limits in 1.0

- Windows only. No folder watching. Approvals are not shown in the desktop app.
- A version uploaded through the website has no file on any desktop (nothing to attach).
- Auto-sync interval (5 minutes) is not configurable.
- 10 moderate `npm audit` findings remain, all inside electron-builder's build tooling (not shipped);
  clearing them needs a breaking upgrade of that tool.
