import { app, BrowserWindow, ipcMain, protocol, session, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeAnalysisLimits } from "../../../shared/src/analysisLimits";
import type { DesktopInfo } from "../../../shared/src/desktopBridge";
import { checkForUpdates, getUpdateStatus, initUpdater, installUpdate } from "./updater";
import { registerLibraryIpc } from "./library/ipc";
import { LibraryStore } from "./library/store";
import { resolveCloudConfig } from "./sync/config";
import { broadcastStatus, registerSyncIpc } from "./sync/ipc";
import { SafeStorageSecrets } from "./sync/secrets";
import { SyncService } from "./sync/service";

const APP_HOST = "meshdiff";
const APP_ORIGIN = `app://${APP_HOST}`;

// Strict by design: the renderer can only talk to itself. All network access
// (API, sign-in, updates) happens in this main process, so "it cannot send your
// files anywhere" is something you can check, not just a claim.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".obj": "text/plain; charset=utf-8",
};

// Must run before the app is ready. `standard` + `secure` make app:// behave
// like a normal https origin (module workers, absolute /assets paths), which
// file:// cannot.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function rendererDir(): string {
  if (process.env.MESHDIFF_RENDERER_DIR) return path.resolve(process.env.MESHDIFF_RENDERER_DIR);
  return app.isPackaged
    ? path.join(process.resourcesPath, "renderer")
    : path.resolve(__dirname, "../../web/dist-desktop");
}

async function serveRenderer(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.host !== APP_HOST) return new Response("Not found", { status: 404 });

  const root = rendererDir();
  const requested = decodeURIComponent(url.pathname === "/" ? "/desktop.html" : url.pathname);
  const file = path.resolve(root, `.${requested}`);
  // Never serve anything outside the renderer bundle.
  if (file !== root && !file.startsWith(root + path.sep)) return new Response("Forbidden", { status: 403 });

  try {
    const body = await fs.promises.readFile(file);
    return new Response(body, {
      headers: {
        "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "Content-Security-Policy": CSP,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function lockDownSession(): void {
  const ses = session.defaultSession;
  // Belt and braces on top of the CSP: refuse any request that isn't to the
  // app itself or an in-memory URL.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const allowed =
      url.startsWith(`${APP_ORIGIN}/`) ||
      url.startsWith("blob:") ||
      url.startsWith("data:") ||
      url.startsWith("devtools:");
    callback({ cancel: !allowed });
  });
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Meshdiff",
    backgroundColor: "#15181e",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    // Links the user clicks (docs, website) open in their browser, never in-app.
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });

  void window.loadURL(`${APP_ORIGIN}/`);
  return window;
}

function registerIpc(): void {
  ipcMain.handle(
    "desktop:getInfo",
    (): DesktopInfo => ({
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
      isPackaged: app.isPackaged,
    }),
  );
  // Worked out fresh each time: how much memory is free changes while the app runs.
  ipcMain.handle("desktop:getAnalysisLimits", () => {
    const limits = computeAnalysisLimits(os.totalmem(), os.freemem());
    // For testing and support: MESHDIFF_ANALYSIS_MAX_TRIANGLES forces the limit (e.g. to try a small computer).
    const forced = Number(process.env.MESHDIFF_ANALYSIS_MAX_TRIANGLES);
    if (Number.isFinite(forced) && forced > 0) limits.maxTriangles = Math.floor(forced);
    return limits;
  });
  ipcMain.handle("desktop:getUpdateStatus", () => getUpdateStatus());
  ipcMain.handle("desktop:checkForUpdates", () => checkForUpdates());
  ipcMain.handle("desktop:installUpdate", () => installUpdate());
}

// Every web contents the app ever creates (not just the main window) gets the same lock-down.
app.on("web-contents-created", (_event, contents) => {
  // No <webview>, ever: it would be a way to load something other than our own page.
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  void app.whenReady().then(() => {
    protocol.handle("app", serveRenderer);
    lockDownSession();
    registerIpc();
    // MESHDIFF_LIBRARY_DIR lets tests use a throwaway library instead of the user's real one.
    const libraryRoot = process.env.MESHDIFF_LIBRARY_DIR ?? path.join(app.getPath("userData"), "library");
    const store = new LibraryStore(libraryRoot);
    registerLibraryIpc(store, APP_ORIGIN);

    // Cloud sync is optional: with no cloud configured, or nobody signed in, nothing here
    // touches the network. Only this process ever talks to the cloud, never the renderer.
    const sync = new SyncService({
      store,
      config: resolveCloudConfig(),
      secrets: new SafeStorageSecrets(path.join(app.getPath("userData"), "cloud-session.bin")),
      onStatus: broadcastStatus,
      openExternal: (url) => {
        if (url.startsWith("https://")) void shell.openExternal(url);
      },
    });
    registerSyncIpc(sync, APP_ORIGIN);
    sync.startAutoSync();
    // Catch up shortly after launch, once the window is up (a no-op when signed out).
    setTimeout(() => void sync.syncAll(), 10_000).unref();
    createWindow();
    initUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
