import type { CloudComment, CloudVersion } from "./cloudApi";

// Everything the cloud sends is written into the user's library and later rendered, so it
// is checked here first. A teammate is authenticated but not fully trusted, and a bug (or a
// compromised server) shouldn't be able to corrupt a project, plant a path in a request, or
// crash the app with an odd shape. Anything that doesn't fit is dropped, not repaired.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FORMATS: ReadonlySet<string> = new Set(["stl", "obj", "3mf"]);
const STATUSES: ReadonlySet<string> = new Set(["open", "resolved", "reopened"]);
const PRINTABILITY: ReadonlySet<string> = new Set(["pass", "warn", "fail"]);
const MAX_COMMENT_CHARS = 5000;
const MAX_NAME_CHARS = 200;
const MAX_TEXT_CHARS = 2000;
const MAX_MODEL_BYTES = 10 * 1024 * 1024 * 1024;

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isVec3 = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
const isIsoDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.replace(CONTROL_CHARS, "").trim().slice(0, max);
}
/** Control characters other than tab/newline removed; used for comment bodies, which are multi-line. */
function cleanBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

/** A version as the cloud described it, or null if it can't be trusted. */
export function cleanRemoteVersion(raw: CloudVersion): CloudVersion | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !ULID.test(raw.id)) return null;
  if (!Number.isInteger(raw.versionNumber) || raw.versionNumber < 1) return null;
  if (typeof raw.fileFormat !== "string" || !FORMATS.has(raw.fileFormat)) return null;
  if (!isFiniteNumber(raw.fileSizeBytes) || raw.fileSizeBytes < 0 || raw.fileSizeBytes > MAX_MODEL_BYTES) return null;
  if (raw.storageMode !== "local" && raw.storageMode !== "cloud") return null;
  if (raw.contentSha256 !== null && !(typeof raw.contentSha256 === "string" && SHA256.test(raw.contentSha256))) return null;
  const fileName = cleanText(raw.fileName, MAX_NAME_CHARS)?.split(/[\\/]/).pop();
  if (!fileName) return null;
  if (!isIsoDate(raw.createdAt)) return null;
  return {
    id: raw.id,
    versionNumber: raw.versionNumber,
    fileName,
    fileFormat: raw.fileFormat,
    fileSizeBytes: raw.fileSizeBytes,
    storageMode: raw.storageMode,
    contentSha256: raw.contentSha256,
    changeSummary: raw.changeSummary === null ? null : (cleanText(raw.changeSummary, MAX_TEXT_CHARS) ?? null),
    printabilityStatus: raw.printabilityStatus !== null && PRINTABILITY.has(raw.printabilityStatus) ? raw.printabilityStatus : null,
    approvalStatus: raw.approvalStatus === null ? null : (cleanText(raw.approvalStatus, 40) ?? null),
    createdAt: raw.createdAt,
    uploaderEmail: raw.uploaderEmail === null ? null : (cleanText(raw.uploaderEmail, MAX_NAME_CHARS) ?? null),
  };
}

/** A comment as the cloud described it, or null if it can't be trusted. */
export function cleanRemoteComment(raw: CloudComment): CloudComment | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !UUID.test(raw.id)) return null;
  if (typeof raw.versionId !== "string" || !ULID.test(raw.versionId)) return null;
  if (raw.parentCommentId !== null && !(typeof raw.parentCommentId === "string" && UUID.test(raw.parentCommentId))) return null;
  const body = cleanBody(raw.body);
  if (!body || body.length > MAX_COMMENT_CHARS) return null;
  if (!isVec3(raw.position)) return null;
  if (raw.normal !== null && !isVec3(raw.normal)) return null;
  if (typeof raw.status !== "string" || !STATUSES.has(raw.status)) return null;
  if (!isIsoDate(raw.createdAt) || !isIsoDate(raw.updatedAt)) return null;
  return {
    id: raw.id,
    versionId: raw.versionId,
    parentCommentId: raw.parentCommentId,
    body,
    position: [...raw.position],
    normal: raw.normal ? [...raw.normal] : null,
    status: raw.status,
    authorEmail: raw.authorEmail === null ? null : (cleanText(raw.authorEmail, MAX_NAME_CHARS) ?? null),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    deletedAt: raw.deletedAt === null || isIsoDate(raw.deletedAt) ? raw.deletedAt : null,
  };
}

export function isValidCommentId(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}
export function isValidVersionId(id: unknown): id is string {
  return typeof id === "string" && ULID.test(id);
}
