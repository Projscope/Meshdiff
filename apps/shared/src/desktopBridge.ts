// Types for the API the Electron preload script exposes to the desktop
// renderer as `window.meshdiffDesktop`. Lives in shared so the main process,
// the preload script and the web renderer all agree on one contract.

import type { LibraryBridge } from "./localLibrary.js";

export interface DesktopInfo {
  appVersion: string;
  electronVersion: string;
  platform: string;
  /** false when running from source (`electron .`), true in an installed build. */
  isPackaged: boolean;
}

export type UpdateState = "idle" | "checking" | "available" | "downloading" | "ready" | "error" | "unsupported";

export interface UpdateStatus {
  state: UpdateState;
  version?: string;
  /** 0..100 while downloading. */
  percent?: number;
  message?: string;
}

export interface MeshdiffDesktopBridge {
  /** The local project/version/comment store on the user's disk. */
  library: LibraryBridge;
  getInfo(): Promise<DesktopInfo>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  /** Quits and installs a downloaded update. */
  installUpdate(): Promise<void>;
  /** Subscribes to update status changes; returns an unsubscribe function. */
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
}
