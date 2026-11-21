import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { FakeSupabase } from "./helpers/fakeSupabase";
import {
  MEMBER, OUTSIDER, OWNER, PROJECT_ID, authHeader, buildApp, giveTeamPlan, givePro,
  registerCreateLocalVersion, seedTeamProject, validStats,
} from "./helpers/scenario";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../src/lib/supabase.js", () => ({ getSupabase: () => holder.db }));

const VERSION_ID = "01HZ0000000000000000000001";
const SHA = "c".repeat(64);

let db: FakeSupabase;
let app: FastifyInstance;

const create = (user: string, body: Record<string, unknown> = {}) =>
  app.inject({
    method: "POST",
    url: `/projects/${PROJECT_ID}/versions`,
    headers: authHeader(user),
    payload: { fileName: "My Bracket v2.stl", fileSize: 3_000_000_000, storageMode: "local", contentSha256: SHA, versionId: VERSION_ID, ...body },
  });

const finalize = (user: string, versionId = VERSION_ID, body: Record<string, unknown> = { stats: validStats() }) =>
  app.inject({ method: "POST", url: `/projects/${PROJECT_ID}/versions/${versionId}/finalize`, headers: authHeader(user), payload: body });

beforeEach(async () => {
  db = new FakeSupabase();
  holder.db = db;
  seedTeamProject(db);
  registerCreateLocalVersion(db);
  giveTeamPlan(db, OWNER);
  const { default: versionsRoute } = await import("../src/routes/versions");
  app = await buildApp([versionsRoute]);
});
afterEach(async () => app.close());

describe("creating a local version", () => {
  it("lets the Team owner sync without uploading a file", async () => {
    const res = await create(OWNER);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ versionId: VERSION_ID, versionNumber: 1, storageMode: "local", finalized: false });
    // No signed upload URL, and nothing stored but the hash.
    expect(res.json().data.uploadUrl).toBeUndefined();
    expect(db.rows("versions")[0]).toMatchObject({ file_path: null, content_sha256: SHA, storage_mode: "local" });
  });

  it("keeps the real file name and does not apply the 50MB upload cap", async () => {
    await create(OWNER);
    expect(db.rows("versions")[0].file_name).toBe("My Bracket v2.stl");
  });

  it("lets a team member ride the owner's plan", async () => {
    expect((await create(MEMBER)).statusCode).toBe(200);
  });

  it("is idempotent: the same request again returns the same version and says whether it was finalized", async () => {
    await create(OWNER);
    const again = await create(OWNER);
    expect(again.statusCode).toBe(200);
    expect(again.json().data.versionNumber).toBe(1);
    expect(db.rows("versions")).toHaveLength(1);

    db.rows("versions")[0].printability_status = "pass";
    expect((await create(OWNER)).json().data.finalized).toBe(true);
  });

  it("answers 409 when the id belongs to different content", async () => {
    await create(OWNER);
    const res = await create(OWNER, { contentSha256: "d".repeat(64) });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("version_id_conflict");
  });

  it("refuses with team_required for a Pro-only account", async () => {
    db.tables.subscriptions = [];
    givePro(db, OWNER);
    const res = await create(OWNER);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("team_required");
    expect(db.rows("versions")).toHaveLength(0);
  });

  it("refuses an account whose only access is the free trial", async () => {
    db.tables.subscriptions = [];
    db.addUser(OWNER, "o@example.test", new Date().toISOString()); // just signed up
    const res = await create(OWNER);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("team_required");
  });

  it("admits someone trialing Team", async () => {
    db.tables.subscriptions = [];
    db.addUser(OWNER, "o@example.test", new Date().toISOString());
    db.seed("trial_tier_choice", { user_id: OWNER, tier: "team" });
    expect((await create(OWNER)).statusCode).toBe(200);
  });

  it("still admits a member who is also inside their own free trial", async () => {
    db.addUser(MEMBER, "m@example.test", new Date().toISOString());
    expect((await create(MEMBER)).statusCode).toBe(200);
  });

  it("refuses a member once the owner's Team plan has lapsed", async () => {
    db.rows("subscriptions")[0].status = "canceled";
    const res = await create(MEMBER);
    expect(res.statusCode).toBe(403);
  });

  it("hides the project from someone with no access", async () => {
    expect((await create(OUTSIDER)).statusCode).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "POST", url: `/projects/${PROJECT_ID}/versions`, payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ["a bad hash", { contentSha256: "XYZ" }],
    ["an uppercase hash", { contentSha256: "C".repeat(64) }],
    ["a missing hash", { contentSha256: undefined }],
    ["a bad version id", { versionId: "not-a-ulid" }],
    ["a missing version id", { versionId: undefined }],
    ["an unknown mode", { storageMode: "remote" }],
    ["a bad extension", { fileName: "part.exe" }],
    ["a zero size", { fileSize: 0 }],
  ])("rejects %s", async (_label, body) => {
    const res = await create(OWNER, body);
    expect(res.statusCode).toBe(400);
    expect(db.rows("versions")).toHaveLength(0);
  });

  it("leaves the cloud upload flow's 50MB cap in place", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/versions`,
      headers: authHeader(OWNER),
      payload: { fileName: "big.stl", fileSize: 60 * 1024 * 1024 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("50MB");
  });
});

describe("finalizing a local version", () => {
  beforeEach(async () => {
    await create(OWNER);
  });

  it("stores the stats-derived fields and seeds nothing twice", async () => {
    const res = await finalize(OWNER);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ versionId: VERSION_ID, triangleCount: 12000, printabilityStatus: "warn" });
    expect(db.rows("versions")[0]).toMatchObject({ triangle_count: 12000, printability_status: "warn" });
    expect(String(db.rows("versions")[0].change_summary)).toContain("Volume decreased");
  });

  it("is idempotent: finalizing again changes nothing and repeats no side effects", async () => {
    await finalize(OWNER);
    const updatesBefore = db.callsTo("versions", "update").length;
    const eventsBefore = db.callsTo("product_events", "insert").length;
    const again = await finalize(OWNER, VERSION_ID, { stats: validStats({ triangleDeltaB: 1 }) });
    expect(again.statusCode).toBe(200);
    expect(again.json().data.triangleCount).toBe(12000); // the stored result, not the retry's
    expect(db.callsTo("versions", "update")).toHaveLength(updatesBefore);
    expect(db.callsTo("product_events", "insert")).toHaveLength(eventsBefore);
  });

  it("rejects malformed stats instead of storing NaN", async () => {
    const res = await finalize(OWNER, VERSION_ID, { stats: validStats({ triangleDeltaB: undefined }) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("triangleDeltaB");
    expect(db.rows("versions")[0].triangle_count).toBeNull();
  });

  it("only lets the person who synced the version supply its stats", async () => {
    const res = await finalize(MEMBER);
    expect(res.statusCode).toBe(403);
    expect(db.rows("versions")[0].triangle_count).toBeNull();
  });

  it("caches the diff only when it was computed against the previous version", async () => {
    const SECOND = "01HZ0000000000000000000002";
    await finalize(OWNER);
    await create(OWNER, { versionId: SECOND, contentSha256: "e".repeat(64) });

    await finalize(OWNER, SECOND, { stats: validStats(), comparedToVersionId: "01HZ000000000000000000FFFF" });
    expect(db.callsTo("version_diffs", "upsert")).toHaveLength(0);

    // Retrying with the right comparison is a no-op (already finalized), so use a fresh version.
    const THIRD = "01HZ0000000000000000000003";
    await create(OWNER, { versionId: THIRD, contentSha256: "f".repeat(64) });
    await finalize(OWNER, THIRD, { stats: validStats(), comparedToVersionId: SECOND });
    expect(db.callsTo("version_diffs", "upsert")).toHaveLength(1);
    expect(db.rows("version_diffs")[0]).toMatchObject({ version_a_id: SECOND, version_b_id: THIRD });
  });

  it("is also gated by the Team plan", async () => {
    db.tables.subscriptions = [];
    givePro(db, OWNER);
    const res = await finalize(OWNER);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("team_required");
  });
});

describe("a cloud version's finalize is unchanged apart from stricter stats", () => {
  it("still finalizes for a Pro account", async () => {
    db.tables.subscriptions = [];
    givePro(db, OWNER);
    db.seed("versions", {
      id: "01HZ000000000000000000000C", project_id: PROJECT_ID, version_number: 1, file_name: "a.stl",
      file_path: `${PROJECT_ID}/a.stl`, storage_mode: "cloud", uploaded_by_user_id: OWNER, printability_status: null,
    });
    const res = await finalize(OWNER, "01HZ000000000000000000000C");
    expect(res.statusCode).toBe(200);
  });
});
