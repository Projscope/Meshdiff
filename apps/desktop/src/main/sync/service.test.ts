import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSyncStatus } from "../../../../shared/src/desktopBridge";
import type { LocalAnalysis } from "../../../../shared/src/localLibrary";
import { LibraryStore } from "../library/store";
import type { SecretStore } from "./auth";
import type { CloudConfig } from "./config";
import { SyncError } from "./errors";
import { SyncService } from "./service";
import { FakeCloud } from "./testing/fakeCloud";

const config: CloudConfig = { apiUrl: "https://api.test", supabaseUrl: "https://sb.test", supabaseAnonKey: "anon" };
const EMAIL = "alice@acme.test";

let root: string;
let store: LibraryStore;
let cloud: FakeCloud;
let service: SyncService;
let statuses: Array<[string, ProjectSyncStatus]>;
let tokenCalls: string[];
let secrets: SecretStore & { value: string | null };

const analysis = (comparedTo: string | null): LocalAnalysis =>
  ({ stats: { printabilityStatus: "pass", printabilityIssues: [], triangleDeltaB: 3, approxVolumeDeltaMm3: 0, approxVolumeDeltaPercent: 0, boundingBoxDeltaX: 0, boundingBoxDeltaY: 0, boundingBoxDeltaZ: 0 }, changeSummary: "s", printabilityStatus: "pass", comparedToVersionId: comparedTo, analyzedAt: "2026-01-01T00:00:00Z" }) as unknown as LocalAnalysis;

function makeService(withConfig: CloudConfig | null = config) {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    tokenCalls.push(u);
    const grant = u.includes("refresh_token") ? "refreshed" : "fresh";
    return new Response(JSON.stringify({ access_token: grant, refresh_token: "r", expires_in: 3600, user: { email: EMAIL } }), { status: 200 });
  });
  return new SyncService({
    store,
    config: withConfig,
    secrets,
    onStatus: (id, status) => statuses.push([id, status]),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    createApi: () => cloud.as(EMAIL),
  });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "meshdiff-service-"));
  store = new LibraryStore(root);
  cloud = new FakeCloud();
  cloud.syncUsers.add(EMAIL);
  statuses = [];
  tokenCalls = [];
  secrets = { value: null, read() { return this.value; }, write(v: string) { this.value = v; }, clear() { this.value = null; } };
  service = makeService();
});
afterEach(() => {
  service.stopAutoSync();
  fs.rmSync(root, { recursive: true, force: true });
});

async function localProjectWithVersion() {
  const project = await store.createProject("Bracket");
  const version = await store.addVersion(project.id, "a.stl", Buffer.from("one"));
  await store.saveAnalysis(project.id, version.id, analysis(null));
  return { project, version };
}

describe("the account", () => {
  it("reports an unconfigured build plainly, and refuses cloud actions with an explanation", async () => {
    const local = makeService(null);
    expect(await local.getAccount()).toEqual({ configured: false, signedIn: false, email: null, syncEnabled: null });
    await expect(local.signIn("a@b.c", "x")).rejects.toThrow(/isn't set up/);
    await expect(local.listTeams()).rejects.toThrow(/isn't set up/);
    const { project } = await localProjectWithVersion();
    expect(await local.getProjectStatus(project.id)).toMatchObject({ connected: false });
  });

  it("starts signed out, signs in, and reports whether the plan includes syncing", async () => {
    expect(await service.getAccount()).toEqual({ configured: true, signedIn: false, email: null, syncEnabled: null });
    expect(await service.signIn(EMAIL, "pw")).toEqual({ configured: true, signedIn: true, email: EMAIL, syncEnabled: true });
    cloud.syncUsers.delete(EMAIL);
    expect((await service.getAccount()).syncEnabled).toBe(false);
  });

  it("still shows the account when the plan can't be checked (offline)", async () => {
    await service.signIn(EMAIL, "pw");
    cloud.offline = true;
    expect(await service.getAccount()).toMatchObject({ signedIn: true, email: EMAIL, syncEnabled: null });
  });

  it("keeps the session across restarts", async () => {
    await service.signIn(EMAIL, "pw");
    const restarted = makeService();
    expect(await restarted.getAccount()).toMatchObject({ signedIn: true, email: EMAIL });
  });
});

describe("connecting and syncing", () => {
  beforeEach(async () => {
    await service.signIn(EMAIL, "pw");
  });

  it("connects a project, uploads what was there, and reports it as in sync", async () => {
    const { project, version } = await localProjectWithVersion();
    const linked = await service.connectProject(project.id, "team-1");
    expect(linked.cloud?.teamName).toBe("Acme Hardware");
    expect(cloud.versions.map((v) => v.id)).toEqual([version.id]);

    const status = await service.getProjectStatus(project.id);
    expect(status).toMatchObject({ connected: true, phase: "idle", message: null, pendingVersions: 0, pendingComments: 0 });
    expect(status.lastSyncAt).not.toBeNull();
    expect(statuses.some(([, s]) => s.phase === "syncing")).toBe(true); // the page can show progress
  });

  it("refuses to connect a project to a team the user isn't in", async () => {
    const { project } = await localProjectWithVersion();
    await expect(service.connectProject(project.id, "someone-elses-team")).rejects.toThrow(/not a member/);
    expect(cloud.projects.size).toBe(0);
  });

  it("opens a team's project here, filled with its versions", async () => {
    const { project } = await localProjectWithVersion();
    await service.connectProject(project.id, "team-1");
    const cloudId = (await store.snapshot(project.id)).project.cloud!.cloudProjectId;

    expect((await service.listTeamProjects("team-1")).map((p) => p.id)).toEqual([cloudId]);
    const opened = await service.openTeamProject(cloudId, "team-1");
    expect(opened.id).not.toBe(project.id);
    expect((await store.getProject(opened.id))!.versions.map((v) => v.fileName)).toEqual(["a.stl"]);
    await expect(service.openTeamProject("missing", "team-1")).rejects.toThrow(/isn't in this team/);
  });

  it("turns being offline into a status, keeps the changes, and recovers on the next sync", async () => {
    const { project, version } = await localProjectWithVersion();
    await service.connectProject(project.id, "team-1");
    await store.addComment(project.id, { versionId: version.id, body: "later", position: [0, 0, 0] });

    cloud.offline = true;
    const offline = await service.syncProject(project.id); // resolves, never throws
    expect(offline).toMatchObject({ phase: "offline", pendingComments: 1 });
    expect(offline.message).toMatch(/will sync later/);

    cloud.offline = false;
    expect(await service.syncProject(project.id)).toMatchObject({ phase: "idle", message: null, pendingComments: 0 });
  });

  it("explains a plan that doesn't include syncing, without losing anything", async () => {
    const { project } = await localProjectWithVersion();
    await service.connectProject(project.id, "team-1");
    cloud.syncUsers.delete(EMAIL);
    const status = await service.syncProject(project.id);
    expect(status.phase).toBe("team_required");
    expect(status.message).toMatch(/stays on this computer/);
  });

  it("reports items the cloud refused, with the project otherwise in sync", async () => {
    const { project } = await localProjectWithVersion();
    await service.connectProject(project.id, "team-1");
    const second = await store.addVersion(project.id, "b.stl", Buffer.from("two"));
    await store.saveAnalysis(project.id, second.id, analysis(null));
    cloud.failNext("createLocalVersion", new SyncError("conflict", "That version id is already in use"));
    const status = await service.syncProject(project.id);
    expect(status.phase).toBe("error");
    expect(status.message).toMatch(/b\.stl/);
  });

  it("refreshes the session and tries once more when the cloud rejects the token", async () => {
    const { project } = await localProjectWithVersion();
    await service.connectProject(project.id, "team-1");
    tokenCalls.length = 0;
    cloud.failNext("listVersions", new SyncError("unauthorized", "expired"));
    const status = await service.syncProject(project.id);
    expect(status.phase).toBe("idle");
    expect(tokenCalls.filter((u) => u.includes("refresh_token"))).toHaveLength(1);
  });

  it("asks the user to sign in again when the refresh fails too", async () => {
    const { project } = await localProjectWithVersion();
    await service.connectProject(project.id, "team-1");
    cloud.failNext("listVersions", new SyncError("unauthorized", "expired"));
    cloud.failNext("listVersions", new SyncError("unauthorized", "still expired"));
    const status = await service.syncProject(project.id);
    expect(status.phase).toBe("signed_out");
    expect(status.message).toMatch(/Sign in/);
  });

  it("runs one sync per project at a time", async () => {
    const { project } = await localProjectWithVersion();
    await service.connectProject(project.id, "team-1");
    cloud.calls.length = 0;
    const [a, b, c] = await Promise.all([service.syncProject(project.id), service.syncProject(project.id), service.syncProject(project.id)]);
    expect(cloud.count("listVersions")).toBe(1);
    expect(a.phase).toBe("idle");
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("signing out leaves projects connected but marks them as needing a sign-in", async () => {
    const { project } = await localProjectWithVersion();
    await service.connectProject(project.id, "team-1");
    await service.signOut();
    expect((await service.getAccount()).signedIn).toBe(false);
    expect((await store.getProject(project.id))!.project.cloud).toBeDefined();
    const status = await service.getProjectStatus(project.id);
    expect(status).toMatchObject({ connected: true, phase: "signed_out" });
  });

  it("disconnecting stops syncing and clears the status", async () => {
    const { project } = await localProjectWithVersion();
    await service.connectProject(project.id, "team-1");
    await service.disconnectProject(project.id);
    expect(await service.getProjectStatus(project.id)).toMatchObject({ connected: false, phase: "idle" });
    expect(cloud.versions).toHaveLength(1); // the cloud keeps it
  });

  it("syncs every connected project, but only when signed in", async () => {
    const a = await localProjectWithVersion();
    await service.connectProject(a.project.id, "team-1");
    await store.createProject("Not connected");
    const second = await store.addVersion(a.project.id, "b.stl", Buffer.from("two"));
    await store.saveAnalysis(a.project.id, second.id, analysis(null));

    await service.syncAll();
    expect(cloud.versions).toHaveLength(2);

    await service.signOut();
    cloud.calls.length = 0;
    await service.syncAll();
    expect(cloud.calls).toEqual([]); // signed out: no calls at all
  });

  it("does not report a sync problem for a project that was deleted underneath it", async () => {
    const { project } = await localProjectWithVersion();
    await service.connectProject(project.id, "team-1");
    await store.deleteProject(project.id);
    await expect(service.syncProject(project.id)).rejects.toThrow(); // no such project: not a sync status
  });
});
