import type {
  LocalAnalysis,
  LocalFormat,
  LocalProject,
  LocalVersion,
  ProjectCloudLink,
} from "../../../../shared/src/localLibrary";
import { LibraryError, type LibraryStore, type StoredComment, type StoredProject } from "../library/store";
import type { CloudApi, CloudComment, CloudCommentChange, CloudVersion } from "./cloudApi";
import { SyncError } from "./errors";

export interface SyncResult {
  pushedVersions: number;
  pushedComments: number;
  pulledVersions: number;
  pulledComments: number;
  /** Items that couldn't be synced for a reason retrying won't fix. The rest still synced. */
  problems: string[];
}

const FORMATS: ReadonlySet<string> = new Set(["stl", "obj", "3mf"]);
/** A guard against a cloud that never says it has no more pages. */
const MAX_COMMENT_PAGES = 200;

function isPendingComment(c: StoredComment): boolean {
  if (c.dirty === false) return false;
  // Created here and deleted here before it ever reached the cloud: nothing to tell it.
  if (c.deletedAt !== null && c.onServer !== true) return false;
  return true;
}

/** What is waiting to go up, for the "N changes waiting" line. */
export function countPending(data: StoredProject): { versions: number; comments: number } {
  return {
    versions: data.versions.filter((v) => !v.cloud && !v.missingFile).length,
    comments: data.comments.filter(isPendingComment).length,
  };
}

/** Problems that mean "stop everything" (as opposed to one bad item). */
function isGlobal(error: unknown): boolean {
  return !(error instanceof SyncError) || error.kind === "offline" || error.kind === "unauthorized" || error.kind === "team_required";
}

/**
 * Reconciles a local project with its cloud project. Nothing here keeps a queue:
 * what still needs to go up is read from the project's own data (a version with
 * no `cloud` info, a comment with unsent changes), and every call to the cloud is
 * idempotent on the item's id. So an interrupted or failed sync just resumes on
 * the next run, and running it twice does no harm.
 *
 * Network calls happen outside the store's lock; results are applied afterwards in
 * short transactions that re-check the item, so a change the user makes while a
 * sync is running is never overwritten.
 */
export class SyncEngine {
  constructor(
    private readonly store: LibraryStore,
    private readonly api: CloudApi,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  // ---- connecting ---------------------------------------------------------

  /** Creates a cloud project in the team for this local project and links them. */
  async connectNew(projectId: string, team: { id: string; name: string }): Promise<LocalProject> {
    if (!(await this.api.getSyncEnabled())) {
      throw new SyncError("team_required", "Syncing is part of the Team plan.", "team_required");
    }
    const snapshot = await this.store.snapshot(projectId);
    if (snapshot.project.cloud) throw new LibraryError("This project is already connected to a team.");

    const created = await this.api.createProject(snapshot.project.name);
    try {
      await this.api.setProjectTeam(created.id, team.id);
    } catch (error) {
      // Don't leave a stray personal project behind in the user's cloud account.
      await this.api.deleteProject(created.id).catch(() => undefined);
      throw error;
    }
    return this.store.transact(projectId, (data) => {
      data.project.cloud = this.newLink(created.id, team);
      return data.project;
    });
  }

  /** Creates a local copy of a team's cloud project and links it. Call sync() next to fill it. */
  async openTeamProject(cloudProjectId: string, name: string, team: { id: string; name: string }): Promise<LocalProject> {
    if (!(await this.api.getSyncEnabled())) {
      throw new SyncError("team_required", "Syncing is part of the Team plan.", "team_required");
    }
    return this.store.createLinkedProject(name, this.newLink(cloudProjectId, team));
  }

  /**
   * Stops syncing. The project, its versions with files and its comments stay here
   * and in the cloud. Versions that only ever existed as a teammate's stats (no file
   * on this computer) are removed along with their comments, since there is
   * nothing left to open.
   */
  disconnect(projectId: string): Promise<LocalProject> {
    return this.store.transact(projectId, (data) => {
      delete data.project.cloud;
      const stubIds = new Set(data.versions.filter((v) => v.missingFile).map((v) => v.id));
      data.versions = data.versions.filter((v) => !stubIds.has(v.id));
      data.comments = data.comments.filter((c) => !stubIds.has(c.versionId));
      for (const version of data.versions) delete version.cloud;
      return data.project;
    });
  }

  private newLink(cloudProjectId: string, team: { id: string; name: string }): ProjectCloudLink {
    return {
      cloudProjectId,
      teamId: team.id,
      teamName: team.name,
      linkedAt: this.now(),
      lastSyncAt: null,
      commentsCursor: null,
      ignoredVersionIds: [],
    };
  }

  // ---- syncing ------------------------------------------------------------

  async sync(projectId: string): Promise<SyncResult> {
    const start = await this.store.snapshot(projectId);
    const link = start.project.cloud;
    if (!link) throw new LibraryError("This project isn't connected to a team.");
    const cloudId = link.cloudProjectId;

    const result: SyncResult = { pushedVersions: 0, pushedComments: 0, pulledVersions: 0, pulledComments: 0, problems: [] };

    result.pushedVersions = await this.pushVersions(projectId, cloudId, result.problems);
    result.pulledVersions = await this.pullVersions(projectId, cloudId);
    result.pushedComments = await this.pushComments(projectId, cloudId, result.problems);
    result.pulledComments = await this.pullComments(projectId, cloudId);

    const stamp = this.now();
    await this.store.transact(projectId, (data) => {
      if (data.project.cloud) data.project.cloud.lastSyncAt = stamp;
    });
    return result;
  }

  // ---- push ---------------------------------------------------------------

  private async pushVersions(projectId: string, cloudId: string, problems: string[]): Promise<number> {
    const snapshot = await this.store.snapshot(projectId);
    let pushed = 0;
    for (const version of snapshot.versions) {
      // Versions without a computed analysis wait: the cloud needs the stats to finalize them.
      if (version.cloud || version.missingFile || !version.analysis) continue;
      try {
        const created = await this.api.createLocalVersion(cloudId, {
          versionId: version.id,
          fileName: version.fileName,
          fileSize: version.sizeBytes,
          contentSha256: version.sha256,
        });
        if (!created.finalized) {
          await this.api.finalizeVersion(cloudId, version.id, version.analysis.stats, version.analysis.comparedToVersionId);
        }
        await this.store.transact(projectId, (data) => {
          const target = data.versions.find((v) => v.id === version.id);
          if (target) target.cloud = { versionNumber: created.versionNumber, storageMode: "local", uploaderEmail: null, approvalStatus: null };
        });
        pushed++;
      } catch (error) {
        if (isGlobal(error)) throw error;
        problems.push(`${version.fileName}: ${(error as Error).message}`);
      }
    }
    return pushed;
  }

  private async pushComments(projectId: string, cloudId: string, problems: string[]): Promise<number> {
    const snapshot = await this.store.snapshot(projectId);
    const inCloud = new Set(snapshot.versions.filter((v) => v.cloud).map((v) => v.id));
    const byId = new Map(snapshot.comments.map((c) => [c.id, c]));
    // Parents before replies, so a reply's parent exists in the cloud when it is sent.
    const pending = snapshot.comments
      .filter(isPendingComment)
      .sort((a, b) => Number(a.parentCommentId !== null) - Number(b.parentCommentId !== null) || a.createdAt.localeCompare(b.createdAt));
    const createdNow = new Set<string>();
    let pushed = 0;

    for (const comment of pending) {
      try {
        if (!inCloud.has(comment.versionId)) continue; // its version hasn't reached the cloud yet

        if (comment.deletedAt !== null) {
          await this.api.deleteComment(cloudId, comment.versionId, comment.id);
          await this.settle(projectId, comment, {});
        } else if (comment.onServer !== true) {
          if (comment.parentCommentId) {
            const parent = byId.get(comment.parentCommentId);
            const parentReady = parent && parent.deletedAt === null && (parent.onServer === true || createdNow.has(parent.id));
            if (!parentReady) continue;
          }
          const remote = await this.api.createComment(cloudId, comment.versionId, {
            id: comment.id,
            body: comment.body,
            position: comment.position,
            normal: comment.normal,
            parentCommentId: comment.parentCommentId,
            createdAt: comment.createdAt,
          });
          createdNow.add(comment.id);
          await this.settle(projectId, comment, { onServer: true, removedInCloud: remote.deletedAt !== null });
        } else {
          try {
            await this.api.setCommentStatus(cloudId, comment.versionId, comment.id, comment.status);
            await this.settle(projectId, comment, {});
          } catch (error) {
            // Someone deleted it in the cloud since we last looked.
            if (error instanceof SyncError && error.kind === "not_found") await this.settle(projectId, comment, { removedInCloud: true });
            else throw error;
          }
        }
        pushed++;
      } catch (error) {
        if (isGlobal(error)) throw error;
        problems.push(`A comment couldn't be synced: ${(error as Error).message}`);
      }
    }
    return pushed;
  }

  /** Records that a comment's changes reached the cloud, unless it changed again in the meantime. */
  private settle(
    projectId: string,
    sent: StoredComment,
    outcome: { onServer?: boolean; removedInCloud?: boolean },
  ): Promise<void> {
    return this.store.transact(projectId, (data) => {
      const target = data.comments.find((c) => c.id === sent.id);
      if (!target) return;
      if (outcome.onServer) target.onServer = true;
      const unchanged = target.updatedAt === sent.updatedAt && target.deletedAt === sent.deletedAt;
      if (outcome.removedInCloud && target.deletedAt === null) {
        target.deletedAt = this.now();
        target.dirty = false;
      } else if (unchanged) {
        target.dirty = false;
      }
    });
  }

  // ---- pull ---------------------------------------------------------------

  private async pullVersions(projectId: string, cloudId: string): Promise<number> {
    const remote = (await this.api.listVersions(cloudId)).filter((v) => FORMATS.has(v.fileFormat)).sort((a, b) => a.versionNumber - b.versionNumber);
    const before = await this.store.snapshot(projectId);
    const known = new Set(before.versions.map((v) => v.id));
    const ignored = new Set(before.project.cloud?.ignoredVersionIds ?? []);

    // The cloud keeps the stats of every diff it was sent; use them for versions that
    // arrive without a file, so they are still readable here.
    const analyses = new Map<string, LocalAnalysis | null>();
    for (const version of remote) {
      if (known.has(version.id) || ignored.has(version.id)) continue;
      const previous = remote.find((r) => r.versionNumber === version.versionNumber - 1) ?? null;
      analyses.set(version.id, await this.remoteAnalysis(version, previous));
    }

    return this.store.transact(projectId, (data) => {
      const remoteIds = new Set(remote.map((v) => v.id));
      let added = 0;

      for (const version of remote) {
        if (ignored.has(version.id)) continue;
        const info = {
          versionNumber: version.versionNumber,
          storageMode: version.storageMode,
          uploaderEmail: version.uploaderEmail,
          approvalStatus: version.approvalStatus,
        };
        const existing = data.versions.find((v) => v.id === version.id);
        if (existing) {
          existing.cloud = info;
          continue;
        }
        data.versions.push({
          id: version.id,
          number: version.versionNumber,
          fileName: version.fileName,
          format: version.fileFormat as LocalFormat,
          sizeBytes: version.fileSizeBytes,
          sha256: version.contentSha256 ?? "",
          createdAt: version.createdAt,
          analysis: analyses.get(version.id) ?? null,
          cloud: info,
          missingFile: true,
        });
        added++;
      }

      // Something we synced earlier that the cloud no longer lists was deleted there. Keep our
      // copy, but never push it again (that would quietly bring back what the team removed).
      for (const version of data.versions) {
        if (version.cloud && !remoteIds.has(version.id)) version.cloud.removedInCloud = true;
      }

      renumber(data);
      return added;
    });
  }

  private async remoteAnalysis(version: CloudVersion, previous: CloudVersion | null): Promise<LocalAnalysis | null> {
    if (!previous) return null;
    const stats = await this.api.getDiffStats(previous.id, version.id);
    if (!stats) return null;
    return {
      stats,
      changeSummary: version.changeSummary ?? "",
      printabilityStatus: stats.printabilityStatus,
      comparedToVersionId: previous.id,
      analyzedAt: this.now(),
    };
  }

  private async pullComments(projectId: string, cloudId: string): Promise<number> {
    let cursor = (await this.store.snapshot(projectId)).project.cloud?.commentsCursor ?? null;
    let applied = 0;

    for (let page = 0; page < MAX_COMMENT_PAGES; page++) {
      const batch = await this.api.getCommentChanges(cloudId, cursor);
      const next = batch.nextCursor ?? cursor;
      // The cursor moves in the same transaction that applies the page: a crash can repeat a
      // page (harmless, changes are applied by id) but never skip one.
      applied += await this.store.transact(projectId, (data) => {
        const count = this.applyChanges(data, batch.changes);
        if (data.project.cloud) data.project.cloud.commentsCursor = next;
        return count;
      });
      cursor = next;
      if (!batch.hasMore) break;
    }
    return applied;
  }

  private applyChanges(data: StoredProject, changes: CloudCommentChange[]): number {
    const versionIds = new Set(data.versions.map((v) => v.id));
    const ignored = new Set(data.project.cloud?.ignoredVersionIds ?? []);
    let applied = 0;

    for (const change of changes) {
      if (!versionIds.has(change.kind === "deleted" ? change.versionId : change.comment.versionId)) continue;
      if (ignored.has(change.kind === "deleted" ? change.versionId : change.comment.versionId)) continue;

      if (change.kind === "deleted") {
        const local = data.comments.find((c) => c.id === change.id);
        if (local && local.deletedAt === null) {
          local.deletedAt = this.now();
          local.updatedAt = local.deletedAt;
          local.onServer = true;
          local.dirty = false;
          applied++;
        }
        continue;
      }

      const remote: CloudComment = change.comment;
      if (remote.deletedAt !== null) continue;
      const local = data.comments.find((c) => c.id === remote.id);
      if (!local) {
        data.comments.push({
          id: remote.id,
          versionId: remote.versionId,
          parentCommentId: remote.parentCommentId,
          body: remote.body,
          position: remote.position,
          normal: remote.normal,
          status: remote.status,
          createdAt: remote.createdAt,
          updatedAt: remote.updatedAt,
          authorEmail: remote.authorEmail,
          deletedAt: null,
          onServer: true,
          dirty: false,
        });
        applied++;
      } else if (local.deletedAt === null && local.dirty === false) {
        // A comment with a change waiting to go up keeps its local state; the push settles it.
        const changed = local.status !== remote.status || local.authorEmail !== remote.authorEmail;
        local.status = remote.status;
        local.updatedAt = remote.updatedAt;
        local.authorEmail = remote.authorEmail;
        local.onServer = true;
        if (changed) applied++;
      }
    }
    return applied;
  }
}

/**
 * Puts a project's versions in cloud order. Versions the cloud has numbered take its
 * number; versions still only here follow them, as drafts, until they are pushed and
 * numbered too. Numbers stay unique and increasing, and are never handed out twice.
 */
export function renumber(data: StoredProject): void {
  const synced = data.versions.filter((v) => v.cloud).sort((a, b) => a.cloud!.versionNumber - b.cloud!.versionNumber);
  const drafts = data.versions.filter((v) => !v.cloud).sort((a, b) => a.number - b.number || a.createdAt.localeCompare(b.createdAt));

  let last = 0;
  for (const version of synced) {
    version.number = version.cloud!.versionNumber;
    last = Math.max(last, version.number);
  }
  for (const version of drafts) version.number = ++last;

  data.versions = [...synced, ...drafts];
  data.nextVersionNumber = Math.max(data.nextVersionNumber ?? 1, last + 1);
}

export type { LocalVersion };
