import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { computeSurfaceDeviation, UNCHANGED_COLOR } from "./surfaceDeviation";

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

  it("colors deviations within tolerance as unchanged instead of scaling them", () => {
    // B is 0.2mm larger per axis than A -> a 0.1mm outward offset on every
    // face, well within a 1mm/2mm press-fit tolerance.
    const geometryA = new THREE.BoxGeometry(10, 10, 10);
    const geometryB = new THREE.BoxGeometry(10.2, 10.2, 10.2);

    const withoutTolerance = computeSurfaceDeviation(geometryB, geometryA);
    expect(withoutTolerance.success).toBe(true);
    if (!withoutTolerance.success) return;
    // Some color channel should differ from the neutral gray once colored.
    const untoleranced = withoutTolerance.data.colors.slice(0, 3);
    expect(
      untoleranced[0] !== UNCHANGED_COLOR.r ||
        untoleranced[1] !== UNCHANGED_COLOR.g ||
        untoleranced[2] !== UNCHANGED_COLOR.b,
    ).toBe(true);

    // Corner vertices see the full 3-axis offset (sqrt(3) * 0.1 ~= 0.173mm),
    // not just the per-face 0.1mm, so the tolerance needs to cover that.
    const withTolerance = computeSurfaceDeviation(geometryB, geometryA, { toleranceMm: 0.2 });
    expect(withTolerance.success).toBe(true);
    if (!withTolerance.success) return;
    for (let i = 0; i < withTolerance.data.colors.length; i += 3) {
      expect(withTolerance.data.colors[i]).toBeCloseTo(UNCHANGED_COLOR.r, 5);
      expect(withTolerance.data.colors[i + 1]).toBeCloseTo(UNCHANGED_COLOR.g, 5);
      expect(withTolerance.data.colors[i + 2]).toBeCloseTo(UNCHANGED_COLOR.b, 5);
    }
  });

  it("fails when a geometry has no position attribute", () => {
    const empty = new THREE.BufferGeometry();
    const box = new THREE.BoxGeometry(10, 10, 10);

    const result = computeSurfaceDeviation(empty, box);

    expect(result.success).toBe(false);
  });
});
