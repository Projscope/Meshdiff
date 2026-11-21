import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalAnalysis } from "../../../../shared/src/localLibrary";
import { LibraryError, LibraryStore } from "./store";

let root: string;
let store: LibraryStore;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "meshdiff-library-"));
  store = new LibraryStore(root);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const bytes = (text: string) => Buffer.from(text);
const sha = (buffer: Buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const blobFiles = () =>
  fs.existsSync(path.join(root, "blobs"))
    ? fs.readdirSync(path.join(root, "blobs"), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name)
    : [];
// The store only stores the analysis; its contents are the renderer's concern.
const analysis = (comparedToVersionId: string | null): LocalAnalysis =>
  ({ stats: { printabilityStatus: "pass" }, changeSummary: "ok", printabilityStatus: "pass", comparedToVersionId, analyzedAt: new Date().toISOString() }) as unknown as LocalAnalysis;
const rejects = async (promise: Promise<unknown>, message: RegExp) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(LibraryError);
  expect((error as Error).message).toMatch(message);
};

describe("projects", () => {
  it("creates, lists and reloads from disk with a fresh store instance", async () => {
    const project = await store.createProject("  Bracket  ");
    expect(project.name).toBe("Bracket");
    const reopened = new LibraryStore(root);
    const list = await reopened.listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: project.id, name: "Bracket", versionCount: 0, latestFileName: null });
    expect((await reopened.getProject(project.id))?.project.name).toBe("Bracket");
  });

  it("validates names", async () => {
    await rejects(store.createProject("   "), /can't be empty/);
    await rejects(store.createProject("x".repeat(121)), /120 characters/);
    const project = await store.createProject("A");
    await rejects(store.renameProject(project.id, ""), /can't be empty/);
    expect((await store.renameProject(project.id, "B")).name).toBe("B");
  });

  it("returns null for an unknown project and refuses ids that aren't UUIDs (path safety)", async () => {
    expect(await store.getProject(crypto.randomUUID())).toBeNull();
    await rejects(store.getProject("../../etc"), /doesn't exist/);
    await rejects(store.deleteProject("..\\..\\x"), /doesn't exist/);
  });

  it("lists most recently updated first", async () => {
    const a = await store.createProject("A");
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.createProject("B");
    expect((await store.listProjects()).map((p) => p.id)).toEqual([b.id, a.id]);
    await new Promise((r) => setTimeout(r, 5));
    await store.addVersion(a.id, "a.stl", bytes("a"));
    expect((await store.listProjects()).map((p) => p.id)).toEqual([a.id, b.id]);
  });

  it("skips a damaged project when listing but reports it when opened", async () => {
    const good = await store.createProject("Good");
    const bad = await store.createProject("Bad");
    fs.writeFileSync(path.join(root, "projects", bad.id, "project.json"), "{ not json");
    expect((await store.listProjects()).map((p) => p.id)).toEqual([good.id]);
    await rejects(store.getProject(bad.id), /damaged/);
  });

  it("refuses a project written by a newer schema", async () => {
    const project = await store.createProject("Future");
    const file = path.join(root, "projects", project.id, "project.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.schemaVersion = 99;
    fs.writeFileSync(file, JSON.stringify(data));
    await rejects(store.getProject(project.id), /newer version/);
  });

  it("leaves no temp files behind after writes", async () => {
    const project = await store.createProject("P");
    await store.addVersion(project.id, "p.stl", bytes("p"));
    const all = fs.readdirSync(root, { recursive: true }) as string[];
    expect(all.filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});

describe("versions", () => {
  it("hashes the file, numbers versions from 1, and stores it by content hash", async () => {
    const project = await store.createProject("P");
    const content = bytes("solid a\nendsolid a");
    const v1 = await store.addVersion(project.id, "part.STL", content);
    const v2 = await store.addVersion(project.id, "part-2.stl", bytes("solid b"));
    expect(v1).toMatchObject({ number: 1, fileName: "part.STL", format: "stl", sizeBytes: content.length, sha256: sha(content), analysis: null });
    expect(v1.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(v2.number).toBe(2);
    expect(fs.existsSync(path.join(root, "blobs", v1.sha256.slice(0, 2), `${v1.sha256}.stl`))).toBe(true);
  });

  it("stores identical content once", async () => {
    const a = await store.createProject("A");
    const b = await store.createProject("B");
    const same = bytes("same model");
    await store.addVersion(a.id, "one.stl", same);
    await store.addVersion(a.id, "two.stl", same);
    await store.addVersion(b.id, "three.stl", same);
    expect(blobFiles()).toHaveLength(1);
  });

  it("round-trips the bytes", async () => {
    const project = await store.createProject("P");
    const content = crypto.randomBytes(2048);
    const version = await store.addVersion(project.id, "bin.stl", content);
    expect((await store.readVersionBytes(project.id, version.id)).equals(content)).toBe(true);
  });

  it("only accepts STL, OBJ and 3MF, and non-empty files", async () => {
    const project = await store.createProject("P");
    await rejects(store.addVersion(project.id, "notes.txt", bytes("x")), /STL, OBJ and 3MF/);
    await rejects(store.addVersion(project.id, "noext", bytes("x")), /STL, OBJ and 3MF/);
    await rejects(store.addVersion(project.id, "empty.stl", Buffer.alloc(0)), /empty/);
    expect((await store.addVersion(project.id, "a.OBJ", bytes("o"))).format).toBe("obj");
    expect((await store.addVersion(project.id, "b.3mf", bytes("3"))).format).toBe("3mf");
  });

  it("keeps only the file's own name and strips control characters", async () => {
    const project = await store.createProject("P");
    const a = await store.addVersion(project.id, "C:\\Users\\me\\..\\secret\\part.stl", bytes("1"));
    const b = await store.addVersion(project.id, "/tmp/evil/../part2.stl", bytes("2"));
    const c = await store.addVersion(project.id, "bad\u0000na\u0007me.stl", bytes("3"));
    expect([a.fileName, b.fileName, c.fileName]).toEqual(["part.stl", "part2.stl", "badname.stl"]);
  });

  it("never reuses a version number after a delete", async () => {
    const project = await store.createProject("P");
    const v1 = await store.addVersion(project.id, "1.stl", bytes("1"));
    const v2 = await store.addVersion(project.id, "2.stl", bytes("2"));
    await store.deleteVersion(project.id, v2.id);
    const v3 = await store.addVersion(project.id, "3.stl", bytes("3"));
    expect([v1.number, v3.number]).toEqual([1, 3]);
  });

  it("saves an analysis and rejects a malformed comparison id", async () => {
    const project = await store.createProject("P");
    const v1 = await store.addVersion(project.id, "1.stl", bytes("1"));
    const v2 = await store.addVersion(project.id, "2.stl", bytes("2"));
    await store.saveAnalysis(project.id, v2.id, analysis(v1.id));
    const detail = await new LibraryStore(root).getProject(project.id);
    expect(detail?.versions[1]?.analysis?.comparedToVersionId).toBe(v1.id);
    await rejects(store.saveAnalysis(project.id, v2.id, analysis("../x")), /doesn't exist/);
  });

  it("detects a missing or damaged model file", async () => {
    const project = await store.createProject("P");
    const version = await store.addVersion(project.id, "p.stl", bytes("original"));
    const blob = path.join(root, "blobs", version.sha256.slice(0, 2), `${version.sha256}.stl`);
    fs.writeFileSync(blob, "tampered");
    await rejects(store.readVersionBytes(project.id, version.id), /damaged/);
    fs.rmSync(blob);
    await rejects(store.readVersionBytes(project.id, version.id), /missing/);
  });

  it("deleting a version removes its file only when nothing else uses it", async () => {
    const a = await store.createProject("A");
    const b = await store.createProject("B");
    const shared = bytes("shared");
    const inA = await store.addVersion(a.id, "x.stl", shared);
    await store.addVersion(b.id, "y.stl", shared);
    const unique = await store.addVersion(a.id, "u.stl", bytes("unique"));
    await store.deleteVersion(a.id, inA.id);
    expect(blobFiles()).toHaveLength(2); // shared kept (B uses it), unique kept
    await store.deleteVersion(a.id, unique.id);
    expect(blobFiles()).toHaveLength(1); // unique removed
  });

  it("deletes no model file while any project is unreadable, since it can't prove the file is unused", async () => {
    const a = await store.createProject("A");
    const broken = await store.createProject("Broken");
    const brokenFile = path.join(root, "projects", broken.id, "project.json");
    const version = await store.addVersion(a.id, "x.stl", bytes("keep me"));
    fs.writeFileSync(brokenFile, "{ broken");
    await store.deleteVersion(a.id, version.id);
    expect(blobFiles()).toHaveLength(1); // the broken project might still use it
    expect(fs.readFileSync(brokenFile, "utf8")).toBe("{ broken");
    // Once the problem is gone, the next cleanup removes what nothing references.
    fs.rmSync(path.join(root, "projects", broken.id), { recursive: true });
    await store.deleteProject(a.id);
    expect(blobFiles()).toHaveLength(0);
  });

  it("deleting a project removes it and its unshared files only", async () => {
    const a = await store.createProject("A");
    const b = await store.createProject("B");
    await store.addVersion(a.id, "x.stl", bytes("shared"));
    await store.addVersion(b.id, "y.stl", bytes("shared"));
    await store.addVersion(a.id, "z.stl", bytes("only-a"));
    await store.deleteProject(a.id);
    expect((await store.listProjects()).map((p) => p.id)).toEqual([b.id]);
    expect(blobFiles()).toHaveLength(1);
    await rejects(store.deleteProject(a.id), /doesn't exist/);
  });
});

describe("comments", () => {
  async function setup() {
    const project = await store.createProject("P");
    const v1 = await store.addVersion(project.id, "1.stl", bytes("1"));
    const v2 = await store.addVersion(project.id, "2.stl", bytes("2"));
    return { project, v1, v2 };
  }

  it("adds a comment with a client UUID and open status, and persists it", async () => {
    const { project, v1 } = await setup();
    const comment = await store.addComment(project.id, { versionId: v1.id, body: "  too thin  ", position: [1, 2, 3], normal: [0, 0, 1] });
    expect(comment).toMatchObject({ body: "too thin", position: [1, 2, 3], normal: [0, 0, 1], status: "open", parentCommentId: null });
    expect(comment.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(comment).not.toHaveProperty("deletedAt");
    const reopened = await new LibraryStore(root).getProject(project.id);
    expect(reopened?.comments).toHaveLength(1);
    expect(reopened?.comments[0]).not.toHaveProperty("deletedAt");
  });

  it("validates comments", async () => {
    const { project, v1 } = await setup();
    const base = { versionId: v1.id, position: [0, 0, 0] as [number, number, number] };
    await rejects(store.addComment(project.id, { ...base, body: "   " }), /can't be empty/);
    await rejects(store.addComment(project.id, { ...base, body: "x".repeat(5001) }), /5000/);
    await rejects(store.addComment(project.id, { ...base, body: "a", position: [0, NaN, 0] }), /position is invalid/);
    await rejects(store.addComment(project.id, { ...base, body: "a", position: [1, 2] as unknown as [number, number, number] }), /position is invalid/);
    await rejects(store.addComment(project.id, { ...base, body: "a", normal: [Infinity, 0, 0] }), /direction is invalid/);
    await rejects(store.addComment(project.id, { ...base, versionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", body: "a" }), /no longer exists/);
    await rejects(store.addComment(project.id, { ...base, versionId: "nope", body: "a" }), /doesn't exist/);
  });

  it("supports one level of replies on the same version", async () => {
    const { project, v1, v2 } = await setup();
    const root1 = await store.addComment(project.id, { versionId: v1.id, body: "q", position: [0, 0, 0] });
    const reply = await store.addComment(project.id, { versionId: v1.id, body: "a", position: [0, 0, 0], parentCommentId: root1.id });
    expect(reply.parentCommentId).toBe(root1.id);
    await rejects(store.addComment(project.id, { versionId: v1.id, body: "nested", position: [0, 0, 0], parentCommentId: reply.id }), /nested/);
    await rejects(store.addComment(project.id, { versionId: v2.id, body: "elsewhere", position: [0, 0, 0], parentCommentId: root1.id }), /same version/);
    await rejects(store.addComment(project.id, { versionId: v1.id, body: "ghost", position: [0, 0, 0], parentCommentId: crypto.randomUUID() }), /no longer exists/);
  });

  it("changes status and rejects unknown values", async () => {
    const { project, v1 } = await setup();
    const comment = await store.addComment(project.id, { versionId: v1.id, body: "c", position: [0, 0, 0] });
    expect((await store.setCommentStatus(project.id, comment.id, "resolved")).status).toBe("resolved");
    expect((await store.setCommentStatus(project.id, comment.id, "reopened")).status).toBe("reopened");
    await rejects(store.setCommentStatus(project.id, comment.id, "bogus" as never), /invalid/);
    await rejects(store.setCommentStatus(project.id, crypto.randomUUID(), "open"), /no longer exists/);
  });

  it("soft-deletes a thread and keeps a tombstone on disk", async () => {
    const { project, v1 } = await setup();
    const root1 = await store.addComment(project.id, { versionId: v1.id, body: "q", position: [0, 0, 0] });
    await store.addComment(project.id, { versionId: v1.id, body: "a", position: [0, 0, 0], parentCommentId: root1.id });
    const survivor = await store.addComment(project.id, { versionId: v1.id, body: "keep", position: [0, 0, 0] });
    await store.deleteComment(project.id, root1.id);
    expect((await store.getProject(project.id))?.comments.map((c) => c.id)).toEqual([survivor.id]);
    const onDisk = JSON.parse(fs.readFileSync(path.join(root, "projects", project.id, "project.json"), "utf8"));
    expect(onDisk.comments.filter((c: { deletedAt: string | null }) => c.deletedAt !== null)).toHaveLength(2);
    await rejects(store.deleteComment(project.id, root1.id), /no longer exists/);
  });

  it("deleting a version also removes its comments", async () => {
    const { project, v1, v2 } = await setup();
    await store.addComment(project.id, { versionId: v1.id, body: "on 1", position: [0, 0, 0] });
    const keep = await store.addComment(project.id, { versionId: v2.id, body: "on 2", position: [0, 0, 0] });
    await store.deleteVersion(project.id, v1.id);
    expect((await store.getProject(project.id))?.comments.map((c) => c.id)).toEqual([keep.id]);
  });

  it("keeps every change when many writes overlap", async () => {
    const { project, v1 } = await setup();
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => store.addComment(project.id, { versionId: v1.id, body: `c${i}`, position: [i, 0, 0] })),
    );
    const comments = (await new LibraryStore(root).getProject(project.id))?.comments ?? [];
    expect(comments).toHaveLength(25);
    expect(new Set(comments.map((c) => c.body)).size).toBe(25);
  });
});

describe("getInfo", () => {
  it("describes an empty library", async () => {
    expect(await store.getInfo()).toEqual({ path: root, projectCount: 0, versionCount: 0, commentCount: 0, modelBytes: 0, unreadableProjects: 0 });
  });

  it("counts projects, versions, live comments and stored bytes (shared files counted once)", async () => {
    const a = await store.createProject("A");
    const b = await store.createProject("B");
    const shared = bytes("0123456789"); // 10 bytes, stored once
    const v1 = await store.addVersion(a.id, "a.stl", shared);
    await store.addVersion(b.id, "b.stl", shared);
    await store.addVersion(b.id, "c.stl", bytes("abcde")); // 5 bytes
    const keep = await store.addComment(a.id, { versionId: v1.id, body: "keep", position: [0, 0, 0] });
    const drop = await store.addComment(a.id, { versionId: v1.id, body: "drop", position: [0, 0, 0] });
    await store.deleteComment(a.id, drop.id);
    const info = await store.getInfo();
    expect(info).toMatchObject({ projectCount: 2, versionCount: 3, commentCount: 1, modelBytes: 15, unreadableProjects: 0 });
    expect(keep.id).toBeTruthy();
  });

  it("reports damaged projects without counting or touching them, and ignores temp files", async () => {
    const good = await store.createProject("Good");
    const bad = await store.createProject("Bad");
    await store.addVersion(good.id, "g.stl", bytes("12345"));
    const badFile = path.join(root, "projects", bad.id, "project.json");
    fs.writeFileSync(badFile, "{ broken");
    const blobDir = fs.readdirSync(path.join(root, "blobs"))[0]!;
    fs.writeFileSync(path.join(root, "blobs", blobDir, "leftover.tmp"), "x".repeat(1000));
    const info = await store.getInfo();
    expect(info).toMatchObject({ projectCount: 1, versionCount: 1, unreadableProjects: 1, modelBytes: 5 });
    expect(fs.readFileSync(badFile, "utf8")).toBe("{ broken");
  });
});
