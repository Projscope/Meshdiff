import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildGhostOverlayColors,
  computeSurfaceDeviation,
  REMOVED_COLOR,
  UNCHANGED_COLOR,
} from "./surfaceDeviation";

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

  it("makes ghost vertices visible only where the source sticks out past the reference", () => {
    // Reuse the "pushed outward" case: B's vertices are all outside A by
    // sqrt(12)mm, well past a 1mm tolerance -> every ghost vertex visible.
    const geometryA = new THREE.BoxGeometry(10, 10, 10);
    const geometryB = new THREE.BoxGeometry(14, 14, 14);
    const outward = computeSurfaceDeviation(geometryB, geometryA);
    expect(outward.success).toBe(true);
    if (!outward.success) return;

    const rgba = buildGhostOverlayColors(outward.data.signedDistancesMm, 1, REMOVED_COLOR, 0.5);
    expect(rgba.length).toBe(outward.data.signedDistancesMm.length * 4);
    for (let i = 0; i < outward.data.signedDistancesMm.length; i++) {
      expect(rgba[i * 4]).toBeCloseTo(REMOVED_COLOR.r, 5);
      expect(rgba[i * 4 + 3]).toBeCloseTo(0.5, 5);
    }
  });

  it("makes ghost vertices invisible when the source stays within the reference", () => {
    // "Pulled inward" case: B's vertices are all inside A -> signed
    // distance negative, never exceeds a positive tolerance -> invisible.
    const geometryA = new THREE.BoxGeometry(10, 10, 10);
    const geometryB = new THREE.BoxGeometry(6, 6, 6);
    const inward = computeSurfaceDeviation(geometryB, geometryA);
    expect(inward.success).toBe(true);
    if (!inward.success) return;

    const rgba = buildGhostOverlayColors(inward.data.signedDistancesMm, 0.5, REMOVED_COLOR);
    for (let i = 0; i < inward.data.signedDistancesMm.length; i++) {
      expect(rgba[i * 4 + 3]).toBe(0);
    }
  });

  it("fails when a geometry has no position attribute", () => {
    const empty = new THREE.BufferGeometry();
    const box = new THREE.BoxGeometry(10, 10, 10);

    const result = computeSurfaceDeviation(empty, box);

    expect(result.success).toBe(false);
  });
});
