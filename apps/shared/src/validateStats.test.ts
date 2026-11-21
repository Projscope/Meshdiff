import { describe, expect, it } from "vitest";
import { validateStats } from "./validateStats.js";

function valid(): Record<string, unknown> {
  return {
    approxVolumeDeltaMm3: -12.5,
    approxVolumeDeltaPercent: -1.2,
    boundingBoxDeltaX: 0,
    boundingBoxDeltaY: 0.5,
    boundingBoxDeltaZ: 0,
    triangleDeltaB: 4800,
    printabilityStatus: "warn",
    printabilityIssues: ["thin_wall"],
  };
}

const error = (input: unknown): string => {
  const result = validateStats(input);
  if (result.success) throw new Error("expected a rejection");
  return result.error;
};

describe("validateStats", () => {
  it("accepts a well-formed result and returns it unchanged", () => {
    const input = valid();
    const result = validateStats(input);
    expect(result).toEqual({ success: true, data: input });
  });

  it("keeps fields it does not inspect", () => {
    const result = validateStats({ ...valid(), holeChanges: [], somethingNew: 1 });
    expect(result.success).toBe(true);
  });

  it.each([null, undefined, "x", 3, [], true])("rejects a non-object (%s)", (input) => {
    expect(error(input)).toContain("object");
  });

  it.each(["approxVolumeDeltaMm3", "approxVolumeDeltaPercent", "boundingBoxDeltaX", "boundingBoxDeltaY", "boundingBoxDeltaZ", "triangleDeltaB"])(
    "rejects a missing %s (it used to become NaN in the database)",
    (key) => {
      const input = valid();
      delete input[key];
      expect(error(input)).toContain(key);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, "5", null])("rejects a non-finite number (%s)", (bad) => {
    expect(error({ ...valid(), approxVolumeDeltaMm3: bad })).toContain("approxVolumeDeltaMm3");
  });

  it("bounds the triangle count", () => {
    expect(error({ ...valid(), triangleDeltaB: -1 })).toContain("range");
    expect(error({ ...valid(), triangleDeltaB: 2e9 })).toContain("range");
    expect(validateStats({ ...valid(), triangleDeltaB: 0 }).success).toBe(true);
  });

  it("only allows the three printability statuses", () => {
    for (const status of ["pass", "warn", "fail"]) {
      expect(validateStats({ ...valid(), printabilityStatus: status }).success).toBe(true);
    }
    expect(error({ ...valid(), printabilityStatus: "ok" })).toContain("printabilityStatus");
    expect(error({ ...valid(), printabilityStatus: undefined })).toContain("printabilityStatus");
  });

  it("rejects an oversized or non-string issue list", () => {
    expect(error({ ...valid(), printabilityIssues: "thin_wall" })).toContain("printabilityIssues");
    expect(error({ ...valid(), printabilityIssues: [1] })).toContain("printabilityIssues");
    expect(error({ ...valid(), printabilityIssues: Array(101).fill("x") })).toContain("printabilityIssues");
    expect(error({ ...valid(), printabilityIssues: ["x".repeat(501)] })).toContain("printabilityIssues");
  });
});
