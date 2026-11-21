// End-to-end test of Team sync through the real UI, with two real app instances
// (Alice and Bob, each with their own library and sign-in) talking to a local
// stand-in for the Meshdiff cloud. It exercises the real HTTP client, sign-in,
// encrypted session storage, IPC and pages: sign in, connect a project, sync,
// open it from a second computer, attach the file, comment both ways, go
// offline, lose the plan, sign out, restart. Run `npm run build` first.
//
//   node tests/sync-e2e.mjs
//   SMOKE_EXE="path\to\Meshdiff.exe" node tests/sync-e2e.mjs   (packaged build)
import { _electron as electron } from "playwright";
import { build } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = path.resolve(appDir, "../web/public/demo");
const packagedExe = process.env.SMOKE_EXE;
const gear1 = path.join(demoDir, "gear-v1.stl");
const gear2 = path.join(demoDir, "gear-v2.stl");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "meshdiff-sync-e2e-"));

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

// ---- the stand-in cloud ---------------------------------------------------------
const bundled = path.join(work, "httpCloud.mjs");
await build({
  entryPoints: [path.join(appDir, "src/main/sync/testing/httpCloud.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundled,
  logLevel: "silent",
});
const { startHttpCloud } = await import(pathToFileURL(bundled).href);
const cloud = await startHttpCloud();
const { fake } = cloud;
for (const email of ["alice@acme.test", "bob@acme.test", "free@acme.test"]) cloud.accounts.set(email, "pw");
fake.syncUsers.add("alice@acme.test");
fake.syncUsers.add("bob@acme.test"); // free@ has an account but no Team plan

// ---- helpers --------------------------------------------------------------------
const people = {};
async function launch(name) {
  const dirs = { library: path.join(work, `${name}-library`), userData: path.join(work, `${name}-userdata`) };
  const env = {
    ...process.env,
    MESHDIFF_LIBRARY_DIR: dirs.library,
    MESHDIFF_API_URL: cloud.url,
    MESHDIFF_SUPABASE_URL: cloud.url,
    MESHDIFF_SUPABASE_ANON_KEY: "anon-test-key",
  };
  const userArg = `--user-data-dir=${dirs.userData}`;
  const app = await electron.launch(
    packagedExe
      ? { executablePath: packagedExe, args: [userArg], env }
      : { executablePath: require("electron"), args: [appDir, userArg], cwd: appDir, env },
  );
  const win = await app.firstWindow();
  win.on("pageerror", (e) => pageErrors.push(`${name}: ${e.message}`));
  await win.waitForSelector('[data-testid="new-project-name"]', { timeout: 30_000 });
  people[name] = { app, win, dirs };
  return people[name];
}
const pageErrors = [];
const goto = async (win, hash) => {
  await win.evaluate((h) => (location.hash = h), hash);
};
const text = (win) => win.textContent("body");
const waitText = (win, needle, timeout = 30_000) => win.waitForFunction((n) => document.body.innerText.includes(n), needle, { timeout });
const bridge = (win, fn, arg) => win.evaluate(fn, arg);
/** Polls until the cloud (or anything else) reaches a state; the status line can read "idle" before a sync even starts. */
async function until(predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
/** Waits for the project page's sync line to settle in a phase. */
const waitPhase = (win, phase, timeout = 30_000) =>
  win.waitForFunction((p) => document.querySelector('[data-testid="sync-status"]')?.getAttribute("data-phase") === p, phase, { timeout });

async function signIn(win, email, password = "pw") {
  await goto(win, "#/settings");
  await win.waitForSelector('[data-testid="cloud-signin-form"]', { timeout: 15_000 });
  await win.fill('[data-testid="cloud-email"]', email);
  await win.fill('[data-testid="cloud-password"]', password);
  await win.click('[data-testid="cloud-signin"]');
}

async function projectIds(win) {
  return bridge(win, async () => (await window.meshdiffDesktop.library.listProjects()).map((p) => p.id));
}

try {
  // ======================= Alice: sign in ===========================================
  const alice = (await launch("alice")).win;
  await goto(alice, "#/settings");
  await alice.waitForSelector('[data-testid="cloud-signin-form"]', { timeout: 15_000 });
  check("Settings offers sign-in (cloud is configured)", !(await text(alice)).includes("isn't set up"));
  check("the privacy text no longer claims 'no account'", !(await text(alice)).includes("has no account"));
  check("the privacy text says model files never leave the computer", (await text(alice)).includes("model files never leave this computer"));

  await signIn(alice, "alice@acme.test", "wrong");
  await alice.waitForSelector('[data-testid="cloud-error"]');
  check("a wrong password is explained without saying which part", (await alice.textContent('[data-testid="cloud-error"]')).includes("don't match"));

  await alice.fill('[data-testid="cloud-password"]', "pw");
  await alice.click('[data-testid="cloud-signin"]');
  await alice.waitForSelector('[data-testid="cloud-account"]', { timeout: 15_000 });
  check("signs in and shows the account", (await alice.textContent('[data-testid="cloud-email-shown"]')) === "alice@acme.test");
  check("reports that the plan includes syncing", (await text(alice)).includes("plan includes syncing"));

  const sessionFile = path.join(people.alice.dirs.userData, "cloud-session.bin");
  const encryptionAvailable = await people.alice.app.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable());
  if (encryptionAvailable) {
    const raw = fs.readFileSync(sessionFile);
    check("the session is stored encrypted, not as readable text", !raw.includes(Buffer.from("alice@acme.test")) && !raw.includes(Buffer.from("user:alice")));
  } else {
    console.log("SKIP encrypted-session checks (no OS encryption available on this machine)");
  }

  // ======================= Alice: a project with two versions ======================
  await goto(alice, "#/");
  await alice.fill('[data-testid="new-project-name"]', "Gearbox");
  await alice.click('[data-testid="create-project"]');
  await alice.waitForSelector('[data-testid="project-name"]');
  await people.alice.app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
  }, [gear1, gear2]);
  await alice.click('[data-testid="add-versions"]');
  await alice.waitForFunction(() => document.querySelectorAll('[data-testid="change-summary"]').length === 2, null, { timeout: 120_000 });
  check("two analyzed versions before any sync", true);
  check("nothing has reached the cloud yet", fake.versions.length === 0 && fake.projects.size === 0);

  // ======================= Alice: connect ==========================================
  await alice.waitForSelector('[data-testid="connect-start"]');
  await alice.click('[data-testid="connect-start"]');
  await alice.waitForSelector('[data-testid="connect-team-select"]');
  check("offers her teams", (await alice.textContent('[data-testid="connect-team-select"]')).includes("Acme Hardware"));
  check("says model files are never uploaded", (await text(alice)).includes("model files are never uploaded"));
  await alice.click('[data-testid="connect-team"]');
  await waitPhase(alice, "idle", 60_000);
  await waitText(alice, "In sync with your team");
  check("connects, syncs and says it is in sync", true);

  check("the cloud has a project in the team", [...fake.projects.values()].length === 1 && [...fake.projects.values()][0].teamId === "team-1");
  check("both versions reached the cloud, in order", fake.versions.length === 2 && fake.versions.map((v) => v.versionNumber).sort().join() === "1,2");
  check("only a hash was sent, as local-mode versions", fake.versions.every((v) => v.storageMode === "local" && /^[0-9a-f]{64}$/.test(v.contentSha256)));
  check("the diff was sent too (cached for reviewers)", fake.versions.find((v) => v.versionNumber === 2)?.stats != null);
  check("both versions show as Synced", (await alice.locator('[data-testid="synced"]').count()) === 2);
  const cloudBlob = JSON.stringify(fake.versions) + JSON.stringify(fake.comments);
  check("no model bytes are anywhere in what the cloud received", !cloudBlob.includes("solid ") && cloudBlob.length < 20_000, `${cloudBlob.length} bytes`);

  const aliceProjectId = (await projectIds(alice))[0];
  const aliceVersions = await bridge(alice, async (id) => (await window.meshdiffDesktop.library.getProject(id)).versions.map((v) => v.id), aliceProjectId);
  await bridge(alice, async ([id, versionId]) => {
    await window.meshdiffDesktop.library.addComment(id, { versionId, body: "Boss wall is too thin", position: [1, 2, 3], normal: [0, 0, 1] });
  }, [aliceProjectId, aliceVersions[1]]);
  await alice.reload();
  await alice.waitForSelector('[data-testid="sync-now"]');
  await alice.click('[data-testid="sync-now"]');
  await until(() => fake.comments.length === 1);
  await waitPhase(alice, "idle");
  check("her comment reached the cloud with its position", fake.comments.length === 1 && fake.comments[0].body === "Boss wall is too thin" && fake.comments[0].position.join() === "1,2,3");

  // ======================= Bob: opens the team project ===============================
  const bob = (await launch("bob")).win;
  await signIn(bob, "bob@acme.test");
  await bob.waitForSelector('[data-testid="cloud-account"]', { timeout: 15_000 });
  await goto(bob, "#/");
  await bob.waitForSelector('[data-testid="open-team-project-start"]', { timeout: 15_000 });
  check("Bob has no projects of his own", (await projectIds(bob)).length === 0);
  await bob.click('[data-testid="open-team-project-start"]');
  await bob.waitForSelector('[data-testid="open-team-project"]');
  check("the dialog lists the team's project", (await bob.textContent('[data-testid="team-project-dialog"]')).includes("Gearbox"));
  await bob.click('[data-testid="open-team-project"]');
  await bob.waitForSelector('[data-testid="project-name"]', { timeout: 60_000 });
  await bob.waitForFunction(() => document.querySelectorAll('[data-testid="version-row"]').length === 2, null, { timeout: 30_000 });
  check("opens the project with both versions", (await bob.textContent('[data-testid="project-name"]')).includes("Gearbox"));
  check("each version is marked as having no file here", (await bob.locator('[data-testid="no-file"]').count()) === 2);
  check("they can't be selected for comparison yet", await bob.locator('input[type="checkbox"]').first().isDisabled());
  check("v2 shows the analysis summary that came from the cloud", (await bob.locator('[data-testid="change-summary"]').count()) >= 1);
  check("it shows who synced each version", (await text(bob)).includes("alice@acme.test"));
  const bobModelBytes = (await bridge(bob, async () => (await window.meshdiffDesktop.library.getInfo()).modelBytes));
  check("Bob received no model files", bobModelBytes === 0);

  // ---- Bob: the version page ---------------------------------------------------
  await bob.getByRole("link", { name: /^v2 ·/ }).click();
  await bob.waitForSelector('[data-testid="version-title"]');
  await waitText(bob, "kept on its owner's computer");
  check("asks him to attach his own copy", true);
  await waitText(bob, "Volume");
  check("stats are still readable without the file", true);
  await bob.click('[data-testid="tab-comments"]');
  await waitText(bob, "Boss wall is too thin");
  check("Alice's comment is there, with her name", (await text(bob)).includes("alice@acme.test"));

  await bob.setInputFiles('input[type="file"]', gear1); // the wrong file for v2
  await bob.waitForSelector('[role="alert"]');
  check("the wrong file is refused", (await text(bob)).includes("isn't the same as this version"));
  check("and nothing was stored", (await bridge(bob, async () => (await window.meshdiffDesktop.library.getInfo()).modelBytes)) === 0);

  await bob.setInputFiles('input[type="file"]', gear2);
  await bob.waitForSelector("canvas");
  await bob.waitForFunction(() => !document.body.innerText.includes("kept on its owner's computer"), null, { timeout: 30_000 });
  await bob.waitForFunction(() => !document.body.innerText.includes("Loading model…"), null, { timeout: 60_000 });
  check("the matching file is accepted and the model opens", true);
  check("it is now stored on Bob's computer", (await bridge(bob, async () => (await window.meshdiffDesktop.library.getInfo()).modelBytes)) > 0);

  // ---- two-way comments ---------------------------------------------------------
  const bobProjectId = (await projectIds(bob))[0];
  const bobV2 = await bridge(bob, async (id) => (await window.meshdiffDesktop.library.getProject(id)).versions[1].id, bobProjectId);
  const parentId = fake.comments[0].id;
  await bridge(bob, async ([id, versionId, parent]) => {
    await window.meshdiffDesktop.library.addComment(id, { versionId, body: "Thickening it to 1.2 mm", position: [1, 2, 3], parentCommentId: parent });
    await window.meshdiffDesktop.library.setCommentStatus(id, parent, "resolved");
    await window.meshdiffDesktop.sync.syncProject(id);
  }, [bobProjectId, bobV2, parentId]);
  check("Bob's reply and resolve reached the cloud", fake.comments.length === 2 && fake.comments.find((c) => c.id === parentId).status === "resolved");

  await bridge(alice, async (id) => window.meshdiffDesktop.sync.syncProject(id), aliceProjectId);
  const aliceView = await bridge(alice, async (id) => (await window.meshdiffDesktop.library.getProject(id)).comments.map((c) => ({ body: c.body, status: c.status, by: c.authorEmail ?? null })), aliceProjectId);
  check("Alice receives the reply, written by Bob", aliceView.some((c) => c.body === "Thickening it to 1.2 mm" && c.by === "bob@acme.test"));
  check("and sees her comment resolved", aliceView.find((c) => c.body === "Boss wall is too thin")?.status === "resolved");

  // ======================= Alice goes offline ========================================
  await goto(alice, `#/p/${aliceProjectId}`);
  await alice.waitForSelector('[data-testid="sync-now"]');
  await bridge(alice, async (id) => {
    const d = await window.meshdiffDesktop.library.getProject(id);
    await window.meshdiffDesktop.library.addComment(id, { versionId: d.versions[0].id, body: "Written on a plane", position: [0, 0, 0] });
  }, aliceProjectId);
  await cloud.stop();
  await alice.click('[data-testid="sync-now"]');
  await waitPhase(alice, "offline");
  check("offline is explained, and nothing is lost", (await alice.textContent('[data-testid="sync-status"]')).includes("will sync later"));
  const pending = await bridge(alice, async (id) => (await window.meshdiffDesktop.sync.getProjectStatus(id)).pendingComments, aliceProjectId);
  check("the comment is waiting to sync", pending === 1);
  check("local work still works offline", await bridge(alice, async (id) => (await window.meshdiffDesktop.library.getProject(id)).comments.some((c) => c.body === "Written on a plane"), aliceProjectId));

  await cloud.start();
  await alice.click('[data-testid="sync-now"]');
  await until(() => fake.comments.some((c) => c.body === "Written on a plane"));
  await waitPhase(alice, "idle");
  check("back online it syncs by itself", fake.comments.some((c) => c.body === "Written on a plane"));

  // ======================= signing out, and an account without the plan ==============
  await goto(alice, "#/settings");
  await alice.waitForSelector('[data-testid="cloud-signout"]', { timeout: 15_000 });
  await alice.click('[data-testid="cloud-signout"]');
  await alice.waitForSelector('[data-testid="cloud-signin-form"]');
  check("signing out returns to the sign-in form", true);
  await goto(alice, `#/p/${aliceProjectId}`);
  await waitText(alice, "to keep syncing");
  check("a connected project asks her to sign in, and says her work stays here", (await text(alice)).includes("stays on this computer"));
  check("her files and comments are untouched", await bridge(alice, async (id) => (await window.meshdiffDesktop.library.getProject(id)).versions.length === 2, aliceProjectId));
  const callsBefore = fake.calls.length;
  await bridge(alice, async (id) => window.meshdiffDesktop.sync.syncProject(id).catch(() => null), aliceProjectId);
  check("a signed-out sync makes no calls to the cloud", fake.calls.length === callsBefore);

  await signIn(alice, "free@acme.test");
  await alice.waitForSelector('[data-testid="cloud-account"]');
  await waitText(alice, "Team plan");
  check("an account without the Team plan is told so", (await text(alice)).includes("doesn't have"));
  await goto(alice, `#/p/${aliceProjectId}`);
  await waitText(alice, "part of the Team plan");
  check("and the project page explains it, offering the plans", (await text(alice)).includes("See plans"));

  // ======================= restart: the session survives (encrypted) =================
  await goto(alice, "#/settings");
  await alice.click('[data-testid="cloud-signout"]');
  await signIn(alice, "alice@acme.test");
  await alice.waitForSelector('[data-testid="cloud-account"]', { timeout: 15_000 });
  await people.alice.app.close();
  const relaunched = (await launch("alice")).win;
  await goto(relaunched, "#/settings");
  if (encryptionAvailable) {
    await relaunched.waitForSelector('[data-testid="cloud-account"]', { timeout: 20_000 });
    check("after restarting, she is still signed in", (await relaunched.textContent('[data-testid="cloud-email-shown"]')) === "alice@acme.test");
  }
  check("her project is still connected after restarting", await bridge(relaunched, async () => (await window.meshdiffDesktop.library.listProjects()).some((p) => !!p.cloud)));
} catch (error) {
  failures++;
  console.log("FAIL unexpected error:", error);
}

check("no uncaught errors in any window", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 300));
for (const person of Object.values(people)) await person.app.close().catch(() => undefined);
await cloud.stop();
fs.rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
