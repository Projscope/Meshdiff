import type { VoxelDiffStats } from "./engine/diffVoxels.js";

/**
 * Deterministic prose summary from computed stats — not an LLM call (see
 * plan). Extends the factual/hedged tone of the client's existing
 * downloadReport note into real sentences for the "AI SUMMARY" block.
 *
 * Lives in shared so the API (on finalize) and the desktop client (offline,
 * for local versions) produce identical text from the same stats.
 */
export function generateChangeSummary(stats: VoxelDiffStats): string {
  const volumeDirection = stats.approxVolumeDeltaMm3 < 0 ? "decreased" : "increased";
  const volumeAbsMm3 = Math.abs(stats.approxVolumeDeltaMm3);
  const volumeAbsPercent = Math.abs(stats.approxVolumeDeltaPercent);

  const sentences = [
    `Volume ${volumeDirection} by ${volumeAbsMm3.toFixed(0)} mm³ (${volumeAbsPercent.toFixed(1)}%).`,
    `Bounding box changed by ${Math.abs(stats.boundingBoxDeltaX).toFixed(1)} × ${Math.abs(stats.boundingBoxDeltaY).toFixed(1)} × ${Math.abs(stats.boundingBoxDeltaZ).toFixed(1)} mm.`,
    `Printability status: ${stats.printabilityStatus}.`,
  ];

  if (stats.printabilityIssues.length > 0) {
    sentences.push(`Issues: ${stats.printabilityIssues.join("; ")}.`);
  }

  return sentences.join(" ");
}
