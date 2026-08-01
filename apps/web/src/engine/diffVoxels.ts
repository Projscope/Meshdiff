import * as THREE from "three";
import type { Result } from "@meshdiff/shared/types/diff";
import { voxelizeGeometryIntoGrid } from "./voxelize";

export const VOXEL_EMPTY = 0;
export const VOXEL_UNCHANGED = 1;
export const VOXEL_ADDED = 2;
export const VOXEL_REMOVED = 3;

export interface VoxelDiffGrid {
  resolutionMm: number;
  dims: [number, number, number];
  originMm: [number, number, number];
  classification: Uint8Array;
}

export interface VoxelDiffStats {
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
  voxelVolumeMm3: number;
  approxVolumeDeltaMm3: number;
  approxVolumeDeltaPercent: number;
}

export interface VoxelDiffResult {
  grid: VoxelDiffGrid;
  stats: VoxelDiffStats;
}

const DEFAULT_TARGET_VOXELS_PER_AXIS = 32;
const MAX_VOXELS_PER_AXIS = 96;
const MIN_RESOLUTION_MM = 0.05;

/**
 * Grows an occupancy grid outward by `radiusVoxels` along each axis
 * (separable box dilation — one 1D pass per axis, so cost is linear in
 * radius rather than cubic). Used to implement a distance tolerance: a
 * cell in the dilated grid is "occupied" if the real grid has an occupied
 * cell within `radiusVoxels` of it.
 */
function dilateOccupancy(
  occupied: Uint8Array,
  dims: [number, number, number],
  radiusVoxels: number,
): Uint8Array {
  const [dx, dy, dz] = dims;
  let current = occupied;

  for (const axis of [0, 1, 2] as const) {
    const next = new Uint8Array(current.length);
    const axisLen = dims[axis];

    for (let k = 0; k < dz; k++) {
      for (let j = 0; j < dy; j++) {
        for (let i = 0; i < dx; i++) {
          const index = i + j * dx + k * dx * dy;
          if (current[index] !== 1) continue;

          const [ci, cj, ck] = [i, j, k];
          const coord = axis === 0 ? ci : axis === 1 ? cj : ck;
          const lo = Math.max(0, coord - radiusVoxels);
          const hi = Math.min(axisLen - 1, coord + radiusVoxels);
          for (let c = lo; c <= hi; c++) {
            const spreadIndex =
              axis === 0
                ? c + cj * dx + ck * dx * dy
                : axis === 1
                  ? ci + c * dx + ck * dx * dy
                  : ci + cj * dx + c * dx * dy;
            next[spreadIndex] = 1;
          }
        }
      }
    }
    current = next;
  }

  return current;
}

/**
 * Voxelizes two meshes into a shared index space and classifies each cell
 * as unchanged / added / removed. Runs on the main thread today — the
 * voxel budget below keeps that fast for demo-sized meshes, but the perf
 * rules in CLAUDE.md call for this to move to a Web Worker before real
 * uploads are supported.
 *
 * SAFETY: no PCA/ICP alignment yet (see CLAUDE.md "Alignment Strategy").
 * Mesh A and B are compared in their native coordinates, which is correct
 * for versioned exports that share a CAD origin but not for arbitrary
 * uploads.
 */
export function computeVoxelDiff(
  geometryA: THREE.BufferGeometry,
  geometryB: THREE.BufferGeometry,
  options?: {
    resolutionMm?: number;
    targetVoxelsPerAxis?: number;
    /** Deviations within this distance of the other mesh don't count as added/removed. */
    toleranceMm?: number;
  },
): Result<VoxelDiffResult> {
  geometryA.computeBoundingBox();
  geometryB.computeBoundingBox();
  const boxA = geometryA.boundingBox;
  const boxB = geometryB.boundingBox;
  if (!boxA || !boxB) {
    return { success: false, error: "failed to compute bounding box" };
  }

  const union = boxA.clone().union(boxB);
  const size = new THREE.Vector3();
  union.getSize(size);
  const longestAxisMm = Math.max(size.x, size.y, size.z);
  if (longestAxisMm <= 0) {
    return { success: false, error: "meshes have zero-volume bounding box" };
  }

  const targetVoxelsPerAxis = Math.min(
    options?.targetVoxelsPerAxis ?? DEFAULT_TARGET_VOXELS_PER_AXIS,
    MAX_VOXELS_PER_AXIS,
  );
  const resolutionMm = Math.max(
    options?.resolutionMm ?? longestAxisMm / targetVoxelsPerAxis,
    MIN_RESOLUTION_MM,
  );

  const dims: [number, number, number] = [
    Math.max(1, Math.ceil(size.x / resolutionMm)),
    Math.max(1, Math.ceil(size.y / resolutionMm)),
    Math.max(1, Math.ceil(size.z / resolutionMm)),
  ];

  // The auto-picked resolution (from targetVoxelsPerAxis) can never exceed
  // the cap by construction. An explicit resolutionMm can, though — and
  // clamping dims in that case would silently shrink the grid's physical
  // coverage while keeping the resolution label the same, truncating part
  // of the mesh without any error. Fail loudly instead.
  if (dims[0] > MAX_VOXELS_PER_AXIS || dims[1] > MAX_VOXELS_PER_AXIS || dims[2] > MAX_VOXELS_PER_AXIS) {
    return {
      success: false,
      error: `resolutionMm=${resolutionMm} is too fine for this mesh's extent (${longestAxisMm.toFixed(2)}mm) — would need up to ${Math.max(...dims)} voxels per axis, max is ${MAX_VOXELS_PER_AXIS}`,
    };
  }
  const originMm: [number, number, number] = [union.min.x, union.min.y, union.min.z];

  const occupiedA = voxelizeGeometryIntoGrid(geometryA, resolutionMm, originMm, dims);
  const occupiedB = voxelizeGeometryIntoGrid(geometryB, resolutionMm, originMm, dims);

  const toleranceMm = options?.toleranceMm ?? 0;
  const toleranceVoxels = toleranceMm > 0 ? Math.round(toleranceMm / resolutionMm) : 0;
  // A cell that's occupied only in A (or only in B) is within tolerance if
  // the *other* mesh has an occupied cell nearby — check against a dilated
  // copy of the other mesh's grid rather than the exact one.
  const dilatedA = toleranceVoxels > 0 ? dilateOccupancy(occupiedA, dims, toleranceVoxels) : occupiedA;
  const dilatedB = toleranceVoxels > 0 ? dilateOccupancy(occupiedB, dims, toleranceVoxels) : occupiedB;

  const classification = new Uint8Array(occupiedA.length);
  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;

  for (let i = 0; i < classification.length; i++) {
    const inA = occupiedA[i] === 1;
    const inB = occupiedB[i] === 1;
    if (inA && inB) {
      classification[i] = VOXEL_UNCHANGED;
      unchangedCount++;
    } else if (inA && !inB) {
      if (dilatedB[i] === 1) {
        classification[i] = VOXEL_UNCHANGED;
        unchangedCount++;
      } else {
        classification[i] = VOXEL_REMOVED;
        removedCount++;
      }
    } else if (!inA && inB) {
      if (dilatedA[i] === 1) {
        classification[i] = VOXEL_UNCHANGED;
        unchangedCount++;
      } else {
        classification[i] = VOXEL_ADDED;
        addedCount++;
      }
    }
  }

  const voxelVolumeMm3 = resolutionMm ** 3;
  const volumeAMm3 = (unchangedCount + removedCount) * voxelVolumeMm3;
  const approxVolumeDeltaMm3 = (addedCount - removedCount) * voxelVolumeMm3;
  const approxVolumeDeltaPercent =
    volumeAMm3 > 0 ? (approxVolumeDeltaMm3 / volumeAMm3) * 100 : 0;

  return {
    success: true,
    data: {
      grid: { resolutionMm, dims, originMm, classification },
      stats: {
        addedCount,
        removedCount,
        unchangedCount,
        voxelVolumeMm3,
        approxVolumeDeltaMm3,
        approxVolumeDeltaPercent,
      },
    },
  };
}
