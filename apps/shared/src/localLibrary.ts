import type { VoxelDiffStats } from "./engine/diffVoxels.js";

// Types for the desktop client's local library: projects, versions and
// comments kept on the user's disk (apps/desktop/src/main/library). Shared so
// the main process, the preload bridge and the web renderer use one contract.
// Ids follow the cloud's conventions (ULID versions, UUID comments) so a
// later sync can reuse them as-is.

export type LocalFormat = "stl" | "obj" | "3mf";
export type LocalCommentStatus = "open" | "resolved" | "reopened";
export type Vec3 = [number, number, number];

export interface LocalProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalProjectSummary extends LocalProject {
  versionCount: number;
  latestFileName: string | null;
}

/** The diff engine's result for one version. */
export interface LocalAnalysis {
  stats: VoxelDiffStats;
  changeSummary: string;
  printabilityStatus: VoxelDiffStats["printabilityStatus"];
  /** The version this was diffed against; null for a project's first version
   * (diffed against itself). When it no longer matches the version that now
   * precedes this one (e.g. one was deleted), the analysis is stale. */
  comparedToVersionId: string | null;
  analyzedAt: string;
}

export interface LocalVersion {
  /** ULID, same format as the cloud's version ids. */
  id: string;
  /** Per project, increasing, never reused after a delete. */
  number: number;
  /** Display name only; the file itself is stored by hash. */
  fileName: string;
  format: LocalFormat;
  sizeBytes: number;
  /** Lowercase hex SHA-256 of the file's bytes. */
  sha256: string;
  createdAt: string;
  /** null until the renderer has run the diff engine on it. */
  analysis: LocalAnalysis | null;
}

export interface LocalComment {
  /** Client-generated UUID, so it stays stable when synced later. */
  id: string;
  versionId: string;
  /** One level of replies, like the cloud. */
  parentCommentId: string | null;
  body: string;
  /** Model-space coordinates, same convention as the cloud's comments. */
  position: Vec3;
  normal: Vec3 | null;
  status: LocalCommentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LocalProjectDetail {
  project: LocalProject;
  /** Oldest first. */
  versions: LocalVersion[];
  /** Excludes deleted comments. */
  comments: LocalComment[];
}

export interface NewLocalComment {
  versionId: string;
  body: string;
  position: Vec3;
  normal?: Vec3 | null;
  parentCommentId?: string | null;
}

/** What the library holds and where, for the Settings page. */
export interface LibraryInfo {
  /** Absolute path of the library folder on disk. */
  path: string;
  projectCount: number;
  versionCount: number;
  commentCount: number;
  /** Total size of the stored model files. */
  modelBytes: number;
  /** Project folders that couldn't be read (damaged data files). They are left untouched. */
  unreadableProjects: number;
}

export interface LibraryBridge {
  getInfo(): Promise<LibraryInfo>;
  /** Opens the library folder in the system file manager. */
  openFolder(): Promise<void>;
  listProjects(): Promise<LocalProjectSummary[]>;
  createProject(name: string): Promise<LocalProject>;
  renameProject(projectId: string, name: string): Promise<LocalProject>;
  deleteProject(projectId: string): Promise<void>;
  getProject(projectId: string): Promise<LocalProjectDetail | null>;

  /** Opens the native file picker and adds each chosen model as a new version.
   * Resolves to [] if the user cancels. */
  addVersionsFromDialog(projectId: string): Promise<LocalVersion[]>;
  /** For drag-and-drop, where the renderer already holds the file's bytes. */
  addVersionFromBytes(projectId: string, fileName: string, bytes: ArrayBuffer): Promise<LocalVersion>;
  readVersionBytes(projectId: string, versionId: string): Promise<ArrayBuffer>;
  saveAnalysis(projectId: string, versionId: string, analysis: LocalAnalysis): Promise<LocalVersion>;
  deleteVersion(projectId: string, versionId: string): Promise<void>;

  addComment(projectId: string, comment: NewLocalComment): Promise<LocalComment>;
  setCommentStatus(projectId: string, commentId: string, status: LocalCommentStatus): Promise<LocalComment>;
  deleteComment(projectId: string, commentId: string): Promise<void>;
}
