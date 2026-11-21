import http from "node:http";
import { SyncError } from "../errors";
import { FakeCloud } from "./fakeCloud";

/**
 * Serves a FakeCloud over HTTP in the real API's wire format (and a minimal
 * Supabase Auth), so the end-to-end test can run the desktop app's real HTTP client,
 * sign-in and IPC against it. Test tooling only; never shipped.
 */
export interface HttpCloud {
  fake: FakeCloud;
  /** Accounts that can sign in, by email. */
  accounts: Map<string, string>;
  url: string;
  port: number;
  /** Stops accepting connections (the app then sees "offline"). */
  stop(): Promise<void>;
  /** Starts again on the same port. */
  start(): Promise<void>;
}

const STATUS_FOR: Record<string, number> = { unauthorized: 401, team_required: 403, not_found: 404, conflict: 409, server: 500, offline: 503 };

export async function startHttpCloud(fake = new FakeCloud(), port = 0): Promise<HttpCloud> {
  const accounts = new Map<string, string>();
  let server: http.Server | null = null;

  const send = (res: http.ServerResponse, status: number, body?: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };

  const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://x");
    const path = url.pathname;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? (JSON.parse(raw) as Record<string, any>) : {};

    // ---- Supabase Auth ----
    if (path === "/auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      let email: string | null = null;
      if (grant === "password") {
        email = typeof body.email === "string" && accounts.get(body.email) === body.password ? body.email : null;
      } else if (grant === "refresh_token" && typeof body.refresh_token === "string" && body.refresh_token.startsWith("r:")) {
        email = body.refresh_token.slice(2);
      }
      if (!email) return send(res, 400, { error_code: "invalid_credentials", error: "invalid_grant" });
      return send(res, 200, { access_token: `user:${email}`, refresh_token: `r:${email}`, expires_in: 3600, user: { email } });
    }
    if (path === "/auth/v1/logout") return send(res, 204);

    // ---- API (everything needs a bearer token) ----
    const auth = req.headers.authorization ?? "";
    const email = auth.startsWith("Bearer user:") ? auth.slice("Bearer user:".length) : null;
    if (!email || !accounts.has(email)) return send(res, 401, { success: false, error: "Authentication required" });
    const api = fake.as(email);
    const ok = (data: unknown) => send(res, 200, { success: true, data });

    try {
      let m: RegExpMatchArray | null;
      if (req.method === "GET" && path === "/billing/subscription") return ok({ syncEnabled: await api.getSyncEnabled() });
      if (req.method === "GET" && path === "/teams") return ok(await api.listTeams());
      if (req.method === "GET" && path === "/projects") {
        return ok({
          projects: [...fake.projects.values()].map((p) => ({
            id: p.id,
            name: p.name,
            teamId: p.teamId,
            isSample: false,
            versionCount: fake.versions.filter((v) => v.projectId === p.id).length,
          })),
          total: fake.projects.size,
        });
      }
      if (req.method === "POST" && path === "/projects") return ok(await api.createProject(body.name));
      if ((m = path.match(/^\/projects\/([^/]+)$/))) {
        if (req.method === "PATCH") {
          await api.setProjectTeam(m[1]!, body.teamId);
          return ok({ teamId: body.teamId });
        }
        if (req.method === "DELETE") {
          await api.deleteProject(m[1]!);
          return ok(true);
        }
      }
      if ((m = path.match(/^\/projects\/([^/]+)\/versions$/))) {
        if (req.method === "GET") return ok(await api.listVersions(m[1]!));
        if (req.method === "POST") {
          const created = await api.createLocalVersion(m[1]!, { versionId: body.versionId, fileName: body.fileName, fileSize: body.fileSize, contentSha256: body.contentSha256 });
          return ok({ versionId: body.versionId, storageMode: "local", ...created });
        }
      }
      if ((m = path.match(/^\/projects\/([^/]+)\/versions\/([^/]+)\/finalize$/)) && req.method === "POST") {
        await api.finalizeVersion(m[1]!, m[2]!, body.stats, body.comparedToVersionId ?? null);
        return ok({ versionId: m[2] });
      }
      if ((m = path.match(/^\/diff\/([^/]+)\/([^/]+)$/)) && req.method === "GET") {
        const stats = await api.getDiffStats(m[1]!, m[2]!);
        if (!stats) return send(res, 409, { success: false, error: "no cached diff", code: "file_not_in_cloud" });
        return ok(stats);
      }
      if ((m = path.match(/^\/projects\/([^/]+)\/versions\/([^/]+)\/comments$/)) && req.method === "POST") {
        return ok(await api.createComment(m[1]!, m[2]!, { id: body.id, body: body.body, position: body.position, normal: body.normal ?? null, parentCommentId: body.parentCommentId ?? null, createdAt: body.createdAt }));
      }
      if ((m = path.match(/^\/projects\/([^/]+)\/versions\/([^/]+)\/comments\/([^/]+)$/))) {
        if (req.method === "PATCH") {
          await api.setCommentStatus(m[1]!, m[2]!, m[3]!, body.status);
          return ok({});
        }
        if (req.method === "DELETE") {
          await api.deleteComment(m[1]!, m[2]!, m[3]!);
          return ok(true);
        }
      }
      if ((m = path.match(/^\/projects\/([^/]+)\/comments\/changes$/)) && req.method === "GET") {
        const page = await api.getCommentChanges(m[1]!, url.searchParams.get("cursor"));
        return ok({
          changes: page.changes.map((c) =>
            c.kind === "deleted" ? { id: c.id, versionId: c.versionId, deletedAt: "t", updatedAt: "t" } : { ...c.comment },
          ),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        });
      }
      return send(res, 404, { success: false, error: "not mocked" });
    } catch (error) {
      if (error instanceof SyncError) return send(res, STATUS_FOR[error.kind] ?? 500, { success: false, error: error.message, code: error.code });
      return send(res, 500, { success: false, error: "boom" });
    }
  };

  const start = () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req, res) => void handler(req, res));
      server.listen(cloud.port, "127.0.0.1", () => {
        cloud.port = (server!.address() as { port: number }).port;
        cloud.url = `http://127.0.0.1:${cloud.port}`;
        resolve();
      });
    });
  const stop = () =>
    new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.closeAllConnections();
      server.close(() => resolve());
      server = null;
    });

  const cloud: HttpCloud = { fake, accounts, url: "", port, stop, start };
  await start();
  return cloud;
}
