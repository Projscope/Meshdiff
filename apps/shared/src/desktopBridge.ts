// Types for the API the Electron preload script exposes to the desktop
// renderer as `window.meshdiffDesktop`. Lives in shared so the main process,
// the preload script and the web renderer all agree on one contract.

import type { LibraryBridge, LocalProject } from "./localLibrary.js";

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

/** The signed-in cloud account, if any. Signing in is optional: the whole local app works without it. */
export interface CloudAccount {
  /** false when this build has no cloud address configured (e.g. a development build). */
  configured: boolean;
  signedIn: boolean;
  email: string | null;
  /** Whether syncing is included in this account's plan (Team); null while signed out. */
  syncEnabled: boolean | null;
}

export interface CloudTeam {
  id: string;
  name: string;
  myRole: "admin" | "approver" | "member";
}

export interface CloudProjectSummary {
  id: string;
  name: string;
  versionCount: number;
}

export type SyncPhase =
  | "idle" // nothing to do, or last sync succeeded
  | "syncing"
  | "offline" // couldn't reach the cloud; changes wait here and go up next time
  | "signed_out" // sign in again to carry on syncing
  | "team_required" // the account's plan doesn't include syncing
  | "error";

export interface ProjectSyncStatus {
  /** false for a project that isn't connected to a team. */
  connected: boolean;
  phase: SyncPhase;
  /** A short, user-readable explanation for offline / signed_out / team_required / error. */
  message: string | null;
  lastSyncAt: string | null;
  /** Local changes that haven't reached the cloud yet. */
  pendingVersions: number;
  pendingComments: number;
}

export interface SyncBridge {
  getAccount(): Promise<CloudAccount>;
  signIn(email: string, password: string): Promise<CloudAccount>;
  signOut(): Promise<CloudAccount>;
  /** Opens the website's sign-up / pricing page in the system browser. */
  openWebsite(page: "signup" | "pricing"): Promise<void>;

  listTeams(): Promise<CloudTeam[]>;
  listTeamProjects(teamId: string): Promise<CloudProjectSummary[]>;
  /** Creates a cloud project in the team for this local project, links it, and syncs. */
  connectProject(projectId: string, teamId: string): Promise<LocalProject>;
  /** Creates a local copy of an existing team project (versions arrive without model files). */
  openTeamProject(cloudProjectId: string, teamId: string): Promise<LocalProject>;
  /** Stops syncing; everything stays on this computer and in the cloud. */
  disconnectProject(projectId: string): Promise<LocalProject>;

  /** Pushes local changes, then pulls teammates'. Resolves with the outcome rather than
   * throwing for expected problems (offline, signed out, not on the Team plan). */
  syncProject(projectId: string): Promise<ProjectSyncStatus>;
  getProjectStatus(projectId: string): Promise<ProjectSyncStatus>;
  /** Subscribes to sync status changes for any project; returns an unsubscribe function. */
  onStatus(callback: (projectId: string, status: ProjectSyncStatus) => void): () => void;
}

export interface MeshdiffDesktopBridge {
  /** The local project/version/comment store on the user's disk. */
  library: LibraryBridge;
  /** Optional cloud account and Team sync; the local app never depends on it. */
  sync: SyncBridge;
  getInfo(): Promise<DesktopInfo>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  /** Quits and installs a downloaded update. */
  installUpdate(): Promise<void>;
  /** Subscribes to update status changes; returns an unsubscribe function. */
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
}
