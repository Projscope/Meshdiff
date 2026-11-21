import type { LocalAnalysis } from "@meshdiff/shared/localLibrary";

/**
 * Whether a saved analysis has the scalar fields the screens read. An analysis
 * that doesn't (a hand-edited or damaged project file) is treated like a missing
 * one and recomputed from the model file, rather than crashing the page that
 * tries to show it.
 */
export function isUsableAnalysis(analysis: LocalAnalysis | null | undefined): analysis is LocalAnalysis {
  const stats = analysis?.stats as Partial<Record<string, unknown>> | undefined;
  if (!analysis || !stats || typeof stats !== "object") return false;
  return (
    typeof analysis.changeSummary === "string" &&
    typeof stats.printabilityStatus === "string" &&
    Number.isFinite(stats.approxVolumeDeltaMm3) &&
    Number.isFinite(stats.approxVolumeDeltaPercent) &&
    Array.isArray(stats.printabilityIssues)
  );
}
