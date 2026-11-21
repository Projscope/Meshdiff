import { describe, expect, it } from "vitest";
import {
  BYTES_PER_TRIANGLE,
  MAX_MAX_TRIANGLES,
  MIN_MAX_TRIANGLES,
  binaryStlTriangleCount,
  computeAnalysisLimits,
  friendlyAnalysisError,
} from "./analysisLimits.js";

const GB = 1024 ** 3;

describe("computeAnalysisLimits", () => {
  it("gives a roomy computer the ceiling", () => {
    expect(computeAnalysisLimits(32 * GB, 20 * GB).maxTriangles).toBe(MAX_MAX_TRIANGLES);
    expect(computeAnalysisLimits(16 * GB, 12 * GB).maxTriangles).toBe(MAX_MAX_TRIANGLES);
  });

  it("scales with free memory on a mid-range computer", () => {
    const limits = computeAnalysisLimits(8 * GB, 3 * GB);
    // 3 GB free, 40% usable, 3 KB per triangle: about 430,000.
    expect(limits.maxTriangles).toBeGreaterThan(400_000);
    expect(limits.maxTriangles).toBeLessThan(450_000);
  });

  it("stays near the website's limit when memory is tight, never below it", () => {
    expect(computeAnalysisLimits(4 * GB, 0.25 * GB).maxTriangles).toBe(MIN_MAX_TRIANGLES);
    expect(computeAnalysisLimits(2 * GB, 0.1 * GB).maxTriangles).toBe(MIN_MAX_TRIANGLES);
    expect(computeAnalysisLimits(0, 0).maxTriangles).toBe(MIN_MAX_TRIANGLES);
  });

  it("doesn't count on more than half the installed memory, however much is free", () => {
    const limits = computeAnalysisLimits(4 * GB, 4 * GB); // everything free, but only 2 GB is ours to plan on
    expect(limits.maxTriangles).toBeLessThanOrEqual(Math.floor((2 * GB * 0.4) / BYTES_PER_TRIANGLE));
  });

  it("never goes up when free memory goes down", () => {
    let previous = Infinity;
    for (let free = 12; free >= 0; free -= 0.5) {
      const now = computeAnalysisLimits(16 * GB, free * GB).maxTriangles;
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
    }
  });

  it("reports the memory it saw, and rounds to a tidy number", () => {
    const limits = computeAnalysisLimits(8 * GB, 2.5 * GB);
    expect(limits.totalMemoryMB).toBe(8192);
    expect(limits.freeMemoryMB).toBe(2560);
    expect(limits.maxTriangles % 5000).toBe(0);
  });

  it("is a sane, safe size against the measured cost", () => {
    // The memory the limit implies must stay well inside the memory that is free.
    for (const [total, free] of [[8, 3], [16, 6], [4, 1.5], [32, 20]] as const) {
      const { maxTriangles } = computeAnalysisLimits(total * GB, free * GB);
      const measuredBytes = maxTriangles * 1400; // what the benchmark measured per triangle
      expect(measuredBytes).toBeLessThan(free * GB * 0.4);
    }
  });
});

describe("friendlyAnalysisError", () => {
  const limits = { maxTriangles: 340_000 };

  it("explains the limit in plain words and says what to do", () => {
    const text = friendlyAnalysisError("Mesh has 1,200,000 triangles, exceeding the 340,000 limit for diffing", limits);
    expect(text).toContain("1,200,000 triangles");
    expect(text).toContain("up to 340,000");
    expect(text).toMatch(/Simplify or decimate/);
    expect(text).toMatch(/still safely in your library/);
  });

  it("handles the 3MF parser's wording", () => {
    const text = friendlyAnalysisError("Mesh has more than 340,000 triangles, exceeding the limit for diffing", limits);
    expect(text).toContain("more than 340,000 triangles");
  });

  it("passes other messages through untouched", () => {
    expect(friendlyAnalysisError("bad file", limits)).toBe("bad file");
  });
});

describe("binaryStlTriangleCount", () => {
  function binaryStl(triangles: number): Uint8Array {
    const bytes = new Uint8Array(84 + triangles * 50);
    new DataView(bytes.buffer).setUint32(80, triangles, true);
    return bytes;
  }

  it("reads the count from a binary STL", () => {
    expect(binaryStlTriangleCount(binaryStl(12))).toBe(12);
    expect(binaryStlTriangleCount(binaryStl(1_000_000))).toBe(1_000_000);
  });

  it("returns null for ASCII STL and for files that don't add up (so they get the full parse)", () => {
    expect(binaryStlTriangleCount(new TextEncoder().encode("solid cube\nfacet normal 0 0 0\n".padEnd(200, " ")))).toBeNull();
    const truncated = binaryStl(10).slice(0, 300);
    expect(binaryStlTriangleCount(truncated)).toBeNull();
    expect(binaryStlTriangleCount(new Uint8Array(10))).toBeNull();
  });
});
