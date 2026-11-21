import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalAnalysis, LocalVersion } from "../../../../shared/src/localLibrary";
import { LibraryError, LibraryStore } from "../library/store";
import { SyncEngine, countPending, renumber } from "./engine";
import { SyncError } from "./errors";
import { FakeCloud } from "./testing/fakeCloud";

const TEAM = { id: "team-1", name: "Acme Hardware" };

/** One person's desktop app: their own library, talking to the shared fake cloud. */
class Desktop {
  readonly root = fs.mkdtempSync(path.join(os.tmpdir(), "meshdiff-sync-"));
  readonly store = new LibraryStore(this.root);
  readonly engine: SyncEngine;

  constructor(
    readonly cloud: FakeCloud,
    readonly email: string,
  ) {
    cloud.syncUsers.add(email);
    this.engine = new SyncEngine(this.store, cloud.as(email));
  }

  async project(name = "Bracket") {
    return this.store.createProject(name);
  }

  /** Adds a model file and runs the "analysis" the renderer would, so it is ready to sync. */
  async addVersion(projectId: string, fileName: string, content: string, analyse = true): Promise<LocalVersion> {
    const version = await this.store.addVersion(projectId, fileName, Buffer.from(content));
    if (!analyse) return version;
    const detail = await this.store.getProject(projectId);
    const index = detail!.versions.findIndex((v) => v.id === version.id);
    const previous = index > 0 ? detail!.versions[index - 1] : null;
    return this.store.saveAnalysis(projectId, version.id, analysisFor(content, previous?.id ?? null));
  }

  async connected(name = "Bracket") {
    const project = await this.project(name);
    await this.engine.connectNew(project.id, TEAM);
    return project;
  }

  async data(projectId: string) {
    return this.store.snapshot(projectId);
  }

  cleanup() {
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}

function analysisFor(content: string, comparedTo: string | null): LocalAnalysis {
  const stats = {
    printabilityStatus: "pass",
    printabilityIssues: [],
    triangleDeltaB: content.length,
    approxVolumeDeltaMm3: 0,
    approxVolumeDeltaPercent: 0,
    boundingBoxDeltaX: 0,
    boundingBoxDeltaY: 0,
    boundingBoxDeltaZ: 0,
  };
  return { stats, changeSummary: `local summary of ${content}`, printabilityStatus: "pass", comparedToVersionId: comparedTo, analyzedAt: new Date().toISOString() } as unknown as LocalAnalysis;
}

let cloud: FakeCloud;
let alice: Desktop;
let bob: Desktop;
const desktops: Desktop[] = [];

beforeEach(() => {
  cloud = new FakeCloud();
  alice = new Desktop(cloud, "alice@acme.test");
  bob = new Desktop(cloud, "bob@acme.test");
  desktops.push(alice, bob);
});
afterEach(() => {
  while (desktops.length) desktops.pop()!.cleanup();
});

const expectSyncError = async (promise: Promise<unknown>, kind: string) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(SyncError);
  expect((error as SyncError).kind).toBe(kind);
};

/** Bob opens Alice's cloud project as his own linked local copy. */
async function bobOpens(cloudProjectId: string, name = "Bracket") {
  const project = await bob.engine.openTeamProject(cloudProjectId, name, TEAM);
  await bob.engine.sync(project.id);
  return project;
}

describe("connecting", () => {
  it("creates a cloud project in the team and links the local project to it", async () => {
    const project = await alice.project("Gearbox");
    const linked = await alice.engine.connectNew(project.id, TEAM);
    expect(linked.cloud).toMatchObject({ teamId: "team-1", teamName: "Acme Hardware", lastSyncAt: null, commentsCursor: null, ignoredVersionIds: [] });
    const created = cloud.projects.get(linked.cloud!.cloudProjectId);
    expect(created).toMatchObject({ name: "Gearbox", teamId: "team-1", ownerId: "alice@acme.test" });
  });

  it("refuses an account whose plan doesn't include syncing, and creates nothing", async () => {
    const free = new Desktop(cloud, "free@acme.test");
    cloud.syncUsers.delete("free@acme.test");
    desktops.push(free);
    const project = await free.project();
    await expectSyncError(free.engine.connectNew(project.id, TEAM), "team_required");
    expect(cloud.projects.size).toBe(0);
    expect((await free.data(project.id)).project.cloud).toBeUndefined();
  });

  it("cleans up the cloud project if attaching it to the team fails", async () => {
    cloud.failNext("setProjectTeam", new SyncError("server", "nope"));
    const project = await alice.project();
    await expectSyncError(alice.engine.connectNew(project.id, TEAM), "server");
    expect(cloud.projects.size).toBe(0);
    expect((await alice.data(project.id)).project.cloud).toBeUndefined();
  });

  it("won't connect a project twice", async () => {
    const project = await alice.connected();
    await expect(alice.engine.connectNew(project.id, TEAM)).rejects.toThrow(LibraryError);
    expect(cloud.projects.size).toBe(1);
  });

  it("can't sync a project that isn't connected", async () => {
    const project = await alice.project();
    await expect(alice.engine.sync(project.id)).rejects.toThrow(/isn't connected/);
  });
});

describe("pushing", () => {
  it("sends versions in order, numbered by the cloud, with their stats", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    const v2 = await alice.addVersion(project.id, "b.stl", "two");

    const result = await alice.engine.sync(project.id);
    expect(result).toMatchObject({ pushedVersions: 2, problems: [] });

    const cloudVersions = cloud.versions.sort((a, b) => a.versionNumber - b.versionNumber);
    expect(cloudVersions.map((v) => [v.id, v.versionNumber, v.storageMode, v.contentSha256])).toEqual([
      [v1.id, 1, "local", v1.sha256],
      [v2.id, 2, "local", v2.sha256],
    ]);
    expect(cloudVersions[1].stats).not.toBeNull();
    expect(cloudVersions[1].comparedTo).toBe(v1.id);
    const data = await alice.data(project.id);
    expect(data.versions.every((v) => v.cloud?.storageMode === "local")).toBe(true);
    expect(data.project.cloud!.lastSyncAt).not.toBeNull();
  });

  it("never uploads a model file, only its hash", async () => {
    const project = await alice.connected();
    await alice.addVersion(project.id, "secret.stl", "TOP SECRET GEOMETRY");
    await alice.engine.sync(project.id);
    expect(JSON.stringify(cloud.versions)).not.toContain("TOP SECRET");
    expect(cloud.versions[0]).not.toHaveProperty("bytes");
  });

  it("pushes the comments that were already there when the project was connected", async () => {
    const project = await alice.project();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    const comment = await alice.store.addComment(project.id, { versionId: v1.id, body: "Too thin", position: [1, 2, 3] });
    await alice.engine.connectNew(project.id, TEAM);

    const result = await alice.engine.sync(project.id);
    expect(result.pushedComments).toBe(1);
    expect(cloud.comments[0]).toMatchObject({ id: comment.id, body: "Too thin", createdAt: comment.createdAt, versionId: v1.id });
  });

  it("is idempotent: syncing again sends nothing", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    await alice.store.addComment(project.id, { versionId: v1.id, body: "x", position: [0, 0, 0] });
    await alice.engine.sync(project.id);
    const sent = cloud.count("createLocalVersion") + cloud.count("createComment");

    const again = await alice.engine.sync(project.id);
    expect(again).toMatchObject({ pushedVersions: 0, pushedComments: 0 });
    expect(cloud.count("createLocalVersion") + cloud.count("createComment")).toBe(sent);
    expect(cloud.versions).toHaveLength(1);
    expect(cloud.comments).toHaveLength(1);
  });

  it("resumes without duplicating when finalizing fails after the version was created", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    cloud.failNext("finalizeVersion", new SyncError("offline", "dropped"));

    await expectSyncError(alice.engine.sync(project.id), "offline");
    expect(cloud.versions).toHaveLength(1);
    expect((await alice.data(project.id)).versions[0].cloud).toBeUndefined(); // not recorded as synced yet

    await alice.engine.sync(project.id);
    expect(cloud.versions).toHaveLength(1);
    expect(cloud.versions[0].printabilityStatus).toBe("pass");
    expect((await alice.data(project.id)).versions[0].cloud?.versionNumber).toBe(1);
    expect(v1.id).toBe(cloud.versions[0].id);
  });

  it("keeps working offline and catches up later", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    cloud.offline = true;
    await expectSyncError(alice.engine.sync(project.id), "offline");

    // Work continues locally while offline.
    await alice.store.addComment(project.id, { versionId: v1.id, body: "while offline", position: [0, 0, 0] });
    expect(countPending(await alice.data(project.id))).toEqual({ versions: 1, comments: 1 });

    cloud.offline = false;
    const result = await alice.engine.sync(project.id);
    expect(result).toMatchObject({ pushedVersions: 1, pushedComments: 1 });
    expect(countPending(await alice.data(project.id))).toEqual({ versions: 0, comments: 0 });
  });

  it("holds back a version whose analysis isn't ready, and the comments on it", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one", false);
    await alice.store.addComment(project.id, { versionId: v1.id, body: "early", position: [0, 0, 0] });

    expect(await alice.engine.sync(project.id)).toMatchObject({ pushedVersions: 0, pushedComments: 0 });
    expect(cloud.versions).toHaveLength(0);
    expect(cloud.comments).toHaveLength(0);

    await alice.store.saveAnalysis(project.id, v1.id, analysisFor("one", null));
    expect(await alice.engine.sync(project.id)).toMatchObject({ pushedVersions: 1, pushedComments: 1 });
  });

  it("sends a reply only after its parent, and carries status changes and deletions", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    const parent = await alice.store.addComment(project.id, { versionId: v1.id, body: "parent", position: [0, 0, 0] });
    await alice.store.addComment(project.id, { versionId: v1.id, body: "reply", position: [0, 0, 0], parentCommentId: parent.id });
    await alice.engine.sync(project.id);
    expect(cloud.comments.map((c) => c.body).sort()).toEqual(["parent", "reply"]);

    await alice.store.setCommentStatus(project.id, parent.id, "resolved");
    await alice.engine.sync(project.id);
    expect(cloud.comments.find((c) => c.id === parent.id)!.status).toBe("resolved");

    await alice.store.deleteComment(project.id, parent.id);
    await alice.engine.sync(project.id);
    expect(cloud.comments.every((c) => c.deletedAt !== null)).toBe(true); // the reply went with it
  });

  it("doesn't tell the cloud about a comment that was created and deleted before ever syncing", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    const comment = await alice.store.addComment(project.id, { versionId: v1.id, body: "oops", position: [0, 0, 0] });
    await alice.store.deleteComment(project.id, comment.id);
    await alice.engine.sync(project.id);
    expect(cloud.comments).toHaveLength(0);
    expect(cloud.count("deleteComment")).toBe(0);
    expect(countPending(await alice.data(project.id)).comments).toBe(0);
  });

  it("isolates a version the cloud refuses, and syncs the rest", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    await alice.addVersion(project.id, "b.stl", "two");
    // Someone else already owns v1's id in the cloud.
    cloud.versions.push({ id: v1.id, projectId: "other", storageMode: "local", contentSha256: "x", versionNumber: 1 } as never);

    const result = await alice.engine.sync(project.id);
    expect(result.pushedVersions).toBe(1);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("a.stl");
  });

  it("stops for the whole sync when the plan doesn't allow syncing", async () => {
    const project = await alice.connected();
    await alice.addVersion(project.id, "a.stl", "one");
    cloud.syncUsers.delete("alice@acme.test");
    await expectSyncError(alice.engine.sync(project.id), "team_required");
  });

  it("doesn't mark a comment synced if it changed while the request was in flight", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    const comment = await alice.store.addComment(project.id, { versionId: v1.id, body: "x", position: [0, 0, 0] });
    await alice.engine.sync(project.id);
    await alice.store.setCommentStatus(project.id, comment.id, "resolved");

    // The user flips it back while the status push is in flight.
    const original = cloud.as("alice@acme.test");
    let raced = false;
    const racing = new SyncEngine(alice.store, {
      ...original,
      setCommentStatus: async (...args) => {
        await original.setCommentStatus(...args);
        if (!raced) {
          raced = true;
          await alice.store.setCommentStatus(project.id, comment.id, "reopened");
        }
      },
    });
    await racing.sync(project.id);
    const local = (await alice.data(project.id)).comments[0];
    expect(local.status).toBe("reopened");
    expect(local.dirty).toBe(true); // still waiting to go up
    await alice.engine.sync(project.id);
    expect(cloud.comments[0].status).toBe("reopened");
  });
});

describe("pulling: a teammate's first look", () => {
  it("shows versions without files, with their stats and printability from the cloud", async () => {
    const project = await alice.connected();
    await alice.addVersion(project.id, "a.stl", "one");
    await alice.addVersion(project.id, "b.stl", "two");
    await alice.engine.sync(project.id);

    const bobProject = await bobOpens((await alice.data(project.id)).project.cloud!.cloudProjectId);
    const data = await bob.data(bobProject.id);
    expect(data.versions.map((v) => [v.number, v.fileName, v.missingFile, v.cloud?.uploaderEmail])).toEqual([
      [1, "a.stl", true, "alice@acme.test"],
      [2, "b.stl", true, "alice@acme.test"],
    ]);
    expect(data.versions[1].analysis?.stats.printabilityStatus).toBe("pass"); // v2 was diffed against v1
    expect(data.versions[1].analysis?.changeSummary).toBe("Summary of v2");
    expect(data.versions[0].analysis).toBeNull(); // v1 has no previous version, so no cached diff
    expect(data.versions[0].sha256).toBe(cloud.versions[0].contentSha256);
  });

  it("refuses to read a model that isn't on this computer, with a clear message", async () => {
    const project = await alice.connected();
    await alice.addVersion(project.id, "a.stl", "one");
    await alice.engine.sync(project.id);
    const bobProject = await bobOpens((await alice.data(project.id)).project.cloud!.cloudProjectId);
    const [version] = (await bob.data(bobProject.id)).versions;
    await expect(bob.store.readVersionBytes(bobProject.id, version.id)).rejects.toThrow(/Attach your copy/);
  });

  it("accepts the right file for a version, and only the right file", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    await alice.engine.sync(project.id);
    const bobProject = await bobOpens((await alice.data(project.id)).project.cloud!.cloudProjectId);

    await expect(bob.store.attachVersionFile(bobProject.id, v1.id, Buffer.from("two"))).rejects.toThrow(/isn't the same/);
    await expect(bob.store.attachVersionFile(bobProject.id, v1.id, Buffer.from("onf"))).rejects.toThrow(/isn't the same/); // same size, different bytes
    await bob.store.attachVersionFile(bobProject.id, v1.id, Buffer.from("one"));
    expect((await bob.store.readVersionBytes(bobProject.id, v1.id)).toString()).toBe("one");
    expect((await bob.data(bobProject.id)).versions[0].missingFile).toBeUndefined();
    await expect(bob.store.attachVersionFile(bobProject.id, v1.id, Buffer.from("one"))).rejects.toThrow(/already has/);
  });

  it("won't let a file be attached to a version that was uploaded through the website", async () => {
    const project = await alice.connected();
    const cloudId = (await alice.data(project.id)).project.cloud!.cloudProjectId;
    cloud.versions.push({
      id: "01HZ0000000000000000000009", projectId: cloudId, uploaderId: "web", versionNumber: 1, fileName: "w.stl", fileFormat: "stl",
      fileSizeBytes: 3, storageMode: "cloud", contentSha256: null, changeSummary: null, printabilityStatus: "pass", approvalStatus: "approved",
      createdAt: cloud.clock(), uploaderEmail: "web@acme.test", stats: null, comparedTo: null,
    });
    const bobProject = await bobOpens(cloudId);
    await expect(bob.store.attachVersionFile(bobProject.id, "01HZ0000000000000000000009", Buffer.from("abc"))).rejects.toThrow(/website/);
  });
});

describe("comments between teammates", () => {
  async function shared() {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    const comment = await alice.store.addComment(project.id, { versionId: v1.id, body: "Wall is thin here", position: [1, 2, 3], normal: [0, 0, 1] });
    await alice.engine.sync(project.id);
    const bobProject = await bobOpens((await alice.data(project.id)).project.cloud!.cloudProjectId);
    return { project, v1, comment, bobProject };
  }

  it("brings a teammate's comment across with its position, normal and author", async () => {
    const { bobProject, comment } = await shared();
    const [seen] = (await bob.data(bobProject.id)).comments;
    expect(seen).toMatchObject({ id: comment.id, body: "Wall is thin here", position: [1, 2, 3], normal: [0, 0, 1], authorEmail: "alice@acme.test", status: "open" });
  });

  it("carries a reply, a resolve and a delete in both directions", async () => {
    const { project, comment, bobProject } = await shared();

    const reply = await bob.store.addComment(bobProject.id, { versionId: comment.versionId, body: "Thickening it", position: [1, 2, 3], parentCommentId: comment.id });
    await bob.engine.sync(bobProject.id);
    await alice.engine.sync(project.id);
    expect((await alice.data(project.id)).comments.find((c) => c.id === reply.id)).toMatchObject({ body: "Thickening it", authorEmail: "bob@acme.test", parentCommentId: comment.id });

    await bob.store.setCommentStatus(bobProject.id, comment.id, "resolved");
    await bob.engine.sync(bobProject.id);
    await alice.engine.sync(project.id);
    expect((await alice.data(project.id)).comments.find((c) => c.id === comment.id)!.status).toBe("resolved");

    await alice.store.deleteComment(project.id, comment.id);
    await alice.engine.sync(project.id);
    await bob.engine.sync(bobProject.id);
    expect((await bob.store.getProject(bobProject.id))!.comments).toEqual([]);
  });

  it("lets a pending local change win over an older remote one (last writer, by sync time)", async () => {
    const { project, comment, bobProject } = await shared();
    await bob.store.setCommentStatus(bobProject.id, comment.id, "resolved"); // bob, not yet synced
    await alice.store.setCommentStatus(project.id, comment.id, "reopened");
    await alice.engine.sync(project.id); // alice reaches the cloud first
    await bob.engine.sync(bobProject.id); // then bob: his pending change is applied last
    expect(cloud.comments[0].status).toBe("resolved");
    await alice.engine.sync(project.id);
    expect((await alice.data(project.id)).comments[0].status).toBe("resolved");
  });

  it("doesn't overwrite a local change with the remote copy while it is still pending", async () => {
    const { project, comment, bobProject } = await shared();
    await alice.store.setCommentStatus(project.id, comment.id, "resolved");
    await bob.store.setCommentStatus(bobProject.id, comment.id, "reopened");
    await bob.engine.sync(bobProject.id);
    // Alice pulls, but her pending change must survive the pull and then be pushed.
    cloud.offline = false;
    await alice.engine.sync(project.id);
    expect(cloud.comments[0].status).toBe("resolved");
  });

  it("pulls across several pages and remembers where it got to", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    for (let i = 0; i < 5; i++) await alice.store.addComment(project.id, { versionId: v1.id, body: `c${i}`, position: [i, 0, 0] });
    await alice.engine.sync(project.id);

    const bobProject = await bobOpens((await alice.data(project.id)).project.cloud!.cloudProjectId);
    expect((await bob.store.getProject(bobProject.id))!.comments).toHaveLength(5);
    const cursor = (await bob.data(bobProject.id)).project.cloud!.commentsCursor;
    expect(cursor).toBeTruthy();

    // A later sync asks only for what is new.
    cloud.calls.length = 0;
    await alice.store.addComment(project.id, { versionId: v1.id, body: "late", position: [9, 0, 0] });
    await alice.engine.sync(project.id);
    await bob.engine.sync(bobProject.id);
    expect((await bob.store.getProject(bobProject.id))!.comments).toHaveLength(6);
  });

  it("doesn't lose a page if the app stops mid-way: the cursor only moves with the applied page", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    for (let i = 0; i < 4; i++) await alice.store.addComment(project.id, { versionId: v1.id, body: `c${i}`, position: [i, 0, 0] });
    await alice.engine.sync(project.id);
    const bobProject = await bob.engine.openTeamProject((await alice.data(project.id)).project.cloud!.cloudProjectId, "Bracket", TEAM);

    cloud.failNext("getCommentChanges", new SyncError("offline", "x"));
    await bob.engine.sync(bobProject.id).catch(() => undefined);
    expect((await bob.data(bobProject.id)).project.cloud!.commentsCursor).toBeNull();

    // Fail on the second page: the first page's comments and cursor are kept.
    const original = cloud.as("bob@acme.test");
    let pages = 0;
    const flaky = new SyncEngine(bob.store, {
      ...original,
      getCommentChanges: async (...args) => {
        if (++pages === 2) throw new SyncError("offline", "x");
        return original.getCommentChanges(...args);
      },
    });
    await flaky.sync(bobProject.id).catch(() => undefined);
    expect((await bob.data(bobProject.id)).comments).toHaveLength(2);

    await bob.engine.sync(bobProject.id);
    expect((await bob.data(bobProject.id)).comments).toHaveLength(4);
  });
});

describe("versions after the first sync", () => {
  it("renumbers local drafts after the cloud's versions, and numbers them properly once pushed", async () => {
    const project = await alice.connected();
    await alice.addVersion(project.id, "a.stl", "one");
    await alice.engine.sync(project.id);
    const bobProject = await bobOpens((await alice.data(project.id)).project.cloud!.cloudProjectId);

    // Bob adds a draft while Alice pushes two more.
    const draft = await bob.addVersion(bobProject.id, "bob.stl", "bobs", false);
    await alice.addVersion(project.id, "b.stl", "two");
    await alice.addVersion(project.id, "c.stl", "three");
    await alice.engine.sync(project.id);

    await bob.engine.sync(bobProject.id);
    let versions = (await bob.data(bobProject.id)).versions;
    expect(versions.map((v) => [v.number, v.fileName])).toEqual([[1, "a.stl"], [2, "b.stl"], [3, "c.stl"], [4, "bob.stl"]]);

    await bob.store.saveAnalysis(bobProject.id, draft.id, analysisFor("bobs", "01HZ0000000000000000000000"));
    await bob.engine.sync(bobProject.id);
    versions = (await bob.data(bobProject.id)).versions;
    expect(versions.at(-1)!.cloud?.versionNumber).toBe(4);
    expect(cloud.versions.find((v) => v.id === draft.id)?.versionNumber).toBe(4);
  });

  it("doesn't bring back a version the user removed here, nor push comment deletions for it", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    await alice.store.addComment(project.id, { versionId: v1.id, body: "keep me in the cloud", position: [0, 0, 0] });
    await alice.engine.sync(project.id);

    await alice.store.deleteVersion(project.id, v1.id);
    expect((await alice.data(project.id)).project.cloud!.ignoredVersionIds).toEqual([v1.id]);
    await alice.engine.sync(project.id);

    expect((await alice.data(project.id)).versions).toHaveLength(0);
    expect(cloud.versions).toHaveLength(1); // still there for the team
    expect(cloud.comments.every((c) => c.deletedAt === null)).toBe(true);
    expect(cloud.count("deleteComment")).toBe(0);
  });

  it("keeps a version the team deleted, but never pushes it back", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    await alice.engine.sync(project.id);
    cloud.deleteVersion(v1.id);

    await alice.engine.sync(project.id);
    const [kept] = (await alice.data(project.id)).versions;
    expect(kept).toMatchObject({ id: v1.id, cloud: { removedInCloud: true } });
    expect(cloud.versions).toHaveLength(0);
    expect(cloud.count("createLocalVersion")).toBe(1);
  });
});

describe("disconnecting", () => {
  it("keeps files and comments, drops file-less stubs, and stops syncing", async () => {
    const project = await alice.connected();
    const v1 = await alice.addVersion(project.id, "a.stl", "one");
    await alice.store.addComment(project.id, { versionId: v1.id, body: "mine", position: [0, 0, 0] });
    await alice.engine.sync(project.id);
    const cloudId = (await alice.data(project.id)).project.cloud!.cloudProjectId;

    const bobProject = await bobOpens(cloudId);
    const bobsOwn = await bob.addVersion(bobProject.id, "bobs.stl", "bobs");
    await bob.engine.disconnect(bobProject.id);

    const data = await bob.data(bobProject.id);
    expect(data.project.cloud).toBeUndefined();
    expect(data.versions.map((v) => v.id)).toEqual([bobsOwn.id]); // the stub of Alice's v1 is gone
    expect(data.comments).toEqual([]); // and so are the comments that hung on it
    expect(data.versions[0].cloud).toBeUndefined();
    await expect(bob.engine.sync(bobProject.id)).rejects.toThrow(/isn't connected/);
    expect(cloud.versions).toHaveLength(1); // the cloud is untouched
  });
});

describe("renumber", () => {
  it("never reuses a number and keeps the list strictly increasing", async () => {
    const data = {
      schemaVersion: 1,
      project: { id: "p", name: "n", createdAt: "", updatedAt: "" },
      comments: [],
      nextVersionNumber: 4,
      versions: [
        { id: "d1", number: 3, createdAt: "2", cloud: undefined },
        { id: "s2", number: 9, createdAt: "1", cloud: { versionNumber: 2 } },
        { id: "s1", number: 1, createdAt: "0", cloud: { versionNumber: 1 } },
      ],
    } as never as Parameters<typeof renumber>[0];
    renumber(data);
    expect(data.versions.map((v) => [v.id, v.number])).toEqual([["s1", 1], ["s2", 2], ["d1", 3]]);
    expect(data.nextVersionNumber).toBe(4);
  });
});

describe("hashing", () => {
  it("the hash sent to the cloud is the SHA-256 of the file's bytes", async () => {
    const project = await alice.connected();
    await alice.addVersion(project.id, "a.stl", "exact bytes");
    await alice.engine.sync(project.id);
    expect(cloud.versions[0].contentSha256).toBe(crypto.createHash("sha256").update("exact bytes").digest("hex"));
  });
});

describe("data from the cloud is checked before it is stored", () => {
  it("ignores malformed versions and comments from the cloud, and keeps the good ones", async () => {
    const project = await alice.connected();
    await alice.addVersion(project.id, "a.stl", "one");
    await alice.engine.sync(project.id);
    const cloudId = (await alice.data(project.id)).project.cloud!.cloudProjectId;

    // A teammate (or a faulty server) sends junk next to the real data.
    cloud.versions.push(
      { id: "../../etc/passwd", projectId: cloudId, uploaderId: "x", versionNumber: 2, fileName: "x.stl", fileFormat: "stl", fileSizeBytes: 1, storageMode: "local", contentSha256: "a".repeat(64), changeSummary: null, printabilityStatus: null, approvalStatus: null, createdAt: cloud.clock(), uploaderEmail: "x@y.z", stats: null, comparedTo: null },
      { id: "01HZ0000000000000000000007", projectId: cloudId, uploaderId: "x", versionNumber: 3, fileName: "evil.exe", fileFormat: "exe", fileSizeBytes: 1, storageMode: "local", contentSha256: "a".repeat(64), changeSummary: null, printabilityStatus: null, approvalStatus: null, createdAt: cloud.clock(), uploaderEmail: "x@y.z", stats: null, comparedTo: null },
    );
    const v1 = (await alice.data(project.id)).versions[0];
    const now = cloud.clock();
    cloud.comments.push(
      { id: "not-a-uuid", projectId: cloudId, authorId: "x", versionId: v1.id, parentCommentId: null, body: "bad id", position: [0, 0, 0], normal: null, status: "open", authorEmail: "x@y.z", createdAt: now, updatedAt: now, deletedAt: null },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", projectId: cloudId, authorId: "x", versionId: v1.id, parentCommentId: null, body: "bad position", position: [Number.NaN, 0, 0], normal: null, status: "open", authorEmail: "x@y.z", createdAt: now, updatedAt: now, deletedAt: null },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", projectId: cloudId, authorId: "x", versionId: v1.id, parentCommentId: null, body: "fine", position: [1, 1, 1], normal: null, status: "open", authorEmail: "x@y.z", createdAt: now, updatedAt: now, deletedAt: null },
    );

    await alice.engine.sync(project.id);
    const data = await alice.data(project.id);
    expect(data.versions.map((v) => v.id)).toEqual([v1.id]);
    expect(data.comments.map((c) => c.body)).toEqual(["fine"]);
  });
});
