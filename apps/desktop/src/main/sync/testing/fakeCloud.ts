import { randomUUID } from "node:crypto";
import type { VoxelDiffStats } from "../../../../../shared/src/engine/diffVoxels";
import type { CloudProjectSummary, CloudTeam } from "../../../../../shared/src/desktopBridge";
import type { LocalCommentStatus } from "../../../../../shared/src/localLibrary";
import type { CloudApi, CloudComment, CloudCommentPage, CloudVersion, NewCloudComment } from "../cloudApi";
import { SyncError } from "../errors";

interface FakeVersion extends CloudVersion {
  projectId: string;
  uploaderId: string;
  stats: VoxelDiffStats | null;
  comparedTo: string | null;
}

interface FakeComment extends CloudComment {
  projectId: string;
  authorId: string;
}

interface FakeProject {
  id: string;
  name: string;
  teamId: string | null;
  ownerId: string;
}

/**
 * An in-memory stand-in for the Meshdiff cloud that follows the real API's rules:
 * creates are idempotent on the client's id, version numbers are assigned in
 * arrival order, comments are soft-deleted and reported by a cursor feed, and the
 * feed is read by everyone on the team. `as(email)` gives a client for one user, so
 * a test can run two desktops against the same cloud.
 */
export class FakeCloud {
  readonly teams: CloudTeam[] = [{ id: "team-1", name: "Acme Hardware", myRole: "admin" }];
  projects = new Map<string, FakeProject>();
  versions: FakeVersion[] = [];
  comments: FakeComment[] = [];
  /** Users whose plan includes syncing. */
  syncUsers = new Set<string>();
  /** When true every call fails as if there were no network. */
  offline = false;
  /** Comments per feed page (small, so tests exercise paging). */
  pageSize = 2;
  /** Every call made, as "user:method", for asserting what was (not) sent. */
  calls: string[] = [];
  /** Errors to throw on the next call of a method, keyed by "method". */
  private failures = new Map<string, SyncError[]>();
  private tick = 0;

  /** Strictly increasing server time. */
  clock(): string {
    this.tick += 1;
    return new Date(Date.UTC(2026, 6, 1) + this.tick * 1000).toISOString();
  }

  failNext(method: keyof CloudApi, error: SyncError): void {
    this.failures.set(method, [...(this.failures.get(method) ?? []), error]);
  }

  count(method: string, user?: string): number {
    return this.calls.filter((c) => (user ? c === `${user}:${method}` : c.endsWith(`:${method}`))).length;
  }

  as(email: string): CloudApi {
    const enter = (method: keyof CloudApi) => {
      this.calls.push(`${email}:${method}`);
      if (this.offline) throw new SyncError("offline", "Couldn't reach Meshdiff. Check your internet connection; your changes are kept here and will sync later.");
      const queued = this.failures.get(method);
      if (queued && queued.length > 0) throw queued.shift()!;
    };
    const requireSync = () => {
      if (!this.syncUsers.has(email)) throw new SyncError("team_required", "Syncing is part of the Team plan.", "team_required");
    };
    const project = (id: string): FakeProject => {
      const found = this.projects.get(id);
      if (!found) throw new SyncError("not_found", "Project not found");
      return found;
    };

    return {
      getSyncEnabled: async () => {
        enter("getSyncEnabled");
        return this.syncUsers.has(email);
      },
      listTeams: async () => {
        enter("listTeams");
        return this.teams;
      },
      listTeamProjects: async (teamId): Promise<CloudProjectSummary[]> => {
        enter("listTeamProjects");
        return [...this.projects.values()]
          .filter((p) => p.teamId === teamId)
          .map((p) => ({ id: p.id, name: p.name, versionCount: this.versions.filter((v) => v.projectId === p.id).length }));
      },
      createProject: async (name) => {
        enter("createProject");
        const id = randomUUID();
        this.projects.set(id, { id, name, teamId: null, ownerId: email });
        return { id };
      },
      setProjectTeam: async (projectId, teamId) => {
        enter("setProjectTeam");
        project(projectId).teamId = teamId;
      },
      deleteProject: async (projectId) => {
        enter("deleteProject");
        this.projects.delete(projectId);
      },

      listVersions: async (projectId) => {
        enter("listVersions");
        project(projectId);
        return this.versions
          .filter((v) => v.projectId === projectId)
          .map(({ projectId: _p, uploaderId: _u, stats: _s, comparedTo: _c, ...version }) => ({ ...version }))
          .sort((a, b) => b.versionNumber - a.versionNumber);
      },
      createLocalVersion: async (projectId, input) => {
        enter("createLocalVersion");
        requireSync();
        project(projectId);
        const existing = this.versions.find((v) => v.id === input.versionId);
        if (existing) {
          if (existing.projectId === projectId && existing.storageMode === "local" && existing.contentSha256 === input.contentSha256) {
            return { versionNumber: existing.versionNumber, finalized: existing.printabilityStatus !== null };
          }
          throw new SyncError("conflict", "That version id is already in use", "version_id_conflict");
        }
        const number = Math.max(0, ...this.versions.filter((v) => v.projectId === projectId).map((v) => v.versionNumber)) + 1;
        this.versions.push({
          id: input.versionId,
          projectId,
          uploaderId: email,
          versionNumber: number,
          fileName: input.fileName,
          fileFormat: input.fileName.split(".").pop()!.toLowerCase(),
          fileSizeBytes: input.fileSize,
          storageMode: "local",
          contentSha256: input.contentSha256,
          changeSummary: null,
          printabilityStatus: null,
          approvalStatus: "in_review",
          createdAt: this.clock(),
          uploaderEmail: email,
          stats: null,
          comparedTo: null,
        });
        return { versionNumber: number, finalized: false };
      },
      finalizeVersion: async (projectId, versionId, stats, comparedToVersionId) => {
        enter("finalizeVersion");
        requireSync();
        const version = this.versions.find((v) => v.id === versionId && v.projectId === projectId);
        if (!version) throw new SyncError("not_found", "Version not found");
        if (version.uploaderId !== email) throw new SyncError("server", "Only the person who synced this version can finalize it");
        if (version.printabilityStatus !== null) return;
        version.stats = stats;
        version.printabilityStatus = stats.printabilityStatus;
        version.changeSummary = `Summary of v${version.versionNumber}`;
        const previous = this.versions.find((v) => v.projectId === projectId && v.versionNumber === version.versionNumber - 1);
        version.comparedTo = previous && comparedToVersionId === previous.id ? comparedToVersionId : null;
      },
      getDiffStats: async (aId, bId) => {
        enter("getDiffStats");
        const b = this.versions.find((v) => v.id === bId);
        return b && b.stats && b.comparedTo === aId ? b.stats : null;
      },

      createComment: async (projectId, versionId, input: NewCloudComment) => {
        enter("createComment");
        requireSync();
        const existing = this.comments.find((c) => c.id === input.id);
        if (existing) {
          if (existing.authorId === email && existing.versionId === versionId) return toCloudComment(existing);
          throw new SyncError("conflict", "That comment id is already in use", "comment_id_conflict");
        }
        if (!this.versions.some((v) => v.id === versionId && v.projectId === projectId)) throw new SyncError("not_found", "Version not found");
        const now = this.clock();
        const comment: FakeComment = {
          id: input.id,
          projectId,
          authorId: email,
          versionId,
          parentCommentId: input.parentCommentId,
          body: input.body,
          position: input.position,
          normal: input.normal,
          status: "open",
          authorEmail: email,
          createdAt: input.createdAt,
          updatedAt: now,
          deletedAt: null,
        };
        this.comments.push(comment);
        return toCloudComment(comment);
      },
      setCommentStatus: async (_projectId, _versionId, commentId, status: LocalCommentStatus) => {
        enter("setCommentStatus");
        requireSync();
        const comment = this.comments.find((c) => c.id === commentId && c.deletedAt === null);
        if (!comment) throw new SyncError("not_found", "Comment not found");
        comment.status = status;
        comment.updatedAt = this.clock();
      },
      deleteComment: async (_projectId, _versionId, commentId) => {
        enter("deleteComment");
        requireSync();
        const now = this.clock();
        for (const c of this.comments) {
          if ((c.id === commentId || c.parentCommentId === commentId) && c.deletedAt === null) {
            c.deletedAt = now;
            c.updatedAt = now;
          }
        }
      },
      getCommentChanges: async (projectId, cursor): Promise<CloudCommentPage> => {
        enter("getCommentChanges");
        requireSync();
        const [cursorTime, cursorId] = cursor ? cursor.split("|") : ["", ""];
        const sorted = this.comments
          .filter((c) => c.projectId === projectId)
          .filter((c) => !cursor || c.updatedAt > cursorTime || (c.updatedAt === cursorTime && c.id > cursorId))
          .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id));
        const page = sorted.slice(0, this.pageSize);
        const last = page[page.length - 1];
        return {
          changes: page.map((c) =>
            c.deletedAt ? { kind: "deleted" as const, id: c.id, versionId: c.versionId } : { kind: "upsert" as const, comment: toCloudComment(c) },
          ),
          nextCursor: last ? `${last.updatedAt}|${last.id}` : cursor,
          hasMore: sorted.length > this.pageSize,
        };
      },
    };
  }

  /** Removes a version as if a team admin had deleted it on the website. */
  deleteVersion(versionId: string): void {
    this.versions = this.versions.filter((v) => v.id !== versionId);
    this.comments = this.comments.filter((c) => c.versionId !== versionId);
  }
}

function toCloudComment(c: FakeComment): CloudComment {
  const { projectId: _p, authorId: _a, ...rest } = c;
  return { ...rest };
}
