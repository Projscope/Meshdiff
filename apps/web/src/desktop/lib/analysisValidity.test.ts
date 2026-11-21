import { describe, expect, it } from "vitest";
import type { LocalAnalysis } from "@meshdiff/shared/localLibrary";
import { isUsableAnalysis } from "./analysisValidity";

const good = {
  changeSummary: "Volume increased by 1 mm³.",
  printabilityStatus: "pass",
  comparedToVersionId: null,
  analyzedAt: "2026-11-21T00:00:00Z",
  stats: { printabilityStatus: "pass", approxVolumeDeltaMm3: 1, approxVolumeDeltaPercent: 0.5, printabilityIssues: [] },
} as unknown as LocalAnalysis;

const withStats = (stats: unknown) => ({ ...good, stats }) as unknown as LocalAnalysis;

describe("isUsableAnalysis", () => {
  it("accepts a complete analysis", () => {
    expect(isUsableAnalysis(good)).toBe(true);
  });

  it("rejects a missing analysis", () => {
    expect(isUsableAnalysis(null)).toBe(false);
    expect(isUsableAnalysis(undefined)).toBe(false);
  });

  it("rejects stats that are missing, empty or the wrong shape", () => {
    expect(isUsableAnalysis(withStats(undefined))).toBe(false);
    expect(isUsableAnalysis(withStats({}))).toBe(false);
    expect(isUsableAnalysis(withStats("oops"))).toBe(false);
    expect(isUsableAnalysis(withStats({ ...good.stats, approxVolumeDeltaMm3: "12" }))).toBe(false);
    expect(isUsableAnalysis(withStats({ ...good.stats, approxVolumeDeltaPercent: NaN }))).toBe(false);
    expect(isUsableAnalysis(withStats({ ...good.stats, printabilityIssues: "none" }))).toBe(false);
  });

  it("rejects a missing change summary", () => {
    expect(isUsableAnalysis({ ...good, changeSummary: undefined } as unknown as LocalAnalysis)).toBe(false);
  });
});
