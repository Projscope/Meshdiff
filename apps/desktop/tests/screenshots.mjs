// Captures screenshots of the desktop app's real interface for the README / website.
// It builds a small demo workspace (demo gear and bracket models, a connected team
// project with a comment thread) in a throwaway profile against a local stand-in cloud,
// so no personal data or real account appears in the images. Run `npm run build` first.
//
//   node tests/screenshots.mjs <output-folder>
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
const outDir = path.resolve(process.argv[2] ?? path.join(appDir, "screenshots"));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "meshdiff-shots-"));
fs.mkdirSync(outDir, { recursive: true });

// ---- a stand-in cloud, so the team features can be shown without a real account ----
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
cloud.accounts.set("alex@example.com", "pw");
cloud.fake.syncUsers.add("alex@example.com");
cloud.fake.teams[0].name = "Northwind Robotics";

const env = {
  ...process.env,
  MESHDIFF_LIBRARY_DIR: path.join(work, "library"),
  MESHDIFF_API_URL: cloud.url,
  MESHDIFF_SUPABASE_URL: cloud.url,
  MESHDIFF_SUPABASE_ANON_KEY: "demo-key",
};
const app = await electron.launch({
  executablePath: require("electron"),
  args: [appDir, `--user-data-dir=${path.join(work, "userdata")}`],
  cwd: appDir,
  env,
});
const win = await app.firstWindow();
await win.waitForSelector('[data-testid="new-project-name"]', { timeout: 30_000 });
await win.setViewportSize?.({ width: 1360, height: 860 }).catch(() => undefined);

const goto = (hash) => win.evaluate((h) => (location.hash = h), hash);
/** `height` crops a page that is mostly empty space down to its content. */
const shot = async (name, height) => {
  // The version number and the update status change with every release (and "updates are off"
  // is just what a source run says), so they'd make the images look stale or odd: hide them.
  await win.evaluate(() => {
    for (const id of ["update-status", "app-info"]) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (el) el.style.visibility = "hidden";
    }
  });
  await win.waitForTimeout(600);
  await win.screenshot({ path: path.join(outDir, `${name}.png`), ...(height ? { clip: { x: 0, y: 0, width: 1360, height } } : {}) });
  console.log("captured", name);
};
const bridge = (fn, arg) => win.evaluate(fn, arg);

async function makeProject(name, files) {
  await goto("#/");
  await win.waitForSelector('[data-testid="new-project-name"]');
  await win.fill('[data-testid="new-project-name"]', name);
  await win.click('[data-testid="create-project"]');
  await win.waitForSelector('[data-testid="project-name"]');
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: f });
  }, files);
  await win.click('[data-testid="add-versions"]');
  await win.waitForFunction((n) => document.querySelectorAll('[data-testid="change-summary"]').length === n, files.length, { timeout: 120_000 });
  return (await bridge(async () => (await window.meshdiffDesktop.library.listProjects()).map((p) => ({ id: p.id, name: p.name })))).find((p) => p.name === name).id;
}

try {
  const gearId = await makeProject("Gearbox housing", [path.join(demoDir, "gear-v1.stl"), path.join(demoDir, "gear-v2.stl")]);
  await makeProject("Mounting bracket", [path.join(demoDir, "bracket-v1.stl"), path.join(demoDir, "bracket-v2.stl")]);

  // Sign in as the demo user, connect the gear project to the team, and give it a conversation.
  await bridge(async () => window.meshdiffDesktop.sync.signIn("alex@example.com", "pw"));
  const teamId = (await bridge(async () => window.meshdiffDesktop.sync.listTeams()))[0].id;
  await bridge(async ([p, t]) => window.meshdiffDesktop.sync.connectProject(p, t), [gearId, teamId]);

  const gear = await bridge(async (id) => (await window.meshdiffDesktop.library.getProject(id)).versions.map((v) => v.id), gearId);
  const comments = await bridge(
    async ([id, v2]) => {
      const lib = window.meshdiffDesktop.library;
      const a = await lib.addComment(id, { versionId: v2, body: "Teeth look thin here. Can we add 0.2 mm before printing?", position: [17.7, 10, 2.2], normal: [1, 0, 0] });
      await lib.addComment(id, { versionId: v2, body: "Agreed, bumped the module slightly in the next revision.", position: [17.7, 10, 2.2], parentCommentId: a.id });
      await lib.addComment(id, { versionId: v2, body: "Bore diameter checked against the shaft: 0.15 mm clearance.", position: [10, 10, 4.5], normal: [0, 0, 1] });
      const c = await lib.addComment(id, { versionId: v2, body: "Fillet on the hub looks good.", position: [12.5, 12.5, 4.5], normal: [0, 0, 1] });
      await lib.setCommentStatus(id, c.id, "resolved");
      await window.meshdiffDesktop.sync.syncProject(id);
      return true;
    },
    [gearId, gear[1]],
  );
  console.log("demo workspace ready", comments);

  // 1. The library
  await goto("#/");
  await win.waitForSelector('[data-testid="project-row"]');
  await shot("01-projects", 420);

  // 2. A project's version history, connected to a team
  await goto(`#/p/${gearId}`);
  await win.waitForFunction(() => document.querySelector('[data-testid="sync-status"]')?.getAttribute("data-phase") === "idle", null, { timeout: 30_000 });
  await shot("02-project-versions", 560);

  // 3. A version in 3D, with its stats
  await goto(`#/p/${gearId}/v/${gear[1]}`);
  await win.waitForSelector("canvas");
  await win.waitForFunction(() => !document.body.innerText.includes("Loading model…"), null, { timeout: 60_000 });
  await win.waitForTimeout(2500);
  await shot("03-version-3d");

  // 4. Comments pinned on the model, with a conversation
  await win.click('[data-testid="tab-comments"]');
  await win.waitForTimeout(500);
  await shot("04-comments");

  // 5. Comparing two versions
  await goto(`#/p/${gearId}/compare/${gear[0]}/${gear[1]}`);
  await win.waitForSelector("canvas");
  await win.waitForFunction(() => document.body.innerText.includes("Volume"), null, { timeout: 60_000 });
  await win.waitForTimeout(5000);
  await shot("05-compare");
} finally {
  await app.close().catch(() => undefined);
  await cloud.stop();
  fs.rmSync(work, { recursive: true, force: true });
}
console.log(`screenshots written to ${outDir}`);
