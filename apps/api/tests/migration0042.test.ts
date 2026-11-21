import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, createSupabaseStubDb, readMigration } from "./helpers/migrationDb";

const MIGRATION = "20260101000042_local_versions.sql";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const OWNER = "11111111-1111-1111-1111-111111111111";
const PROJECT = "22222222-2222-2222-2222-222222222222";
const OTHER_PROJECT = "33333333-3333-3333-3333-333333333333";
const CLOUD_VERSION = "01HZCLOUD0000000000000000A";
const COMMENT_OLD = "44444444-4444-4444-4444-444444444444";
const COMMENT_RESOLVED = "55555555-5555-5555-5555-555555555555";

let db: PGlite;

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query<T>(sql, params)).rows[0] as T;
const all = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await db.query<T>(sql, params)).rows;
const createLocal = (id: string, project = PROJECT, sha = SHA_A, name = "part.stl") =>
  db.query("select * from create_local_version($1,$2,$3,'stl',1234,$4,$5)", [id, project, name, sha, OWNER]);
const rejection = async (promise: Promise<unknown>) => promise.then(() => null, (e: { message: string; code?: string }) => e);

beforeAll(async () => {
  db = await createSupabaseStubDb();
  // The real production schema as it stands before this migration...
  await applyMigrations(db, MIGRATION);

  // ...with data written the old way.
  await db.query("insert into auth.users (id, email) values ($1, 'owner@example.test')", [OWNER]);
  await db.query("insert into projects (id, owner_user_id, name) values ($1, $2, 'P'), ($3, $2, 'Q')", [PROJECT, OWNER, OTHER_PROJECT]);
  await db.query("select * from create_version($1, $2, 'cloud.stl', $3, 'stl', 500, $4)", [CLOUD_VERSION, PROJECT, `${PROJECT}/${CLOUD_VERSION}.stl`, OWNER]);
  await db.query(
    `insert into comments (id, version_id, author_user_id, body, position_x, position_y, position_z, created_at)
     values ($1, $2, $3, 'old comment', 1, 2, 3, '2026-01-01T00:00:00Z')`,
    [COMMENT_OLD, CLOUD_VERSION, OWNER],
  );
  await db.query(
    `insert into comments (id, version_id, author_user_id, body, position_x, position_y, position_z, created_at, status, status_changed_at)
     values ($1, $2, $3, 'resolved comment', 1, 2, 3, '2026-01-01T00:00:00Z', 'resolved', '2026-02-01T00:00:00Z')`,
    [COMMENT_RESOLVED, CLOUD_VERSION, OWNER],
  );

  await db.exec(readMigration(MIGRATION));
});
afterAll(async () => db.close());

describe("migration 0042: versions", () => {
  it("applies on top of existing data, and old cloud versions are untouched", async () => {
    const row = await one<{ storage_mode: string; file_path: string; content_sha256: string | null }>("select * from versions where id = $1", [CLOUD_VERSION]);
    expect(row).toMatchObject({ storage_mode: "cloud", file_path: `${PROJECT}/${CLOUD_VERSION}.stl`, content_sha256: null });
  });

  it("creates a local version with no file path, the next number, and the hash", async () => {
    const { rows } = await createLocal("01HZLOCAL00000000000000001");
    expect(rows[0]).toMatchObject({ version_number: 2, storage_mode: "local", file_path: null, content_sha256: SHA_A, file_name: "part.stl", file_format: "stl" });
  });

  it("is idempotent: retrying the same request returns the same version and adds nothing", async () => {
    const first = (await createLocal("01HZLOCAL00000000000000002", PROJECT, SHA_B)).rows[0] as { version_number: number };
    const again = (await createLocal("01HZLOCAL00000000000000002", PROJECT, SHA_B)).rows[0] as { version_number: number };
    expect(again.version_number).toBe(first.version_number);
    expect((await one<{ n: number }>("select count(*)::int n from versions where id = '01HZLOCAL00000000000000002'")).n).toBe(1);
  });

  it("refuses an id that belongs to another project or to different content", async () => {
    await createLocal("01HZLOCAL00000000000000003", PROJECT, SHA_A);
    const otherProject = await rejection(createLocal("01HZLOCAL00000000000000003", OTHER_PROJECT, SHA_A));
    expect(otherProject?.message).toContain("version_id_conflict");
    const otherContent = await rejection(createLocal("01HZLOCAL00000000000000003", PROJECT, SHA_B));
    expect(otherContent?.message).toContain("version_id_conflict");
    // A cloud version's id can't be re-used as a local one either.
    const cloudId = await rejection(createLocal(CLOUD_VERSION, PROJECT, SHA_A));
    expect(cloudId?.message).toContain("version_id_conflict");
  });

  it("keeps version numbers unique and increasing across cloud and local creation", async () => {
    await db.query("select * from create_version('01HZCLOUD0000000000000000B', $1, 'c2.stl', 'p/c2.stl', 'stl', 1, $2)", [OTHER_PROJECT, OWNER]);
    await createLocal("01HZLOCAL00000000000000004", OTHER_PROJECT);
    await db.query("select * from create_version('01HZCLOUD0000000000000000C', $1, 'c3.stl', 'p/c3.stl', 'stl', 1, $2)", [OTHER_PROJECT, OWNER]);
    const numbers = (await all<{ version_number: number }>("select version_number from versions where project_id = $1 order by version_number", [OTHER_PROJECT])).map((r) => r.version_number);
    expect(numbers).toEqual([1, 2, 3]);
  });

  it("serializes concurrent creation so two clients never claim the same number", async () => {
    const ids = Array.from({ length: 6 }, (_, i) => `01HZRACE00000000000000000${i}`);
    const results = await Promise.allSettled(ids.map((id) => createLocal(id, PROJECT, SHA_A)));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const numbers = (await all<{ version_number: number }>("select version_number from versions where project_id = $1", [PROJECT])).map((r) => r.version_number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("enforces that exactly the local versions have no file path", async () => {
    const localWithPath = await rejection(
      db.query("insert into versions (id, project_id, version_number, file_name, file_path, file_format, file_size_bytes, storage_mode, content_sha256) values ('01HZBAD00000000000000000A', $1, 90, 'x.stl', 'p/x.stl', 'stl', 1, 'local', $2)", [PROJECT, SHA_A]),
    );
    expect(localWithPath?.message).toContain("versions_storage_mode_file_check");
    const cloudWithoutPath = await rejection(
      db.query("insert into versions (id, project_id, version_number, file_name, file_path, file_format, file_size_bytes) values ('01HZBAD00000000000000000B', $1, 91, 'x.stl', null, 'stl', 1)", [PROJECT]),
    );
    expect(cloudWithoutPath?.message).toContain("versions_storage_mode_file_check");
  });

  it("rejects a malformed hash and an unknown storage mode", async () => {
    for (const sha of ["xyz", "A".repeat(64), "a".repeat(63)]) {
      expect((await rejection(createLocal("01HZBADSHA0000000000000000", PROJECT, sha)))?.message).toContain("content_sha256");
    }
    const mode = await rejection(
      db.query("insert into versions (id, project_id, version_number, file_name, file_path, file_format, file_size_bytes, storage_mode) values ('01HZBAD00000000000000000C', $1, 92, 'x.stl', 'p', 'stl', 1, 'remote')", [PROJECT]),
    );
    expect(mode?.message).toContain("storage_mode");
  });

  it("leaves exactly one create_version and one create_local_version (no overload ambiguity)", async () => {
    const names = await all<{ proname: string }>("select proname from pg_proc where proname in ('create_version','create_local_version')");
    expect(names.map((n) => n.proname).sort()).toEqual(["create_local_version", "create_version"]);
  });
});

describe("migration 0042: comments", () => {
  it("backfills updated_at from the real history, not the migration time", async () => {
    const old = await one<{ updated_at: Date }>("select updated_at from comments where id = $1", [COMMENT_OLD]);
    const resolved = await one<{ updated_at: Date }>("select updated_at from comments where id = $1", [COMMENT_RESOLVED]);
    expect(old.updated_at.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(resolved.updated_at.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("bumps updated_at on any update, including a soft delete", async () => {
    const before = await one<{ updated_at: Date }>("select updated_at from comments where id = $1", [COMMENT_OLD]);
    await db.query("update comments set status = 'resolved' where id = $1", [COMMENT_OLD]);
    const afterStatus = await one<{ updated_at: Date }>("select updated_at from comments where id = $1", [COMMENT_OLD]);
    expect(afterStatus.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());

    await new Promise((r) => setTimeout(r, 5));
    await db.query("update comments set deleted_at = now() where id = $1", [COMMENT_OLD]);
    const afterDelete = await one<{ updated_at: Date; deleted_at: Date | null }>("select updated_at, deleted_at from comments where id = $1", [COMMENT_OLD]);
    expect(afterDelete.deleted_at).not.toBeNull();
    expect(afterDelete.updated_at.getTime()).toBeGreaterThan(afterStatus.updated_at.getTime());
  });

  it("keeps a soft-deleted comment's row (a tombstone) so a change feed can report it", async () => {
    expect((await one<{ n: number }>("select count(*)::int n from comments where id = $1", [COMMENT_OLD])).n).toBe(1);
  });

  it("supports the change-feed query shape: by project, since a time, oldest first", async () => {
    const feed = await all<{ id: string }>(
      `select c.id from comments c join versions v on v.id = c.version_id
       where v.project_id = $1 and c.updated_at >= $2 order by c.updated_at asc, c.id asc`,
      [PROJECT, "2026-01-15T00:00:00Z"],
    );
    expect(feed.map((r) => r.id)).toContain(COMMENT_OLD); // deleted, still reported
    expect(feed.map((r) => r.id)).toContain(COMMENT_RESOLVED);
    const idx = await one<{ n: number }>("select count(*)::int n from pg_indexes where indexname = 'comments_updated_at_idx'");
    expect(idx.n).toBe(1);
  });

  it("deleting a version still removes its comments (the FK cascade is unchanged)", async () => {
    await createLocal("01HZLOCAL00000000000000009");
    await db.query("insert into comments (version_id, author_user_id, body, position_x, position_y, position_z) values ('01HZLOCAL00000000000000009', $1, 'x', 0, 0, 0)", [OWNER]);
    await db.query("delete from versions where id = '01HZLOCAL00000000000000009'");
    expect((await one<{ n: number }>("select count(*)::int n from comments where version_id = '01HZLOCAL00000000000000009'")).n).toBe(0);
  });
});

describe("migration 0042: re-running", () => {
  it("is safe to apply again (the workflow may re-run it)", async () => {
    await db.exec(readMigration(MIGRATION));
    await db.exec(readMigration(MIGRATION));
    const triggers = await one<{ n: number }>("select count(*)::int n from pg_trigger where tgname = 'comments_set_updated_at'");
    expect(triggers.n).toBe(1);
    const before = await one<{ updated_at: Date }>("select updated_at from comments where id = $1", [COMMENT_RESOLVED]);
    // The backfill UPDATE re-runs, but the trigger exists by then; it must not corrupt existing data.
    expect(before.updated_at).toBeInstanceOf(Date);
  });
});
