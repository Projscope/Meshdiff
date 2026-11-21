import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { MEMBER, OUTSIDER, OWNER, PROJECT_ID, authHeader, buildApp, giveTeamPlan, givePro, seedTeamProject } from "./helpers/scenario";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../src/lib/supabase.js", () => ({ getSupabase: () => holder.db }));

const VERSION_ID = "01HZ0000000000000000000001";
const OTHER_VERSION = "01HZ0000000000000000000002";
const C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const C2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const C3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const REPLY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

let db: FakeSupabase;
let app: FastifyInstance;

const commentsUrl = `/projects/${PROJECT_ID}/versions/${VERSION_ID}/comments`;
const post = (user: string, body: Record<string, unknown> = {}, url = commentsUrl) =>
  app.inject({ method: "POST", url, headers: authHeader(user), payload: { body: "Hole is too tight", position: [1, 2, 3], ...body } });
const list = (user: string) => app.inject({ method: "GET", url: commentsUrl, headers: authHeader(user) });
const del = (user: string, id: string) =>
  app.inject({ method: "DELETE", url: `${commentsUrl}/${id}`, headers: authHeader(user) });
const changes = (user: string, query = "") =>
  app.inject({ method: "GET", url: `/projects/${PROJECT_ID}/comments/changes${query}`, headers: authHeader(user) });

beforeEach(async () => {
  db = new FakeSupabase();
  holder.db = db;
  seedTeamProject(db);
  giveTeamPlan(db, OWNER);
  for (const [id, n] of [[VERSION_ID, 1], [OTHER_VERSION, 2]] as const) {
    db.seed("versions", { id, project_id: PROJECT_ID, version_number: n, file_name: "a.stl", file_path: null, storage_mode: "local" });
  }
  const { default: commentsRoute } = await import("../src/routes/comments");
  app = await buildApp([commentsRoute]);
});
afterEach(async () => app.close());

describe("creating a comment with a client id", () => {
  it("uses the client's id and offline timestamp", async () => {
    const created = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const res = await post(OWNER, { id: C1, createdAt: created });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: C1, createdAt: created, body: "Hole is too tight", deletedAt: null });
    expect(db.rows("comments")[0]).toMatchObject({ id: C1, created_at: created });
  });

  it("still works without them (the web client)", async () => {
    const res = await post(OWNER);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("is idempotent: a retried create returns the same comment and sends nothing twice", async () => {
    db.rpcs.get_user_id_by_email = () => ({ data: MEMBER });
    const first = await post(OWNER, { id: C1, body: `ping @${MEMBER}@example.test please` });
    const notificationsAfterFirst = db.rows("notifications").length;
    expect(notificationsAfterFirst).toBeGreaterThan(0); // the first create did notify
    const again = await post(OWNER, { id: C1, body: `ping @${MEMBER}@example.test please` });
    expect(again.statusCode).toBe(200);
    expect(again.json().data.id).toBe(first.json().data.id);
    expect(db.rows("comments")).toHaveLength(1);
    expect(db.rows("notifications")).toHaveLength(notificationsAfterFirst);
  });

  it("returns the existing comment even when its parent has since been deleted", async () => {
    await post(OWNER, { id: C1 });
    await post(OWNER, { id: REPLY, parentCommentId: C1 });
    await del(OWNER, C1);
    const retry = await post(OWNER, { id: REPLY, parentCommentId: C1 });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.deletedAt).not.toBeNull(); // so the client can tell it is gone
  });

  it("will not let someone else take an id", async () => {
    await post(OWNER, { id: C1 });
    const res = await post(MEMBER, { id: C1 });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("comment_id_conflict");
    expect(db.rows("comments")).toHaveLength(1);
  });

  it("will not reuse an id on another version", async () => {
    await post(OWNER, { id: C1 });
    const res = await post(OWNER, { id: C1 }, `/projects/${PROJECT_ID}/versions/${OTHER_VERSION}/comments`);
    expect(res.statusCode).toBe(409);
  });

  it.each([
    ["a non-UUID id", { id: "comment-1" }],
    ["a malformed time", { createdAt: "yesterday" }],
    ["a time in the future", { createdAt: new Date(Date.now() + 3_600_000).toISOString() }],
    ["a time before the product existed", { createdAt: "2001-01-01T00:00:00Z" }],
  ])("rejects %s", async (_label, extra) => {
    const res = await post(OWNER, extra);
    expect(res.statusCode).toBe(400);
    expect(db.rows("comments")).toHaveLength(0);
  });

  it("accepts a time a few seconds ahead (clock skew) and clamps it to now", async () => {
    const ahead = new Date(Date.now() + 60_000).toISOString();
    const res = await post(OWNER, { createdAt: ahead });
    expect(res.statusCode).toBe(200);
    expect(new Date(res.json().data.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("deleting a comment", () => {
  beforeEach(async () => {
    await post(OWNER, { id: C1 });
    await post(OWNER, { id: REPLY, parentCommentId: C1 });
  });

  it("keeps a tombstone instead of removing the row", async () => {
    expect((await del(OWNER, C1)).statusCode).toBe(200);
    expect(db.rows("comments").find((c) => c.id === C1)?.deleted_at).toBeTruthy();
  });

  it("takes the replies with it, as the foreign key used to", async () => {
    await del(OWNER, C1);
    expect(db.rows("comments").find((c) => c.id === REPLY)?.deleted_at).toBeTruthy();
  });

  it("removes notifications that pointed at it", async () => {
    db.seed("notifications", { recipient_user_id: MEMBER, comment_id: C1 }, { recipient_user_id: MEMBER, comment_id: C2 });
    await del(OWNER, C1);
    expect(db.rows("notifications").map((n) => n.comment_id)).toEqual([C2]);
  });

  it("disappears from the list", async () => {
    await del(OWNER, C1);
    expect((await list(OWNER)).json().data).toEqual([]);
  });

  it("is not found a second time", async () => {
    await del(OWNER, C1);
    expect((await del(OWNER, C1)).statusCode).toBe(404);
  });

  it("can no longer be edited or replied to", async () => {
    await del(OWNER, C1);
    const patch = await app.inject({ method: "PATCH", url: `${commentsUrl}/${C1}`, headers: authHeader(OWNER), payload: { status: "resolved" } });
    expect(patch.statusCode).toBe(404);
    expect((await post(OWNER, { parentCommentId: C1 })).statusCode).toBe(404);
  });

  it("is still limited to the author or a moderator", async () => {
    const res = await del(MEMBER, C1);
    expect(res.statusCode).toBe(403);
    expect(db.rows("comments").find((c) => c.id === C1)?.deleted_at).toBeNull();
  });
});

describe("the comment changes feed", () => {
  beforeEach(async () => {
    await post(OWNER, { id: C1 });
    await post(OWNER, { id: C2 });
    await post(OWNER, { id: C3 }, `/projects/${PROJECT_ID}/versions/${OTHER_VERSION}/comments`);
  });

  it("lists every comment in the project, oldest change first, across versions", async () => {
    const res = await changes(OWNER);
    expect(res.statusCode).toBe(200);
    const { changes: items, hasMore, nextCursor } = res.json().data;
    expect(items.map((c: { id: string }) => c.id)).toEqual([C1, C2, C3]);
    expect(items[2].versionId).toBe(OTHER_VERSION);
    expect(hasMore).toBe(false);
    expect(nextCursor).toMatch(/^.+Z\|[0-9a-f-]{36}$/);
  });

  it("reports an edit by moving that comment to the end", async () => {
    await app.inject({ method: "PATCH", url: `${commentsUrl}/${C1}`, headers: authHeader(OWNER), payload: { status: "resolved" } });
    const ids = (await changes(OWNER)).json().data.changes.map((c: { id: string }) => c.id);
    expect(ids).toEqual([C2, C3, C1]);
  });

  it("reports a deletion as a tombstone with none of the content", async () => {
    await del(OWNER, C2);
    const items = (await changes(OWNER)).json().data.changes;
    const tombstone = items.find((c: { id: string }) => c.id === C2);
    expect(tombstone).toEqual({ id: C2, versionId: VERSION_ID, deletedAt: expect.any(String), updatedAt: expect.any(String) });
    expect(tombstone.body).toBeUndefined();
  });

  it("pages: limit, hasMore, and a cursor that carries on from the last row", async () => {
    const first = (await changes(OWNER, "?limit=2")).json().data;
    expect(first.changes).toHaveLength(2);
    expect(first.hasMore).toBe(true);

    const call = db.callsTo("comments", "select").at(-1);
    expect(call?.or).toBeUndefined();

    await changes(OWNER, `?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`);
    const { updatedAt, id } = { updatedAt: first.nextCursor.split("|")[0], id: first.nextCursor.split("|")[1] };
    expect(db.callsTo("comments", "select").at(-1)?.or).toBe(
      `updated_at.gt."${updatedAt}",and(updated_at.eq."${updatedAt}",id.gt."${id}")`,
    );
  });

  it("hands the same cursor back when there is nothing new", async () => {
    const { nextCursor } = (await changes(OWNER)).json().data;
    db.tables.comments = [];
    const res = await changes(OWNER, `?cursor=${encodeURIComponent(nextCursor)}`);
    expect(res.json().data).toEqual({ changes: [], nextCursor, hasMore: false });
  });

  it.each([
    ["a malformed cursor", "?cursor=nonsense"],
    ["an injection attempt in the cursor", `?cursor=${encodeURIComponent('2026-01-01T00:00:00Z"),id.neq.("|' + C1)}`],
    ["a non-numeric limit", "?limit=abc"],
    ["a zero limit", "?limit=0"],
  ])("rejects %s", async (_label, query) => {
    expect((await changes(OWNER, query)).statusCode).toBe(400);
  });

  it("caps the page size at 500 however much is asked for", async () => {
    for (let i = 0; i < 600; i++) {
      db.seed("comments", {
        id: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`, version_id: VERSION_ID, author_user_id: OWNER,
        body: "x", position_x: 0, position_y: 0, position_z: 0, status: "open", created_at: db.now(), updated_at: db.now(), deleted_at: null,
      });
    }
    const data = (await changes(OWNER, "?limit=100000")).json().data;
    expect(data.changes).toHaveLength(500);
    expect(data.hasMore).toBe(true);
  });

  it("is a Team feature", async () => {
    db.tables.subscriptions = [];
    givePro(db, OWNER);
    const res = await changes(OWNER);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("team_required");
  });

  it("works for a team member and hides the project from an outsider", async () => {
    expect((await changes(MEMBER)).statusCode).toBe(200);
    expect((await changes(OUTSIDER)).statusCode).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: `/projects/${PROJECT_ID}/comments/changes` });
    expect(res.statusCode).toBe(401);
  });
});
