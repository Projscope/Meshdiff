import type { VoxelDiffStats } from "../../../../shared/src/engine/diffVoxels";
import type { CloudProjectSummary, CloudTeam } from "../../../../shared/src/desktopBridge";
import type { LocalCommentStatus, Vec3 } from "../../../../shared/src/localLibrary";
import { SyncError } from "./errors";

export interface CloudVersion {
  id: string;
  versionNumber: number;
  fileName: string;
  fileFormat: string;
  fileSizeBytes: number;
  storageMode: "cloud" | "local";
  contentSha256: string | null;
  changeSummary: string | null;
  printabilityStatus: "pass" | "warn" | "fail" | null;
  approvalStatus: string | null;
  createdAt: string;
  uploaderEmail: string | null;
}

export interface CloudComment {
  id: string;
  versionId: string;
  parentCommentId: string | null;
  body: string;
  position: Vec3;
  normal: Vec3 | null;
  status: LocalCommentStatus;
  authorEmail: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when the comment was deleted in the cloud. */
  deletedAt: string | null;
}

export type CloudCommentChange =
  | { kind: "upsert"; comment: CloudComment }
  | { kind: "deleted"; id: string; versionId: string };

export interface CloudCommentPage {
  changes: CloudCommentChange[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface NewCloudComment {
  id: string;
  body: string;
  position: Vec3;
  normal: Vec3 | null;
  parentCommentId: string | null;
  createdAt: string;
}

/** What the sync engine needs from the cloud. The real one talks HTTP; tests use an in-memory one. */
export interface CloudApi {
  getSyncEnabled(): Promise<boolean>;
  listTeams(): Promise<CloudTeam[]>;
  listTeamProjects(teamId: string): Promise<CloudProjectSummary[]>;
  createProject(name: string): Promise<{ id: string }>;
  setProjectTeam(projectId: string, teamId: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;

  listVersions(projectId: string): Promise<CloudVersion[]>;
  /** Idempotent on versionId: a retry returns the version already created. */
  createLocalVersion(
    projectId: string,
    version: { versionId: string; fileName: string; fileSize: number; contentSha256: string },
  ): Promise<{ versionNumber: number; finalized: boolean }>;
  finalizeVersion(projectId: string, versionId: string, stats: VoxelDiffStats, comparedToVersionId: string | null): Promise<void>;
  /** The diff the cloud already holds for this pair, or null when it has none. */
  getDiffStats(versionAId: string, versionBId: string): Promise<VoxelDiffStats | null>;

  /** Idempotent on comment.id. A comment deleted in the meantime comes back with deletedAt set. */
  createComment(projectId: string, versionId: string, comment: NewCloudComment): Promise<CloudComment>;
  setCommentStatus(projectId: string, versionId: string, commentId: string, status: LocalCommentStatus): Promise<void>;
  /** Resolves when the comment is gone, including when it already was. */
  deleteComment(projectId: string, versionId: string, commentId: string): Promise<void>;
  getCommentChanges(projectId: string, cursor: string | null): Promise<CloudCommentPage>;
}

type Fetch = typeof fetch;
const REQUEST_TIMEOUT_MS = 30_000;

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface RawComment {
  id: string;
  versionId?: string;
  parentCommentId: string | null;
  body: string;
  position: Vec3;
  normal: Vec3 | null;
  status: LocalCommentStatus;
  authorEmail: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface RawTombstone {
  id: string;
  versionId: string;
  deletedAt: string;
  updatedAt: string;
}

function fromRawComment(raw: RawComment, versionId: string | undefined): CloudComment {
  return {
    id: raw.id,
    versionId: raw.versionId ?? versionId ?? "",
    parentCommentId: raw.parentCommentId,
    body: raw.body,
    position: raw.position,
    normal: raw.normal,
    status: raw.status,
    authorEmail: raw.authorEmail,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    deletedAt: raw.deletedAt ?? null,
  };
}

export class HttpCloudApi implements CloudApi {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => Promise<string>,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  /** Returns the reply's data, or null for an empty reply or a status listed in `tolerate`. */
  private async request<T>(method: string, path: string, body?: unknown, tolerate: number[] = []): Promise<T | null> {
    const token = await this.getToken();
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // fetch only rejects when nothing came back at all: no network, DNS failure, timeout.
      throw new SyncError(
        "offline",
        "Couldn't reach Meshdiff. Check your internet connection; your changes are kept here and will sync later.",
      );
    }

    let envelope: Envelope<T> | null = null;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      envelope = null;
    }
    if (response.ok && envelope?.success) return (envelope.data ?? null) as T | null;
    if (tolerate.includes(response.status)) return null;

    const message = envelope?.error;
    if (response.status === 401) throw new SyncError("unauthorized", "Your session has expired. Sign in again to keep syncing.");
    if (response.status === 403 && envelope?.code === "team_required") {
      throw new SyncError("team_required", "Syncing is part of the Team plan.", "team_required");
    }
    if (response.status === 403) throw new SyncError("server", message ?? "You don't have access to that.");
    if (response.status === 404) throw new SyncError("not_found", message ?? "That wasn't found in your cloud account.", envelope?.code);
    if (response.status === 409) throw new SyncError("conflict", message ?? "The cloud refused that change.", envelope?.code);
    throw new SyncError("server", message ?? "Meshdiff had a problem. Try again in a moment.");
  }

  private async must<T>(method: string, path: string, body?: unknown): Promise<T> {
    const data = await this.request<T>(method, path, body);
    if (data === null) throw new SyncError("server", "Meshdiff sent an unexpected reply. Try again in a moment.");
    return data;
  }

  async getSyncEnabled(): Promise<boolean> {
    const data = await this.must<{ syncEnabled?: boolean }>("GET", "/billing/subscription");
    return data.syncEnabled === true;
  }

  listTeams(): Promise<CloudTeam[]> {
    return this.must<CloudTeam[]>("GET", "/teams");
  }

  async listTeamProjects(teamId: string): Promise<CloudProjectSummary[]> {
    const data = await this.must<{
      projects: Array<{ id: string; name: string; teamId: string | null; versionCount: number; isSample?: boolean }>;
    }>("GET", "/projects?pageSize=100");
    return data.projects
      .filter((p) => p.teamId === teamId && !p.isSample)
      .map((p) => ({ id: p.id, name: p.name, versionCount: p.versionCount }));
  }

  async createProject(name: string): Promise<{ id: string }> {
    const data = await this.must<{ id: string }>("POST", "/projects", { name });
    return { id: data.id };
  }

  async setProjectTeam(projectId: string, teamId: string): Promise<void> {
    await this.must("PATCH", `/projects/${projectId}`, { teamId });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request("DELETE", `/projects/${projectId}`, undefined, [404]);
  }

  listVersions(projectId: string): Promise<CloudVersion[]> {
    return this.must<CloudVersion[]>("GET", `/projects/${projectId}/versions`);
  }

  async createLocalVersion(
    projectId: string,
    version: { versionId: string; fileName: string; fileSize: number; contentSha256: string },
  ): Promise<{ versionNumber: number; finalized: boolean }> {
    const data = await this.must<{ versionNumber: number; finalized: boolean }>("POST", `/projects/${projectId}/versions`, {
      storageMode: "local",
      versionId: version.versionId,
      fileName: version.fileName,
      fileSize: version.fileSize,
      contentSha256: version.contentSha256,
    });
    return { versionNumber: data.versionNumber, finalized: data.finalized };
  }

  async finalizeVersion(
    projectId: string,
    versionId: string,
    stats: VoxelDiffStats,
    comparedToVersionId: string | null,
  ): Promise<void> {
    await this.must("POST", `/projects/${projectId}/versions/${versionId}/finalize`, {
      stats,
      ...(comparedToVersionId ? { comparedToVersionId } : {}),
    });
  }

  async getDiffStats(versionAId: string, versionBId: string): Promise<VoxelDiffStats | null> {
    try {
      return await this.request<VoxelDiffStats>("GET", `/diff/${versionAId}/${versionBId}`);
    } catch (error) {
      // No cached diff (409) or a version we can't see (404): just no stats, not a failed sync.
      if (error instanceof SyncError && (error.kind === "conflict" || error.kind === "not_found")) return null;
      throw error;
    }
  }

  async createComment(projectId: string, versionId: string, comment: NewCloudComment): Promise<CloudComment> {
    const data = await this.must<RawComment>("POST", `/projects/${projectId}/versions/${versionId}/comments`, {
      id: comment.id,
      body: comment.body,
      position: comment.position,
      ...(comment.normal ? { normal: comment.normal } : {}),
      ...(comment.parentCommentId ? { parentCommentId: comment.parentCommentId } : {}),
      createdAt: comment.createdAt,
    });
    return fromRawComment(data, versionId);
  }

  async setCommentStatus(projectId: string, versionId: string, commentId: string, status: LocalCommentStatus): Promise<void> {
    await this.must("PATCH", `/projects/${projectId}/versions/${versionId}/comments/${commentId}`, { status });
  }

  async deleteComment(projectId: string, versionId: string, commentId: string): Promise<void> {
    await this.request("DELETE", `/projects/${projectId}/versions/${versionId}/comments/${commentId}`, undefined, [404]);
  }

  async getCommentChanges(projectId: string, cursor: string | null): Promise<CloudCommentPage> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const data = await this.must<{
      changes: Array<RawComment | RawTombstone>;
      nextCursor: string | null;
      hasMore: boolean;
    }>("GET", `/projects/${projectId}/comments/changes${query}`);
    return {
      changes: data.changes.map((change): CloudCommentChange =>
        // A tombstone carries no content, only the fact that it is gone.
        "body" in change
          ? { kind: "upsert", comment: fromRawComment(change, change.versionId) }
          : { kind: "deleted", id: change.id, versionId: change.versionId },
      ),
      nextCursor: data.nextCursor,
      hasMore: data.hasMore,
    };
  }
}
