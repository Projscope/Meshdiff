import { describe, expect, it, vi } from "vitest";
import type { VoxelDiffStats } from "../../../../shared/src/engine/diffVoxels";
import { HttpCloudApi } from "./cloudApi";
import { resolveCloudConfig } from "./config";
import { SyncError } from "./errors";

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
const fail = (status: number, error = "nope", code?: string) => new Response(JSON.stringify({ success: false, error, code }), { status });

function api(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {}));
  const client = new HttpCloudApi("https://api.test", async () => "tok", fetchMock as unknown as typeof fetch);
  return { client, fetchMock };
}

const kindOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(SyncError);
  return error as SyncError;
};

describe("requests", () => {
  it("sends the bearer token, and a JSON body only when there is one", async () => {
    const { client, fetchMock } = api(() => ok([]));
    await client.listTeams();
    const get = fetchMock.mock.calls[0][1]!;
    expect(get.headers).toEqual({ Authorization: "Bearer tok" });
    expect(get.body).toBeUndefined();

    const post = api(() => ok({ id: "p1" }));
    await post.client.createProject("Bracket");
    const init = post.fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Bracket" });
  });

  it("creates a local version with exactly the fields the API expects, and no file", async () => {
    const { client, fetchMock } = api(() => ok({ versionNumber: 3, finalized: false }));
    const result = await client.createLocalVersion("p1", { versionId: "01HZ0000000000000000000001", fileName: "a b.stl", fileSize: 99, contentSha256: "ab".repeat(32) });
    expect(result).toEqual({ versionNumber: 3, finalized: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.test/projects/p1/versions");
    expect(JSON.parse(init!.body as string)).toEqual({
      storageMode: "local", versionId: "01HZ0000000000000000000001", fileName: "a b.stl", fileSize: 99, contentSha256: "ab".repeat(32),
    });
  });

  it("only mentions comparedToVersionId when there is one", async () => {
    const stats = { printabilityStatus: "pass" } as VoxelDiffStats;
    const a = api(() => ok({}));
    await a.client.finalizeVersion("p", "v", stats, null);
    expect(JSON.parse(a.fetchMock.mock.calls[0][1]!.body as string)).toEqual({ stats });
    const b = api(() => ok({}));
    await b.client.finalizeVersion("p", "v", stats, "01HZ0000000000000000000002");
    expect(JSON.parse(b.fetchMock.mock.calls[0][1]!.body as string).comparedToVersionId).toBe("01HZ0000000000000000000002");
  });

  it("URL-encodes the feed cursor", async () => {
    const { client, fetchMock } = api(() => ok({ changes: [], nextCursor: null, hasMore: false }));
    await client.getCommentChanges("p1", "2026-01-01T00:00:00.123456Z|abc-def");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.test/projects/p1/comments/changes?cursor=2026-01-01T00%3A00%3A00.123456Z%7Cabc-def");
  });
});

describe("errors", () => {
  it("turns a network failure into an offline error that reassures the user", async () => {
    const error = await kindOf(api(() => Promise.reject(new TypeError("fetch failed"))).client.listTeams());
    expect(error.kind).toBe("offline");
    expect(error.message).toMatch(/kept here and will sync later/);
  });

  it.each([
    [401, undefined, "unauthorized"],
    [403, "team_required", "team_required"],
    [403, undefined, "server"],
    [404, undefined, "not_found"],
    [409, "version_id_conflict", "conflict"],
    [500, undefined, "server"],
    [502, undefined, "server"],
  ])("maps HTTP %s (%s) to %s", async (status, code, kind) => {
    const error = await kindOf(api(() => fail(status, "server said", code)).client.listTeams());
    expect(error.kind).toBe(kind);
  });

  it("copes with a reply that isn't JSON (e.g. a proxy error page)", async () => {
    const error = await kindOf(api(() => new Response("<html>Bad gateway</html>", { status: 502 })).client.listTeams());
    expect(error.kind).toBe("server");
    expect(error.message).not.toContain("<html>");
  });

  it("treats a success with no data as an unexpected reply, not as nothing", async () => {
    const error = await kindOf(api(() => new Response(JSON.stringify({ success: true }), { status: 200 })).client.listTeams());
    expect(error.kind).toBe("server");
  });

  it("treats deleting something already gone as done", async () => {
    await expect(api(() => fail(404)).client.deleteComment("p", "v", "c")).resolves.toBeUndefined();
    await expect(api(() => fail(404)).client.deleteProject("p")).resolves.toBeUndefined();
    await expect(kindOf(api(() => fail(500)).client.deleteComment("p", "v", "c"))).resolves.toMatchObject({ kind: "server" });
  });

  it("reads 'no cached diff' as no stats rather than a failed sync", async () => {
    expect(await api(() => fail(409, "file_not_in_cloud", "file_not_in_cloud")).client.getDiffStats("a", "b")).toBeNull();
    expect(await api(() => fail(404)).client.getDiffStats("a", "b")).toBeNull();
    await kindOf(api(() => Promise.reject(new TypeError("x"))).client.getDiffStats("a", "b"));
  });
});

describe("reading replies", () => {
  it("syncEnabled is true only when the API says so", async () => {
    expect(await api(() => ok({ syncEnabled: true })).client.getSyncEnabled()).toBe(true);
    expect(await api(() => ok({ syncEnabled: false })).client.getSyncEnabled()).toBe(false);
    expect(await api(() => ok({})).client.getSyncEnabled()).toBe(false); // an older API without the field
  });

  it("lists only this team's real projects", async () => {
    const { client } = api(() =>
      ok({
        projects: [
          { id: "1", name: "A", teamId: "t1", versionCount: 2 },
          { id: "2", name: "B", teamId: "t2", versionCount: 1 },
          { id: "3", name: "Sample", teamId: "t1", versionCount: 2, isSample: true },
          { id: "4", name: "Personal", teamId: null, versionCount: 0 },
        ],
        total: 4,
      }),
    );
    expect(await client.listTeamProjects("t1")).toEqual([{ id: "1", name: "A", versionCount: 2 }]);
  });

  it("tells live comments from tombstones in the feed", async () => {
    const live = { id: "c1", versionId: "v1", parentCommentId: null, body: "hi", position: [1, 2, 3], normal: null, status: "open", authorEmail: "a@b.c", createdAt: "t", updatedAt: "t", deletedAt: null };
    const { client } = api(() =>
      ok({ changes: [live, { id: "c2", versionId: "v1", deletedAt: "t2", updatedAt: "t2" }], nextCursor: "cur", hasMore: true }),
    );
    const page = await client.getCommentChanges("p", null);
    expect(page.changes[0]).toMatchObject({ kind: "upsert", comment: { id: "c1", body: "hi", versionId: "v1" } });
    expect(page.changes[1]).toEqual({ kind: "deleted", id: "c2", versionId: "v1" });
    expect(page).toMatchObject({ nextCursor: "cur", hasMore: true });
  });

  it("fills in the version id on a created comment (the API's reply for a single comment doesn't carry it)", async () => {
    const { client } = api(() => ok({ id: "c1", parentCommentId: null, body: "hi", position: [0, 0, 0], normal: null, status: "open", authorEmail: null, createdAt: "t", updatedAt: "t", deletedAt: null }));
    const comment = await client.createComment("p", "v9", { id: "c1", body: "hi", position: [0, 0, 0], normal: null, parentCommentId: null, createdAt: "t" });
    expect(comment.versionId).toBe("v9");
  });
});

describe("cloud configuration", () => {
  const baked = { apiUrl: "https://baked-api/", supabaseUrl: "https://baked-sb/", supabaseAnonKey: "baked-key" };

  it("uses the build-time values and trims trailing slashes", () => {
    expect(resolveCloudConfig({}, baked)).toEqual({ apiUrl: "https://baked-api", supabaseUrl: "https://baked-sb", supabaseAnonKey: "baked-key" });
  });

  it("lets environment variables override them (to point a build at a local stack)", () => {
    expect(resolveCloudConfig({ MESHDIFF_API_URL: "http://localhost:3001" }, baked)?.apiUrl).toBe("http://localhost:3001");
  });

  it("is null when anything is missing, so the app simply runs locally", () => {
    expect(resolveCloudConfig({}, {})).toBeNull();
    expect(resolveCloudConfig({}, { ...baked, supabaseAnonKey: "" })).toBeNull();
  });
});
