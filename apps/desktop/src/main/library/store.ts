import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";
import type {
  LocalAnalysis,
  LocalComment,
  LocalCommentStatus,
  LibraryInfo,
  LocalFormat,
  LocalProject,
  LocalProjectDetail,
  LocalProjectSummary,
  LocalVersion,
  NewLocalComment,
  Vec3,
} from "../../../../shared/src/localLibrary";

// The user's library on disk:
//
//   <root>/projects/<projectId>/project.json   one JSON file per project
//   <root>/blobs/<aa>/<sha256>.<ext>           model files, stored by content hash
//
// Plain JSON and plain files (no database) so it is inspectable, needs no native
// module, and the user can see exactly what is kept. Every write is atomic
// (temp file + rename) so a crash can't leave a half-written project.

const SCHEMA_VERSION = 1;
export const MAX_MODEL_BYTES = 200 * 1024 * 1024;

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const FORMATS: ReadonlySet<string> = new Set(["stl", "obj", "3mf"]);
const STATUSES: ReadonlySet<string> = new Set(["open", "resolved", "reopened"]);

/** A problem the user can act on (bad input, missing/corrupt file). Its message is safe to show. */
export class LibraryError extends Error {}

interface StoredComment extends LocalComment {
  /** Soft delete, so a later sync can tell "deleted" from "never existed". */
  deletedAt: string | null;
}

interface StoredProject {
  schemaVersion: number;
  project: LocalProject;
  versions: LocalVersion[];
  comments: StoredComment[];
  /** The number the next version gets. Persisted (not derived from the highest
   * existing number) so deleting the latest version doesn't hand its number out again. */
  nextVersionNumber?: number;
}

function now(): string {
  return new Date().toISOString();
}

function cleanName(raw: unknown, label: string): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length === 0) throw new LibraryError(`${label} can't be empty.`);
  if (name.length > 120) throw new LibraryError(`${label} must be 120 characters or fewer.`);
  return name;
}

/** Keep only the file's own name for display; the stored path never uses it. */
function cleanFileName(raw: unknown): string {
  const base = typeof raw === "string" ? raw.split(/[\\/]/).pop() ?? "" : "";
  // eslint-disable-next-line no-control-regex
  const name = base.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
  if (name.length === 0) throw new LibraryError("The file has no name.");
  return name;
}

function formatOf(fileName: string): LocalFormat {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (!FORMATS.has(ext)) throw new LibraryError("Only STL, OBJ and 3MF files are supported.");
  return ext as LocalFormat;
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

export class LibraryStore {
  private readonly projectsDir: string;
  private readonly blobsDir: string;
  // Calls can overlap (several IPC requests at once); every read-modify-write
  // runs one at a time so two of them can't clobber each other's changes.
  private lock: Promise<unknown> = Promise.resolve();

  constructor(readonly root: string) {
    this.projectsDir = path.join(root, "projects");
    this.blobsDir = path.join(root, "blobs");
  }

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lock.then(task, task);
    this.lock = run.catch(() => undefined);
    return run;
  }

  // ---- info ---------------------------------------------------------------

  async getInfo(): Promise<LibraryInfo> {
    const info: LibraryInfo = {
      path: this.root,
      projectCount: 0,
      versionCount: 0,
      commentCount: 0,
      modelBytes: 0,
      unreadableProjects: 0,
    };
    for (const id of await this.projectIds()) {
      try {
        const data = await this.read(id);
        info.projectCount++;
        info.versionCount += data.versions.length;
        info.commentCount += data.comments.filter((c) => c.deletedAt === null).length;
      } catch {
        info.unreadableProjects++;
      }
    }
    for (const prefix of await fs.promises.readdir(this.blobsDir).catch(() => [])) {
      const dir = path.join(this.blobsDir, prefix);
      for (const name of await fs.promises.readdir(dir).catch(() => [])) {
        if (name.endsWith(".tmp")) continue;
        info.modelBytes += (await fs.promises.stat(path.join(dir, name)).catch(() => null))?.size ?? 0;
      }
    }
    return info;
  }

  // ---- projects -----------------------------------------------------------

  async listProjects(): Promise<LocalProjectSummary[]> {
    const summaries: LocalProjectSummary[] = [];
    for (const id of await this.projectIds()) {
      try {
        const data = await this.read(id);
        const latest = data.versions[data.versions.length - 1];
        summaries.push({ ...data.project, versionCount: data.versions.length, latestFileName: latest?.fileName ?? null });
      } catch {
        // One unreadable project must not hide the rest of the library.
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createProject(rawName: string): Promise<LocalProject> {
    return this.serialized(async () => {
      const name = cleanName(rawName, "The project name");
      const timestamp = now();
      const project: LocalProject = { id: crypto.randomUUID(), name, createdAt: timestamp, updatedAt: timestamp };
      await this.write({ schemaVersion: SCHEMA_VERSION, project, versions: [], comments: [] });
      return project;
    });
  }

  renameProject(projectId: string, rawName: string): Promise<LocalProject> {
    return this.mutate(projectId, (data) => {
      data.project.name = cleanName(rawName, "The project name");
      return data.project;
    });
  }

  deleteProject(projectId: string): Promise<void> {
    return this.serialized(async () => {
      this.assertProjectId(projectId);
      await this.read(projectId); // 404s cleanly if it doesn't exist
      await fs.promises.rm(path.join(this.projectsDir, projectId), { recursive: true, force: true });
      await this.removeUnreferencedBlobs();
    });
  }

  async getProject(projectId: string): Promise<LocalProjectDetail | null> {
    this.assertProjectId(projectId);
    if (!fs.existsSync(this.projectFile(projectId))) return null;
    const data = await this.read(projectId);
    return {
      project: data.project,
      versions: data.versions,
      comments: data.comments.filter((c) => c.deletedAt === null).map(publicComment),
    };
  }

  // ---- versions -----------------------------------------------------------

  addVersion(projectId: string, rawFileName: string, bytes: Buffer): Promise<LocalVersion> {
    return this.serialized(async () => {
      const fileName = cleanFileName(rawFileName);
      const format = formatOf(fileName);
      if (bytes.length === 0) throw new LibraryError("The file is empty.");
      if (bytes.length > MAX_MODEL_BYTES) {
        throw new LibraryError(`The file is larger than ${Math.round(MAX_MODEL_BYTES / (1024 * 1024))} MB.`);
      }

      const data = await this.read(projectId);
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      await this.ensureBlob(sha256, format, bytes);

      const highest = data.versions.reduce((max, v) => Math.max(max, v.number), 0);
      const number = Math.max(data.nextVersionNumber ?? 1, highest + 1);
      data.nextVersionNumber = number + 1;
      const version: LocalVersion = {
        id: ulid(),
        number,
        fileName,
        format,
        sizeBytes: bytes.length,
        sha256,
        createdAt: now(),
        analysis: null,
      };
      data.versions.push(version);
      data.project.updatedAt = now();
      await this.write(data);
      return version;
    });
  }

  async readVersionBytes(projectId: string, versionId: string): Promise<Buffer> {
    this.assertVersionId(versionId);
    const data = await this.read(projectId);
    const version = data.versions.find((v) => v.id === versionId);
    if (!version) throw new LibraryError("That version no longer exists.");
    let bytes: Buffer;
    try {
      bytes = await fs.promises.readFile(this.blobPath(version.sha256, version.format));
    } catch {
      throw new LibraryError("The model file for this version is missing from your library.");
    }
    // Catches disk corruption or a hand-edited file before it reaches the parser.
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== version.sha256) {
      throw new LibraryError("The model file for this version is damaged.");
    }
    return bytes;
  }

  saveAnalysis(projectId: string, versionId: string, analysis: LocalAnalysis): Promise<LocalVersion> {
    this.assertVersionId(versionId);
    return this.mutate(projectId, (data) => {
      const version = data.versions.find((v) => v.id === versionId);
      if (!version) throw new LibraryError("That version no longer exists.");
      if (analysis.comparedToVersionId !== null) this.assertVersionId(analysis.comparedToVersionId);
      version.analysis = analysis;
      return version;
    });
  }

  deleteVersion(projectId: string, versionId: string): Promise<void> {
    this.assertVersionId(versionId);
    return this.serialized(async () => {
      const data = await this.read(projectId);
      if (!data.versions.some((v) => v.id === versionId)) throw new LibraryError("That version no longer exists.");
      data.versions = data.versions.filter((v) => v.id !== versionId);
      const deletedAt = now();
      for (const comment of data.comments) {
        if (comment.versionId === versionId && comment.deletedAt === null) comment.deletedAt = deletedAt;
      }
      data.project.updatedAt = deletedAt;
      await this.write(data);
      await this.removeUnreferencedBlobs();
    });
  }

  // ---- comments -----------------------------------------------------------

  addComment(projectId: string, input: NewLocalComment): Promise<LocalComment> {
    return this.mutate(projectId, (data) => {
      this.assertVersionId(input.versionId);
      if (!data.versions.some((v) => v.id === input.versionId)) throw new LibraryError("That version no longer exists.");
      const body = typeof input.body === "string" ? input.body.trim() : "";
      if (body.length === 0) throw new LibraryError("A comment can't be empty.");
      if (body.length > 5000) throw new LibraryError("A comment must be 5000 characters or fewer.");
      if (!isVec3(input.position)) throw new LibraryError("The comment's position is invalid.");
      if (input.normal != null && !isVec3(input.normal)) throw new LibraryError("The comment's surface direction is invalid.");

      const parentId = input.parentCommentId ?? null;
      if (parentId !== null) {
        const parent = data.comments.find((c) => c.id === parentId && c.deletedAt === null);
        if (!parent) throw new LibraryError("The comment you're replying to no longer exists.");
        if (parent.parentCommentId !== null) throw new LibraryError("Replies can't be nested.");
        if (parent.versionId !== input.versionId) throw new LibraryError("A reply must be on the same version.");
      }

      const timestamp = now();
      const comment: StoredComment = {
        id: crypto.randomUUID(),
        versionId: input.versionId,
        parentCommentId: parentId,
        body,
        position: [...input.position],
        normal: input.normal ? [...input.normal] : null,
        status: "open",
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      data.comments.push(comment);
      data.project.updatedAt = timestamp;
      return publicComment(comment);
    });
  }

  setCommentStatus(projectId: string, commentId: string, status: LocalCommentStatus): Promise<LocalComment> {
    return this.mutate(projectId, (data) => {
      if (!STATUSES.has(status)) throw new LibraryError("That comment status is invalid.");
      const comment = data.comments.find((c) => c.id === commentId && c.deletedAt === null);
      if (!comment) throw new LibraryError("That comment no longer exists.");
      comment.status = status;
      comment.updatedAt = now();
      return publicComment(comment);
    });
  }

  deleteComment(projectId: string, commentId: string): Promise<void> {
    return this.mutate(projectId, (data) => {
      const target = data.comments.find((c) => c.id === commentId && c.deletedAt === null);
      if (!target) throw new LibraryError("That comment no longer exists.");
      const deletedAt = now();
      // Deleting a thread's first comment takes its replies with it.
      for (const comment of data.comments) {
        if (comment.deletedAt === null && (comment.id === commentId || comment.parentCommentId === commentId)) {
          comment.deletedAt = deletedAt;
          comment.updatedAt = deletedAt;
        }
      }
      data.project.updatedAt = deletedAt;
    });
  }

  // ---- internals ----------------------------------------------------------

  private mutate<T>(projectId: string, change: (data: StoredProject) => T): Promise<T> {
    return this.serialized(async () => {
      const data = await this.read(projectId);
      const result = change(data);
      await this.write(data);
      return result;
    });
  }

  private assertProjectId(projectId: string): void {
    if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) throw new LibraryError("That project doesn't exist.");
  }

  private assertVersionId(versionId: string): void {
    if (typeof versionId !== "string" || !VERSION_ID.test(versionId)) throw new LibraryError("That version doesn't exist.");
  }

  private projectFile(projectId: string): string {
    return path.join(this.projectsDir, projectId, "project.json");
  }

  private blobPath(sha256: string, format: string): string {
    return path.join(this.blobsDir, sha256.slice(0, 2), `${sha256}.${format}`);
  }

  private async projectIds(): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(this.projectsDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory() && PROJECT_ID.test(e.name)).map((e) => e.name);
    } catch {
      return [];
    }
  }

  private async read(projectId: string): Promise<StoredProject> {
    this.assertProjectId(projectId);
    let raw: string;
    try {
      raw = await fs.promises.readFile(this.projectFile(projectId), "utf8");
    } catch {
      throw new LibraryError("That project doesn't exist.");
    }
    let data: StoredProject;
    try {
      data = JSON.parse(raw) as StoredProject;
    } catch {
      throw new LibraryError("This project's data file is damaged.");
    }
    if (typeof data.schemaVersion !== "number" || !data.project || !Array.isArray(data.versions) || !Array.isArray(data.comments)) {
      throw new LibraryError("This project's data file is damaged.");
    }
    if (data.schemaVersion > SCHEMA_VERSION) {
      throw new LibraryError("This project was created by a newer version of Meshdiff. Update the app to open it.");
    }
    return data;
  }

  private async write(data: StoredProject): Promise<void> {
    const file = this.projectFile(data.project.id);
    await this.atomicWrite(file, JSON.stringify(data, null, 2));
  }

  private async atomicWrite(file: string, contents: string | Buffer): Promise<void> {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    try {
      await fs.promises.writeFile(temp, contents);
      await fs.promises.rename(temp, file);
    } catch (error) {
      await fs.promises.rm(temp, { force: true });
      throw error;
    }
  }

  private async ensureBlob(sha256: string, format: LocalFormat, bytes: Buffer): Promise<void> {
    const file = this.blobPath(sha256, format);
    if (fs.existsSync(file)) return; // same content already stored: nothing to copy
    await this.atomicWrite(file, bytes);
  }

  /** Deletes stored model files no remaining version points at. */
  private async removeUnreferencedBlobs(): Promise<void> {
    const referenced = new Set<string>();
    for (const id of await this.projectIds()) {
      try {
        for (const version of (await this.read(id)).versions) referenced.add(`${version.sha256}.${version.format}`);
      } catch {
        // A project we can't read keeps its blobs: never delete what we can't prove is unused.
        return;
      }
    }
    let prefixes: string[];
    try {
      prefixes = await fs.promises.readdir(this.blobsDir);
    } catch {
      return;
    }
    for (const prefix of prefixes) {
      const dir = path.join(this.blobsDir, prefix);
      for (const name of await fs.promises.readdir(dir).catch(() => [])) {
        if (!referenced.has(name) && !name.endsWith(".tmp")) await fs.promises.rm(path.join(dir, name), { force: true });
      }
    }
  }
}

function publicComment(comment: StoredComment): LocalComment {
  const { deletedAt: _deletedAt, ...rest } = comment;
  return rest;
}
