import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { computeVoxelDiff } from "./diffVoxels.js";
import { countOccupied, voxelizeGeometry } from "./voxelize.js";

describe("computeVoxelDiff", () => {
  it("reports zero added/removed for two identical meshes", () => {
    const geometryA = new THREE.BoxGeometry(10, 10, 10);
    const geometryB = new THREE.BoxGeometry(10, 10, 10);

    const result = computeVoxelDiff(geometryA, geometryB, { resolutionMm: 0.5 });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.stats.addedCount).toBe(0);
    expect(result.data.stats.removedCount).toBe(0);
    expect(result.data.stats.unchangedCount).toBe(8000);
    expect(result.data.stats.approxVolumeDeltaPercent).toBeCloseTo(0);
  });

  it("classifies fully disjoint meshes as all-added / all-removed", () => {
    const geometryA = new THREE.BoxGeometry(10, 10, 10);
    const geometryB = new THREE.BoxGeometry(10, 10, 10);
    geometryB.translate(20, 0, 0);

    const resolutionMm = 0.5;
    const occupiedA = voxelizeGeometry(geometryA, resolutionMm);
    const occupiedB = voxelizeGeometry(geometryB, resolutionMm);
    expect(occupiedA.success && occupiedB.success).toBe(true);
    if (!occupiedA.success || !occupiedB.success) return;

    const result = computeVoxelDiff(geometryA, geometryB, { resolutionMm });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.stats.unchangedCount).toBe(0);
    expect(result.data.stats.addedCount).toBe(countOccupied(occupiedB.data));
    expect(result.data.stats.removedCount).toBe(countOccupied(occupiedA.data));
  });

  it("collapses a 1-voxel shift to unchanged once tolerance covers it", () => {
    // A 10x10x10mm cube shifted by exactly one 1mm voxel along x: without
    // tolerance, the leading/trailing 1mm slices (10x10 cells each) are
    // added/removed and the rest (9 slices) is unchanged.
    const geometryA = new THREE.BoxGeometry(10, 10, 10);
    const geometryB = new THREE.BoxGeometry(10, 10, 10);
    geometryB.translate(1, 0, 0);
    const resolutionMm = 1;

    const withoutTolerance = computeVoxelDiff(geometryA, geometryB, { resolutionMm });
    expect(withoutTolerance.success).toBe(true);
    if (!withoutTolerance.success) return;
    expect(withoutTolerance.data.stats.addedCount).toBe(100);
    expect(withoutTolerance.data.stats.removedCount).toBe(100);
    expect(withoutTolerance.data.stats.unchangedCount).toBe(900);

    const withTolerance = computeVoxelDiff(geometryA, geometryB, {
      resolutionMm,
      toleranceMm: 1,
    });
    expect(withTolerance.success).toBe(true);
    if (!withTolerance.success) return;
    expect(withTolerance.data.stats.addedCount).toBe(0);
    expect(withTolerance.data.stats.removedCount).toBe(0);
    // All 1100 cells occupied in A or B (900 exact overlap + the 200 that
    // were only-A/only-B) now read as unchanged.
    expect(withTolerance.data.stats.unchangedCount).toBe(1100);
  });

  it("rejects an explicit resolution too fine for the mesh extent, rather than truncating coverage", () => {
    const geometryA = new THREE.BoxGeometry(10, 10, 10);
    const geometryB = new THREE.BoxGeometry(10, 10, 10);
    geometryB.translate(1000, 0, 0);

    const result = computeVoxelDiff(geometryA, geometryB, { resolutionMm: 0.5 });

    expect(result.success).toBe(false);
  });

  it("rejects meshes with a degenerate combined bounding box", () => {
    const point = new THREE.BufferGeometry();
    point.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));

    const result = computeVoxelDiff(point, point);

    expect(result.success).toBe(false);
  });
});
