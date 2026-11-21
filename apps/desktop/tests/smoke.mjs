// End-to-end smoke test: launches the real Electron app and checks the things
// that make it a safe, working desktop client. Run `npm run build` first.
//
//   npm run smoke --workspace apps/desktop
//   SMOKE_EXE="path\to\Meshdiff.exe" npm run smoke ...   (test a packaged build)
//   SMOKE_SCREENSHOT=out.png ...                          (save a screenshot)
import { _electron as electron } from "playwright";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagedExe = process.env.SMOKE_EXE;

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

// A throwaway library, so the test never touches the user's real projects.
const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), "meshdiff-smoke-"));
const env = { ...process.env, MESHDIFF_LIBRARY_DIR: libraryDir };

const app = await electron.launch(
  packagedExe
    ? { executablePath: packagedExe, env }
    : { executablePath: require("electron"), args: [appDir], cwd: appDir, env },
);

const consoleErrors = [];
const pageErrors = [];
try {
  const win = await app.firstWindow();
  win.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  win.on("pageerror", (error) => pageErrors.push(error.message));

  await win.waitForSelector('[data-testid="app-info"]', { timeout: 30_000 });

  check("window is served from the app:// protocol", win.url().startsWith("app://meshdiff/"), win.url());
  check("window title", (await win.title()) === "Meshdiff", await win.title());

  const info = await win.evaluate(() => window.meshdiffDesktop?.getInfo());
  check("preload bridge answers getInfo()", !!info && typeof info.appVersion === "string", JSON.stringify(info));
  const infoText = await win.textContent('[data-testid="app-info"]');
  check("header shows the app version", !!info && infoText.includes(`v${info.appVersion}`), infoText);

  const isolation = await win.evaluate(() => ({
    hasRequire: typeof window.require !== "undefined",
    hasProcess: typeof window.process !== "undefined",
    bridgeKeys: Object.keys(window.meshdiffDesktop ?? {}).sort().join(","),
  }));
  check("renderer has no Node (require/process)", !isolation.hasRequire && !isolation.hasProcess, JSON.stringify(isolation));

  const csp = await win.evaluate(async () => (await fetch("/desktop.html")).headers.get("content-security-policy"));
  check("strict CSP header is sent", !!csp && csp.includes("default-src 'none'") && csp.includes("connect-src 'self'"), csp ?? "none");

  // Quick view hosts the single-model viewer. Loading the bundled demo model
  // exercises module web workers, three.js/WebGL and the diff engine under the
  // custom protocol and CSP.
  await win.evaluate(() => {
    window.location.hash = "#/quick";
  });
  await win.getByText("or load demo").click();
  await win.waitForFunction(() => document.body.innerText.includes("gear-v1.stl"), null, { timeout: 60_000 });
  await win.waitForFunction(() => document.body.innerText.includes("Volume"), null, { timeout: 60_000 });
  check("model loads and stats are computed in web workers", true);

  const canvasDrawn = await win.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return !!canvas && canvas.width > 0 && canvas.height > 0;
  });
  check("WebGL canvas is present", canvasDrawn);

  const errorsBeforeProbes = [...consoleErrors];

  // The privacy claim: the renderer cannot reach the network.
  const network = await win.evaluate(async () => {
    const attempt = async (url) => {
      try {
        await fetch(url, { mode: "no-cors" });
        return "reached";
      } catch {
        return "blocked";
      }
    };
    const image = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve("reached");
      img.onerror = () => resolve("blocked");
      img.src = "https://example.com/favicon.ico";
    });
    return { fetchHttps: await attempt("https://example.com/"), fetchHttp: await attempt("http://example.com/"), image };
  });
  check(
    "renderer cannot reach the network (fetch + image)",
    network.fetchHttps === "blocked" && network.fetchHttp === "blocked" && network.image === "blocked",
    JSON.stringify(network),
  );

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  check("no console errors before the network probes", errorsBeforeProbes.length === 0, errorsBeforeProbes.join(" | "));

  const updateStatus = await win.evaluate(() => window.meshdiffDesktop?.getUpdateStatus());
  check("update status is reported", !!updateStatus && typeof updateStatus.state === "string", JSON.stringify(updateStatus));

  if (process.env.SMOKE_SCREENSHOT) {
    await win.screenshot({ path: process.env.SMOKE_SCREENSHOT });
    console.log(`screenshot: ${process.env.SMOKE_SCREENSHOT}`);
  }
} finally {
  await app.close();
  fs.rmSync(libraryDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILED` : "\nAll desktop smoke checks passed");
process.exit(failures ? 1 : 0);
