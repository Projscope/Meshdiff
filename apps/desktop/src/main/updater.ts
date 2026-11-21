import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateStatus } from "../../../shared/src/desktopBridge";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 10_000;

// Updates only make sense for an installed build; `electron .` from source has
// no update feed.
let status: UpdateStatus = { state: app.isPackaged ? "idle" : "unsupported" };

function setStatus(next: UpdateStatus): void {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("desktop:update-status", status);
  }
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setStatus({ state: "error", message: error instanceof Error ? error.message : "Update check failed" });
  }
  return status;
}

export function installUpdate(): void {
  if (status.state === "ready") autoUpdater.quitAndInstall();
}

export function initUpdater(): void {
  if (!app.isPackaged) return;

  // The feed (the public releases repo) is baked into the build by
  // electron-builder's `publish` setting; nothing is configured here.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => setStatus({ state: "checking" }));
  autoUpdater.on("update-available", (info) => setStatus({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => setStatus({ state: "idle" }));
  autoUpdater.on("download-progress", (progress) =>
    setStatus({ state: "downloading", version: status.version, percent: progress.percent }),
  );
  autoUpdater.on("update-downloaded", (info) => setStatus({ state: "ready", version: info.version }));
  autoUpdater.on("error", (error) => setStatus({ state: "error", message: error.message }));

  setTimeout(() => void checkForUpdates(), FIRST_CHECK_DELAY_MS);
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS);
}
