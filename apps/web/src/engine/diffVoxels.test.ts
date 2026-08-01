import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { computeVoxelDiff } from "./diffVoxels";
import { countOccupied, voxelizeGeometry } from "./voxelize";

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
