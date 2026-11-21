import type {
  CloudAccount,
  CloudProjectSummary,
  CloudTeam,
  ProjectSyncStatus,
  SyncPhase,
} from "../../../../shared/src/desktopBridge";
import type { LocalProject } from "../../../../shared/src/localLibrary";
import { LibraryError, type LibraryStore } from "../library/store";
import { AuthService, type SecretStore } from "./auth";
import { HttpCloudApi, type CloudApi } from "./cloudApi";
import type { CloudConfig } from "./config";
import { SyncEngine, countPending, type SyncResult } from "./engine";
import { SyncError } from "./errors";

export interface SyncServiceDeps {
  store: LibraryStore;
  /** null when this build has no cloud address: the app then runs fully locally. */
  config: CloudConfig | null;
  secrets: SecretStore;
  /** Called whenever a project's sync status changes (to update open windows). */
  onStatus?: (projectId: string, status: ProjectSyncStatus) => void;
  openExternal?: (url: string) => void;
  websiteUrl?: string;
  fetchImpl?: typeof fetch;
  /** Swap in a different cloud (tests use an in-memory one). */
  createApi?: (getToken: () => Promise<string>) => CloudApi;
}

interface Remembered {
  phase: SyncPhase;
  message: string | null;
}

const NOT_CONFIGURED = "Syncing isn't set up in this build of Meshdiff.";

/**
 * Everything the app does with the cloud, in one place: the account, connecting
 * projects, and syncing them. It never throws for the problems a user will meet
 * during a sync (offline, signed out, not on the Team plan): those become a status
 * the page can show calmly, because the local app keeps working regardless.
 */
export class SyncService {
  readonly auth: AuthService | null;
  private readonly api: CloudApi | null;
  private readonly engine: SyncEngine | null;
  private readonly store: LibraryStore;
  private readonly remembered = new Map<string, Remembered>();
  private readonly running = new Map<string, Promise<ProjectSyncStatus>>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: SyncServiceDeps) {
    this.store = deps.store;
    if (deps.config) {
      this.auth = new AuthService(deps.config, deps.secrets, deps.fetchImpl);
      const getToken = () => this.auth!.getAccessToken();
      this.api = deps.createApi ? deps.createApi(getToken) : new HttpCloudApi(deps.config.apiUrl, getToken, deps.fetchImpl);
      this.engine = new SyncEngine(deps.store, this.api);
    } else {
      this.auth = null;
      this.api = null;
      this.engine = null;
    }
  }

  // ---- account ------------------------------------------------------------

  async getAccount(): Promise<CloudAccount> {
    if (!this.auth || !this.api) return { configured: false, signedIn: false, email: null, syncEnabled: null };
    if (!this.auth.signedIn) return { configured: true, signedIn: false, email: null, syncEnabled: null };
    let syncEnabled: boolean | null = null;
    try {
      syncEnabled = await this.withAuthRetry(() => this.api!.getSyncEnabled());
    } catch {
      // Offline or the session just ended: the account still shows, the plan is simply unknown.
    }
    return { configured: true, signedIn: this.auth.signedIn, email: this.auth.email, syncEnabled };
  }

  async signIn(email: string, password: string): Promise<CloudAccount> {
    const auth = this.requireAuth();
    await auth.signIn(email, password);
    return this.getAccount();
  }

  async signOut(): Promise<CloudAccount> {
    await this.auth?.signOut();
    // Projects stay connected; they just can't sync until the user signs in again.
    for (const id of await this.connectedProjectIds()) this.setStatus(id, "signed_out", "Sign in to sync with your team.");
    return this.getAccount();
  }

  openWebsite(page: "signup" | "pricing"): void {
    const base = this.deps.websiteUrl ?? "https://meshdiff.com";
    this.deps.openExternal?.(`${base}/${page === "signup" ? "projects" : "pricing"}`);
  }

  // ---- connecting ---------------------------------------------------------

  listTeams(): Promise<CloudTeam[]> {
    return this.withAuthRetry(() => this.requireApi().listTeams());
  }

  listTeamProjects(teamId: string): Promise<CloudProjectSummary[]> {
    return this.withAuthRetry(() => this.requireApi().listTeamProjects(teamId));
  }

  async connectProject(projectId: string, teamId: string): Promise<LocalProject> {
    const team = await this.findTeam(teamId);
    const project = await this.withAuthRetry(() => this.requireEngine().connectNew(projectId, team));
    // Connecting uploads what is already there; a failure here is a status, not a failed connect.
    await this.syncProject(projectId);
    return (await this.store.getProject(project.id))?.project ?? project;
  }

  async openTeamProject(cloudProjectId: string, teamId: string): Promise<LocalProject> {
    const team = await this.findTeam(teamId);
    const projects = await this.listTeamProjects(teamId);
    const found = projects.find((p) => p.id === cloudProjectId);
    if (!found) throw new SyncError("not_found", "That project isn't in this team any more.");
    const project = await this.withAuthRetry(() => this.requireEngine().openTeamProject(found.id, found.name, team));
    await this.syncProject(project.id);
    return (await this.store.getProject(project.id))?.project ?? project;
  }

  async disconnectProject(projectId: string): Promise<LocalProject> {
    const project = await this.requireEngine().disconnect(projectId);
    this.remembered.delete(projectId);
    this.emit(projectId, await this.getProjectStatus(projectId));
    return project;
  }

  // ---- syncing ------------------------------------------------------------

  /** One sync per project at a time; a second request joins the one already running. */
  syncProject(projectId: string): Promise<ProjectSyncStatus> {
    const existing = this.running.get(projectId);
    if (existing) return existing;
    const run = this.runSync(projectId).finally(() => this.running.delete(projectId));
    this.running.set(projectId, run);
    return run;
  }

  private async runSync(projectId: string): Promise<ProjectSyncStatus> {
    if (!this.engine) throw new LibraryError(NOT_CONFIGURED);
    this.setStatus(projectId, "syncing", null);
    try {
      const result = await this.withAuthRetry(() => this.engine!.sync(projectId));
      this.setStatus(projectId, ...outcomeOf(result));
    } catch (error) {
      if (error instanceof LibraryError) {
        // Not connected (any more), or the project is gone: nothing to report as a sync problem.
        this.remembered.delete(projectId);
      } else {
        this.setStatus(projectId, ...problemOf(error));
      }
    }
    return this.getProjectStatus(projectId);
  }

  async getProjectStatus(projectId: string): Promise<ProjectSyncStatus> {
    const data = await this.store.snapshot(projectId);
    const link = data.project.cloud;
    if (!link) return { connected: false, phase: "idle", message: null, lastSyncAt: null, pendingVersions: 0, pendingComments: 0 };
    const pending = countPending(data);
    const state = this.remembered.get(projectId) ?? { phase: "idle" as SyncPhase, message: null };
    return {
      connected: true,
      // "syncing" is recorded when a run starts and replaced when it ends, so the remembered
      // phase is the truth; checking `running` here would still see the run that is finishing.
      phase: state.phase,
      message: state.message,
      lastSyncAt: link.lastSyncAt,
      pendingVersions: pending.versions,
      pendingComments: pending.comments,
    };
  }

  /** Syncs every connected project every few minutes while the app is open. */
  startAutoSync(intervalMs = 5 * 60 * 1000): void {
    this.stopAutoSync();
    this.timer = setInterval(() => void this.syncAll(), intervalMs);
    this.timer.unref?.();
  }

  stopAutoSync(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async syncAll(): Promise<void> {
    if (!this.auth?.signedIn) return;
    for (const id of await this.connectedProjectIds()) await this.syncProject(id);
  }

  // ---- internals ----------------------------------------------------------

  private async connectedProjectIds(): Promise<string[]> {
    return (await this.store.listProjects()).filter((p) => p.cloud).map((p) => p.id);
  }

  private async findTeam(teamId: string): Promise<{ id: string; name: string }> {
    const team = (await this.listTeams()).find((t) => t.id === teamId);
    if (!team) throw new SyncError("not_found", "You're not a member of that team.");
    return { id: team.id, name: team.name };
  }

  /** Runs a cloud call; if the cloud says the token was refused, refreshes it and tries once more. */
  private async withAuthRetry<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof SyncError && error.kind === "unauthorized" && this.auth?.signedIn) {
        await this.auth.refresh();
        return run();
      }
      throw error;
    }
  }

  private setStatus(projectId: string, phase: SyncPhase, message: string | null): void {
    this.remembered.set(projectId, { phase, message });
    void this.getProjectStatus(projectId).then((status) => this.emit(projectId, status)).catch(() => undefined);
  }

  private emit(projectId: string, status: ProjectSyncStatus): void {
    this.deps.onStatus?.(projectId, status);
  }

  private requireAuth(): AuthService {
    if (!this.auth) throw new LibraryError(NOT_CONFIGURED);
    return this.auth;
  }
  private requireApi(): CloudApi {
    if (!this.api) throw new LibraryError(NOT_CONFIGURED);
    return this.api;
  }
  private requireEngine(): SyncEngine {
    if (!this.engine) throw new LibraryError(NOT_CONFIGURED);
    return this.engine;
  }
}

function outcomeOf(result: SyncResult): [SyncPhase, string | null] {
  if (result.problems.length === 0) return ["idle", null];
  const first = result.problems[0];
  const more = result.problems.length > 1 ? ` (and ${result.problems.length - 1} more)` : "";
  return ["error", `Some changes couldn't be synced: ${first}${more}`];
}

function problemOf(error: unknown): [SyncPhase, string | null] {
  if (error instanceof SyncError) {
    switch (error.kind) {
      case "offline":
        return ["offline", error.message];
      case "unauthorized":
        return ["signed_out", "Sign in to keep syncing with your team."];
      case "team_required":
        return ["team_required", "Syncing is part of the Team plan. Your work stays on this computer."];
      default:
        return ["error", error.message];
    }
  }
  console.error("[sync] unexpected failure:", error);
  return ["error", "Something went wrong while syncing. Your work is safe on this computer; try again."];
}
