// End-to-end test of how the desktop app copes with large models, through the real UI:
// a big model that fits is analysed; one over the limit is refused immediately with an
// explanation (and the app keeps working); an analysis can be cancelled and then retried;
// and a model that is analysed on a "small computer" limit is refused in plain words.
// Run `npm run build` first.
//
//   node tests/large-model-e2e.mjs
//   SMOKE_EXE="path\to\Meshdiff.exe" node tests/large-model-e2e.mjs   (packaged build)
import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagedExe = process.env.SMOKE_EXE;
const work = fs.mkdtempSync(path.join(os.tmpdir(), "meshdiff-large-e2e-"));
const LIMIT = 1_000_000;

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

/** A binary STL of a sphere with about `triangles` triangles (a latitude/longitude grid). */
function writeSphereStl(file, triangles) {
  const cols = Math.max(8, Math.round(Math.sqrt(triangles)));
  const rows = Math.max(4, Math.round(triangles / (2 * cols)));
  const total = rows * cols * 2;
  const buffer = Buffer.alloc(84 + total * 50);
  buffer.write("meshdiff large model test", 0, "ascii");
  buffer.writeUInt32LE(total, 80);
  const point = (r, c) => {
    const lat = (Math.PI * r) / rows - Math.PI / 2;
    const lon = (2 * Math.PI * (c % cols)) / cols;
    return [10 * Math.cos(lat) * Math.cos(lon), 10 * Math.cos(lat) * Math.sin(lon), 10 * Math.sin(lat)];
  };
  let offset = 84;
  const tri = (a, b, c) => {
    offset += 12; // normal left as zero; the app recomputes it
    for (const v of [a, b, c]) for (const n of v) {
      buffer.writeFloatLE(n, offset);
      offset += 4;
    }
    offset += 2;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p00 = point(r, c), p01 = point(r, c + 1), p10 = point(r + 1, c), p11 = point(r + 1, c + 1);
      tri(p00, p10, p11);
      tri(p00, p11, p01);
    }
  }
  fs.writeFileSync(file, buffer);
  return total;
}

const files = {
  fits: path.join(work, "fits-300k.stl"),
  tooBig: path.join(work, "too-big-1_2m.stl"),
  slow: path.join(work, "slow-800k.stl"),
};
const counts = { fits: writeSphereStl(files.fits, 300_000), tooBig: writeSphereStl(files.tooBig, 1_200_000), slow: writeSphereStl(files.slow, 800_000) };
console.log(`generated models: ${Object.entries(counts).map(([k, v]) => `${k}=${v.toLocaleString()}`).join(", ")} triangles`);

async function launch(name, maxTriangles) {
  const env = { ...process.env, MESHDIFF_LIBRARY_DIR: path.join(work, `${name}-library`), MESHDIFF_ANALYSIS_MAX_TRIANGLES: String(maxTriangles) };
  const userArg = `--user-data-dir=${path.join(work, `${name}-userdata`)}`;
  const app = await electron.launch(
    packagedExe ? { executablePath: packagedExe, args: [userArg], env } : { executablePath: require("electron"), args: [appDir, userArg], cwd: appDir, env },
  );
  const win = await app.firstWindow();
  win.on("pageerror", (e) => pageErrors.push(e.message));
  await win.waitForSelector('[data-testid="new-project-name"]', { timeout: 30_000 });
  return { app, win };
}
const pageErrors = [];

async function newProject(win, name) {
  await win.evaluate(() => (location.hash = "#/"));
  await win.waitForSelector('[data-testid="new-project-name"]');
  await win.fill('[data-testid="new-project-name"]', name);
  await win.click('[data-testid="create-project"]');
  await win.waitForSelector('[data-testid="project-name"]');
}
async function addFile(app, win, file) {
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, file);
  await win.click('[data-testid="add-versions"]');
}

const { app, win } = await launch("main", LIMIT);
try {
  // ---- the limit this computer reports ---------------------------------------------
  const limits = await win.evaluate(() => window.meshdiffDesktop.getAnalysisLimits());
  check("the app reports this computer's limit", limits.maxTriangles === LIMIT && limits.totalMemoryMB > 0, JSON.stringify(limits));

  // ---- a big model that fits is analysed ------------------------------------------------
  await newProject(win, "Fits");
  const t0 = Date.now();
  await addFile(app, win, files.fits);
  await win.waitForSelector('[data-testid="change-summary"]', { timeout: 180_000 });
  check("a 300,000-triangle model is analysed", true, `${((Date.now() - t0) / 1000).toFixed(1)} s including parsing`);
  check("with no error shown", (await win.locator('[data-testid="analysis-error"]').count()) === 0);

  // ---- a model over the limit is refused at once, with an explanation ------------------------
  await newProject(win, "Too big");
  const t1 = Date.now();
  await addFile(app, win, files.tooBig);
  await win.waitForSelector('[data-testid="analysis-error"]', { timeout: 60_000 });
  const refusedAfter = (Date.now() - t1) / 1000;
  const message = await win.textContent('[data-testid="analysis-error"]');
  check("an oversized model is refused", true, `after ${refusedAfter.toFixed(1)} s`);
  check("the message gives its size and this computer's limit", message.includes("1,2") && message.includes("up to 1,000,000"), message.slice(0, 160));
  check("it says what to do about it", /Simplify or decimate/.test(message));
  check("and that the file is safe", /safely in your library/.test(message));
  check("the refusal came from the file header, not a long parse", refusedAfter < 20);
  check("the version is still listed (the file wasn't thrown away)", (await win.locator('[data-testid="version-row"]').count()) === 1);
  check("the app is still responsive", await win.evaluate(() => (location.hash = "#/settings") && true));
  await win.evaluate(() => (location.hash = "#/"));
  await win.waitForSelector('[data-testid="new-project-name"]');
  check("and can still list projects", (await win.locator('[data-testid="project-row"]').count()) === 2);

  // ---- cancel a slow analysis, then retry it ------------------------------------------------
  await newProject(win, "Slow");
  await addFile(app, win, files.slow);
  await win.waitForSelector('[data-testid="cancel-analysis"]', { timeout: 60_000 });
  check("a running analysis offers Cancel", true);
  await win.waitForFunction(() => document.body.innerText.includes("large model"), null, { timeout: 15_000 });
  check("and says it is a large model that can take a while", true);
  await win.click('[data-testid="cancel-analysis"]');
  await win.waitForSelector('[data-testid="analysis-error"]', { timeout: 30_000 });
  check("cancelling stops it and says so", (await win.textContent('[data-testid="analysis-error"]')).includes("Analysis cancelled."));
  check("it does not start over by itself", (await win.locator('[data-testid="cancel-analysis"]').count()) === 0);

  await win.click('[data-testid="retry-analysis"]');
  await win.waitForSelector('[data-testid="change-summary"]', { timeout: 240_000 });
  check("Try again runs it to completion (the workers restarted cleanly)", true);
  check("the error is gone", (await win.locator('[data-testid="analysis-error"]').count()) === 0);
} catch (error) {
  failures++;
  console.log("FAIL unexpected error:", error);
}
await app.close().catch(() => undefined);

// ---- a "small computer": the limit is low, so a mid-size model is refused plainly ------------------
try {
  const small = await launch("small", 100_000);
  await newProject(small.win, "Small computer");
  await addFile(small.app, small.win, files.fits); // 300k against a 100k limit
  await small.win.waitForSelector('[data-testid="analysis-error"]', { timeout: 60_000 });
  const text = await small.win.textContent('[data-testid="analysis-error"]');
  check("on a computer with a lower limit the same model is refused", text.includes("up to 100,000"), text.slice(0, 120));
  await small.app.close().catch(() => undefined);
} catch (error) {
  failures++;
  console.log("FAIL unexpected error (small computer):", error);
}

check("no uncaught errors in the window", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 300));
fs.rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
