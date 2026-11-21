// End-to-end test of the local library through the real UI: create a project,
// add two versions via the native file picker, see them analyzed, add a comment
// on the 3D model, compare, restart the app and find everything still there,
// then delete. Run `npm run build` first.
//
//   node tests/library-e2e.mjs
//   SMOKE_EXE="path\to\Meshdiff.exe" node tests/library-e2e.mjs   (packaged build)
import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = path.resolve(appDir, "../web/public/demo");
const packagedExe = process.env.SMOKE_EXE;
const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), "meshdiff-library-e2e-"));
const modelFiles = [path.join(demoDir, "gear-v1.stl"), path.join(demoDir, "gear-v2.stl")];

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

function launch() {
  const env = { ...process.env, MESHDIFF_LIBRARY_DIR: libraryDir };
  return electron.launch(
    packagedExe
      ? { executablePath: packagedExe, env }
      : { executablePath: require("electron"), args: [appDir], cwd: appDir, env },
  );
}

const projectJsonPaths = () => {
  const dir = path.join(libraryDir, "projects");
  return fs.existsSync(dir) ? fs.readdirSync(dir).map((id) => path.join(dir, id, "project.json")) : [];
};
const blobFiles = () => {
  const dir = path.join(libraryDir, "blobs");
  return fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()) : [];
};

let app = await launch();
let win = await app.firstWindow();
const pageErrors = [];
const track = (w) => w.on("pageerror", (e) => pageErrors.push(e.message));
track(win);

try {
  // ---- empty library ------------------------------------------------------
  await win.waitForSelector('[data-testid="new-project-name"]', { timeout: 30_000 });
  check("starts on the Projects page with the empty state", (await win.textContent("body")).includes("No projects yet"));
  check("says nothing is uploaded", (await win.textContent("body")).includes("Nothing is uploaded"));

  // ---- create a project ---------------------------------------------------
  await win.fill('[data-testid="new-project-name"]', "Gear test");
  await win.click('[data-testid="create-project"]');
  await win.waitForSelector('[data-testid="project-name"]');
  check("creates a project and opens it", (await win.textContent('[data-testid="project-name"]')).includes("Gear test"));
  check("project is saved to disk", projectJsonPaths().length === 1);

  // ---- add two versions through the (stubbed) native file picker -----------
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
  }, modelFiles);
  await win.click('[data-testid="add-versions"]');
  await win.waitForFunction(() => document.querySelectorAll('[data-testid="version-row"]').length === 2, null, { timeout: 30_000 });
  check("two versions are listed", true);

  // The renderer analyzes each one in a web worker and saves the result.
  await win.waitForFunction(() => document.querySelectorAll('[data-testid="change-summary"]').length === 2, null, { timeout: 120_000 });
  const summaries = await win.locator('[data-testid="change-summary"]').allTextContents();
  check("both versions get a change summary", summaries.every((s) => /Volume (increased|decreased) by/.test(s) && /Printability status:/.test(s)), summaries.join(" | ").slice(0, 160));

  const onDisk = JSON.parse(fs.readFileSync(projectJsonPaths()[0], "utf8"));
  check("versions saved with a hash, numbers 1 and 2", onDisk.versions.length === 2 && onDisk.versions.every((v) => /^[0-9a-f]{64}$/.test(v.sha256)) && onDisk.versions[1].number === 2);
  check("analysis saved to disk (v2 compared to v1)", onDisk.versions[1].analysis?.comparedToVersionId === onDisk.versions[0].id && onDisk.versions[0].analysis?.comparedToVersionId === null);
  check("the two files are stored once each, by hash", blobFiles().length === 2);
  const original = fs.readFileSync(modelFiles[0]);
  const stored = blobFiles().find((e) => e.name.startsWith(onDisk.versions[0].sha256));
  check("stored file is byte-identical to the original", !!stored && fs.readFileSync(path.join(stored.parentPath ?? stored.path, stored.name)).equals(original));

  // ---- open v2 and comment on the model ------------------------------------
  await win.getByRole("link", { name: /^v2 ·/ }).click();
  await win.waitForSelector('[data-testid="version-title"]');
  check("version page shows v2", (await win.textContent('[data-testid="version-title"]')).startsWith("v2"));
  await win.waitForFunction(() => document.body.innerText.includes("Volume"), null, { timeout: 60_000 });
  await win.waitForSelector("canvas");
  // The stats come from the saved analysis, but the 3D model parses separately
  // and the camera then eases into frame: wait for both before clicking it.
  await win.waitForFunction(() => !document.body.innerText.includes("Loading model…"), null, { timeout: 60_000 });
  await win.waitForTimeout(1500);

  await win.getByRole("button", { name: /\+ Add Comment/ }).click();
  // Click around the middle of the canvas until the ray hits the model.
  const box = await win.locator("canvas").first().boundingBox();
  let placed = false;
  for (const [fx, fy] of [[0.5, 0.55], [0.5, 0.5], [0.45, 0.6], [0.55, 0.6], [0.5, 0.65], [0.4, 0.55], [0.6, 0.5]]) {
    await win.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await win.waitForTimeout(500); // the popover renders on the next frame, not instantly
    if (await win.getByPlaceholder("Leave a comment at this point…").count()) {
      placed = true;
      break;
    }
  }
  check("clicking the model places a pending comment", placed);

  if (placed) {
    await win.getByPlaceholder("Leave a comment at this point…").fill("Wall looks too thin here");
    await win.getByRole("button", { name: "Post" }).click();
    await win.waitForFunction(() => document.body.innerText.includes("Wall looks too thin here"), null, { timeout: 15_000 });
    check("the comment appears in the list", true);
    const after = JSON.parse(fs.readFileSync(projectJsonPaths()[0], "utf8"));
    const saved = after.comments.find((c) => c.body === "Wall looks too thin here");
    check(
      "comment saved with model-space position, status open and no deletion mark",
      !!saved && saved.position.length === 3 && saved.position.every(Number.isFinite) && saved.status === "open" && saved.deletedAt === null && saved.versionId === onDisk.versions[1].id,
      JSON.stringify(saved?.position),
    );
  }

  // ---- compare the two versions -------------------------------------------
  await win.getByRole("link", { name: /Gear test/ }).first().click();
  await win.waitForSelector('[data-testid="version-row"]');
  await win.getByLabel("Select v1 to compare").check();
  await win.getByLabel("Select v2 to compare").check();
  await win.click('[data-testid="compare-selected"]');
  await win.waitForSelector('[data-testid="compare-stats"]', { timeout: 120_000 });
  const compareText = await win.textContent('[data-testid="compare-stats"]');
  check("compare page computes added/removed/volume", /\+\d/.test(compareText) && /-\d/.test(compareText), compareText.replace(/\s+/g, " "));
  check("compare page names both versions", (await win.textContent('[data-testid="compare-title"]')).includes("v1") && (await win.textContent('[data-testid="compare-title"]')).includes("v2"));

  // ---- the renderer still can't reach the network ---------------------------
  const network = await win.evaluate(async () => {
    try {
      await fetch("https://example.com/", { mode: "no-cors" });
      return "reached";
    } catch {
      return "blocked";
    }
  });
  check("renderer still cannot reach the network", network === "blocked", network);

  // ---- restart: everything persists ----------------------------------------
  await app.close();
  app = await launch();
  win = await app.firstWindow();
  track(win);
  await win.waitForSelector('[data-testid="project-row"]', { timeout: 30_000 });
  check("project is still there after restarting the app", (await win.textContent('[data-testid="project-row"]')).includes("Gear test"));
  check("row shows 2 versions", (await win.textContent('[data-testid="project-row"]')).includes("2 versions"));
  await win.click('[data-testid="project-row"] a');
  await win.waitForFunction(() => document.querySelectorAll('[data-testid="change-summary"]').length === 2, null, { timeout: 30_000 });
  check("analysis is remembered (no re-analysis needed)", (await win.locator('[data-testid="analyzing"]').count()) === 0);
  await win.getByRole("link", { name: /^v2 ·/ }).click();
  await win.waitForFunction(() => document.body.innerText.includes("Wall looks too thin here"), null, { timeout: 30_000 });
  check("comment is still there after restarting", true);

  // ---- deleting a version removes its comments and (if unshared) its file ---
  await win.getByRole("link", { name: /Gear test/ }).first().click();
  await win.waitForSelector('[data-testid="version-row"]');
  await win.getByRole("button", { name: "Delete v2" }).click();
  await win.getByRole("button", { name: "Delete", exact: true }).click();
  await win.waitForFunction(() => document.querySelectorAll('[data-testid="version-row"]').length === 1, null, { timeout: 15_000 });
  const afterVersionDelete = JSON.parse(fs.readFileSync(projectJsonPaths()[0], "utf8"));
  check("deleted version's comment is gone", afterVersionDelete.comments.every((c) => c.deletedAt !== null));
  check("its model file was removed from disk", blobFiles().length === 1);

  // ---- deleting the project removes everything -----------------------------
  await win.getByRole("link", { name: "← Projects" }).click();
  await win.waitForSelector('[data-testid="project-row"]');
  await win.getByRole("button", { name: "Delete Gear test" }).click();
  await win.getByRole("button", { name: "Delete", exact: true }).click();
  await win.waitForFunction(() => document.body.innerText.includes("No projects yet"), null, { timeout: 15_000 });
  check("deleting the project clears it from disk", projectJsonPaths().length === 0 && blobFiles().length === 0);

  check("no page errors during the whole run", pageErrors.length === 0, pageErrors.join(" | "));
} finally {
  await app.close();
  fs.rmSync(libraryDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILED` : "\nAll library end-to-end checks passed");
process.exit(failures ? 1 : 0);
