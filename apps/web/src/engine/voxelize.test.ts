import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { countOccupied, voxelizeGeometry } from "./voxelize";

describe("voxelizeGeometry", () => {
  it("counts exactly 8000 voxels for a 10x10x10mm cube at 0.5mm resolution", () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const result = voxelizeGeometry(geometry, 0.5);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.dims).toEqual([20, 20, 20]);
    expect(countOccupied(result.data)).toBe(8000);
  });

  it("rejects a non-positive resolution", () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const result = voxelizeGeometry(geometry, 0);

    expect(result.success).toBe(false);
  });
});
