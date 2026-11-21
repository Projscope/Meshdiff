import type { VoxelDiffStats } from "./engine/diffVoxels.js";

export type StatsValidation = { success: true; data: VoxelDiffStats } | { success: false; error: string };

/** Numbers the server reads or stores. A missing one used to flow through as
 * NaN (e.g. `Math.round(undefined)`) into the version row and the change
 * summary, so the check lives next to the type both sides share. */
const REQUIRED_NUMBERS = [
  "approxVolumeDeltaMm3",
  "approxVolumeDeltaPercent",
  "boundingBoxDeltaX",
  "boundingBoxDeltaY",
  "boundingBoxDeltaZ",
  "triangleDeltaB",
] as const;

const PRINTABILITY_STATUSES = new Set(["pass", "warn", "fail"]);
const MAX_ISSUES = 100;
const MAX_ISSUE_LENGTH = 500;
const MAX_TRIANGLES = 1_000_000_000;

/**
 * Checks that a client-supplied diff result has the shape the server depends
 * on. The values themselves can't be verified server-side (the diff runs on the
 * client), so this guards against malformed input, not against dishonest input.
 */
export function validateStats(input: unknown): StatsValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, error: "stats must be an object" };
  }
  const stats = input as Record<string, unknown>;

  for (const key of REQUIRED_NUMBERS) {
    const value = stats[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { success: false, error: `stats.${key} must be a finite number` };
    }
  }
  const triangles = stats.triangleDeltaB as number;
  if (triangles < 0 || triangles > MAX_TRIANGLES) {
    return { success: false, error: "stats.triangleDeltaB is out of range" };
  }

  if (typeof stats.printabilityStatus !== "string" || !PRINTABILITY_STATUSES.has(stats.printabilityStatus)) {
    return { success: false, error: "stats.printabilityStatus must be pass, warn or fail" };
  }

  const issues = stats.printabilityIssues;
  if (!Array.isArray(issues) || issues.length > MAX_ISSUES) {
    return { success: false, error: "stats.printabilityIssues must be a short list" };
  }
  if (!issues.every((issue) => typeof issue === "string" && issue.length <= MAX_ISSUE_LENGTH)) {
    return { success: false, error: "stats.printabilityIssues must contain only short strings" };
  }

  return { success: true, data: stats as unknown as VoxelDiffStats };
}
