import { describe, expect, it } from "vitest";
import type { VoxelDiffStats } from "./engine/diffVoxels.js";
import { generateChangeSummary } from "./generateSummary.js";

// Only the fields the summary reads; the rest of VoxelDiffStats is irrelevant here.
function stats(overrides: Partial<VoxelDiffStats>): VoxelDiffStats {
  return {
    approxVolumeDeltaMm3: 0,
    approxVolumeDeltaPercent: 0,
    boundingBoxDeltaX: 0,
    boundingBoxDeltaY: 0,
    boundingBoxDeltaZ: 0,
    printabilityStatus: "pass",
    printabilityIssues: [],
    ...overrides,
  } as VoxelDiffStats;
}

describe("generateChangeSummary", () => {
  it("describes a volume decrease with rounded numbers", () => {
    const text = generateChangeSummary(
      stats({ approxVolumeDeltaMm3: -123.6, approxVolumeDeltaPercent: -4.26, boundingBoxDeltaX: -1.25, boundingBoxDeltaY: 0, boundingBoxDeltaZ: 2 }),
    );
    expect(text).toBe(
      "Volume decreased by 124 mm³ (4.3%). Bounding box changed by 1.3 × 0.0 × 2.0 mm. Printability status: pass.",
    );
  });

  it("treats zero delta as an increase (matches the server's wording)", () => {
    expect(generateChangeSummary(stats({}))).toContain("Volume increased by 0 mm³ (0.0%).");
  });

  it("appends printability issues when there are any", () => {
    const text = generateChangeSummary(stats({ printabilityStatus: "warn", printabilityIssues: ["thin wall", "overhang"] }));
    expect(text.endsWith("Printability status: warn. Issues: thin wall; overhang.")).toBe(true);
  });
});
