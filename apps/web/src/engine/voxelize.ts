import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { Result } from "@meshdiff/shared/types/diff";

export interface VoxelGrid {
  resolutionMm: number;
  dims: [number, number, number];
  originMm: [number, number, number];
  occupied: Uint8Array;
}

// Slightly off-axis so the ray doesn't land exactly on a triangulation
// seam (e.g. a box face's diagonal edge), which would make a hit register
// as 0 or 2 intersections instead of 1 and flip the parity result.
const INSIDE_TEST_DIRECTION = new THREE.Vector3(1, 1e-4, 2.7e-4).normalize();

/**
 * Parity (odd-crossing) inside/outside test against a BVH. Requires a
 * watertight, outward-facing manifold mesh — true for well-formed
 * STL/3MF/OBJ prints but not guaranteed for arbitrary uploads.
 */
function isPointInside(bvh: MeshBVH, point: THREE.Vector3): boolean {
  const ray = new THREE.Ray(point, INSIDE_TEST_DIRECTION);
  const hits = bvh.raycast(ray, THREE.DoubleSide);
  return hits.length % 2 === 1;
}

export function voxelizeGeometry(
  geometry: THREE.BufferGeometry,
  resolutionMm: number,
): Result<VoxelGrid> {
  if (resolutionMm <= 0) {
    return { success: false, error: "resolutionMm must be positive" };
  }
  if (!geometry.attributes.position) {
    return { success: false, error: "geometry has no position attribute" };
  }

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) {
    return { success: false, error: "failed to compute bounding box" };
  }

  const size = new THREE.Vector3();
  box.getSize(size);

  const dims: [number, number, number] = [
    Math.max(1, Math.round(size.x / resolutionMm)),
    Math.max(1, Math.round(size.y / resolutionMm)),
    Math.max(1, Math.round(size.z / resolutionMm)),
  ];

  const bvh = new MeshBVH(geometry);
  const occupied = new Uint8Array(dims[0] * dims[1] * dims[2]);

  const half = resolutionMm / 2;
  const point = new THREE.Vector3();

  for (let k = 0; k < dims[2]; k++) {
    for (let j = 0; j < dims[1]; j++) {
      for (let i = 0; i < dims[0]; i++) {
        point.set(
          box.min.x + i * resolutionMm + half,
          box.min.y + j * resolutionMm + half,
          box.min.z + k * resolutionMm + half,
        );
        if (isPointInside(bvh, point)) {
          const index = i + j * dims[0] + k * dims[0] * dims[1];
          occupied[index] = 1;
        }
      }
    }
  }

  return {
    success: true,
    data: {
      resolutionMm,
      dims,
      originMm: [box.min.x, box.min.y, box.min.z],
      occupied,
    },
  };
}

export function countOccupied(grid: VoxelGrid): number {
  let count = 0;
  for (let i = 0; i < grid.occupied.length; i++) {
    count += grid.occupied[i];
  }
  return count;
}
