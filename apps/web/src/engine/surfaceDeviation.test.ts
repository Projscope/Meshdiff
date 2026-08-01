import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { computeSurfaceDeviation } from "./surfaceDeviation";

describe("computeSurfaceDeviation", () => {
  it("reports zero deviation everywhere for two identical meshes", () => {
    const geometryA = new THREE.BoxGeometry(10, 10, 10);
    const geometryB = new THREE.BoxGeometry(10, 10, 10);

    const result = computeSurfaceDeviation(geometryA, geometryB);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.maxAbsDeviationMm).toBeCloseTo(0, 5);
    for (const d of result.data.signedDistancesMm) {
      expect(d).toBeCloseTo(0, 5);
    }
  });

  it("reports positive deviation for vertices pushed outward", () => {
    const geometryA = new THREE.BoxGeometry(10, 10, 10);
    const geometryB = new THREE.BoxGeometry(14, 14, 14);

    const result = computeSurfaceDeviation(geometryB, geometryA);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // B's vertices sit at the corners (±7,±7,±7); A's nearest surface point
    // for a point outside on all three axes is A's own corner (±5,±5,±5),
    // so the distance is the full corner-to-corner diagonal, not a
    // per-axis face offset: sqrt(2^2 + 2^2 + 2^2).
    expect(result.data.maxAbsDeviationMm).toBeCloseTo(Math.sqrt(12), 5);
    for (const d of result.data.signedDistancesMm) {
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  it("reports negative deviation for vertices pulled inward", () => {
    const geometryA = new THREE.BoxGeometry(10, 10, 10);
    const geometryB = new THREE.BoxGeometry(6, 6, 6);

    const result = computeSurfaceDeviation(geometryB, geometryA);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.maxAbsDeviationMm).toBeCloseTo(2, 5);
    for (const d of result.data.signedDistancesMm) {
      expect(d).toBeLessThanOrEqual(0);
    }
  });

  it("fails when a geometry has no position attribute", () => {
    const empty = new THREE.BufferGeometry();
    const box = new THREE.BoxGeometry(10, 10, 10);

    const result = computeSurfaceDeviation(empty, box);

    expect(result.success).toBe(false);
  });
});
