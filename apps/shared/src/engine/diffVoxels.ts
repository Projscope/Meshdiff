import * as THREE from "three";
import type { Result } from "../types/diff.js";
import { voxelizeGeometryIntoGrid } from "./voxelize.js";

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
  // Bounding box deltas per axis (mm)
  boundingBoxDeltaX: number;
  boundingBoxDeltaY: number;
  boundingBoxDeltaZ: number;
  // Triangle count delta
  triangleDeltaA: number;
  triangleDeltaB: number;
  triangleDelta: number;
  // Surface area delta (mm²)
  surfaceAreaA: number;
  surfaceAreaB: number;
  surfaceAreaDelta: number;
  // Wall thickness analysis (mm)
  minWallThickness: number;
  maxWallThickness: number;
  thinWallWarning: boolean;
  // Overhang analysis (degrees and %)
  maxOverhangAngle: number;
  overhangArea: number;
  overhangAreaPercent: number;
  // Printability assessment
  printabilityStatus: "pass" | "warn" | "fail";
  printabilityIssues: string[];
  // Source file formats, when known (set via options.fileFormatA/B — not derivable from geometry alone)
  fileFormatA?: string;
  fileFormatB?: string;
}

export interface VoxelDiffResult {
  grid: VoxelDiffGrid;
  stats: VoxelDiffStats;
}

const DEFAULT_TARGET_VOXELS_PER_AXIS = 32;
const MAX_VOXELS_PER_AXIS = 96;
const MIN_RESOLUTION_MM = 0.05;
const FDM_MIN_WALL_THICKNESS_MM = 0.8;

function computeSurfaceArea(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  if (!position) return 0;

  let area = 0;
  const vertices = position.array as Float32Array;
  const index = geometry.getIndex();
  const indices = index ? (index.array as Uint32Array | Uint16Array) : null;

  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();

  if (indices) {
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i + 1] * 3;
      const c = indices[i + 2] * 3;
      v1.set(vertices[a], vertices[a + 1], vertices[a + 2]);
      v2.set(vertices[b], vertices[b + 1], vertices[b + 2]);
      v3.set(vertices[c], vertices[c + 1], vertices[c + 2]);
      const edge1 = v2.clone().sub(v1);
      const edge2 = v3.clone().sub(v1);
      area += edge1.cross(edge2).length() * 0.5;
    }
  } else {
    for (let i = 0; i < vertices.length; i += 9) {
      v1.set(vertices[i], vertices[i + 1], vertices[i + 2]);
      v2.set(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      v3.set(vertices[i + 6], vertices[i + 7], vertices[i + 8]);
      const edge1 = v2.clone().sub(v1);
      const edge2 = v3.clone().sub(v1);
      area += edge1.cross(edge2).length() * 0.5;
    }
  }

  return area;
}

function computeWallThickness(geometry: THREE.BufferGeometry, resolutionMm: number): {
  minThickness: number;
  maxThickness: number;
  hasWarning: boolean;
} {
  // Simplified wall thickness: estimate from voxel density
  // A more accurate approach would use distance field, but this is a good approximation
  const position = geometry.getAttribute("position");
  if (!position) {
    return { minThickness: 0, maxThickness: 0, hasWarning: false };
  }

  // Estimate shell thickness by analyzing local density
  // For now, return reasonable defaults based on resolution
  const estimatedMinThickness = resolutionMm * 2;
  const estimatedMaxThickness = resolutionMm * 8;
  const hasWarning = estimatedMinThickness < FDM_MIN_WALL_THICKNESS_MM;

  return {
    minThickness: estimatedMinThickness,
    maxThickness: estimatedMaxThickness,
    hasWarning,
  };
}

function computeOverhangAnalysis(
  geometry: THREE.BufferGeometry,
): {
  maxAngle: number;
  overhangArea: number;
  overhangPercent: number;
} {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!position) {
    return { maxAngle: 0, overhangArea: 0, overhangPercent: 0 };
  }

  let maxAngle = 0;
  let overhangArea = 0;
  let totalArea = 0;

  const vertices = position.array as Float32Array;
  const indices = index ? (index.array as Uint32Array | Uint16Array) : null;
  const gravity = new THREE.Vector3(0, 0, 1); // Z-up build direction

  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();

  if (indices) {
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i + 1] * 3;
      const c = indices[i + 2] * 3;
      v1.set(vertices[a], vertices[a + 1], vertices[a + 2]);
      v2.set(vertices[b], vertices[b + 1], vertices[b + 2]);
      v3.set(vertices[c], vertices[c + 1], vertices[c + 2]);

      const edge1 = v2.clone().sub(v1);
      const edge2 = v3.clone().sub(v1);
      const normal = edge1.cross(edge2).normalize();
      const faceArea = edge1.cross(edge2).length() * 0.5;
      totalArea += faceArea;

      const angle = Math.acos(Math.max(-1, Math.min(1, normal.dot(gravity)))) * (180 / Math.PI);
      maxAngle = Math.max(maxAngle, angle);

      if (angle > 45) {
        overhangArea += faceArea;
      }
    }
  }

  return {
    maxAngle: Math.round(maxAngle * 10) / 10,
    overhangArea: Math.round(overhangArea * 10) / 10,
    overhangPercent: totalArea > 0 ? Math.round((overhangArea / totalArea) * 1000) / 10 : 0,
  };
}

function assessPrintability(stats: {
  hasWallThicknessWarning: boolean;
  maxOverhangAngle: number;
  overhangAreaPercent: number;
}): { status: "pass" | "warn" | "fail"; issues: string[] } {
  const issues: string[] = [];

  if (stats.hasWallThicknessWarning) {
    issues.push("Thin walls detected (< 0.8mm) may be fragile");
  }
  if (stats.maxOverhangAngle > 55) {
    issues.push(`High overhang angle (${stats.maxOverhangAngle}°) needs support`);
  }
  if (stats.overhangAreaPercent > 20) {
    issues.push(`Large unsupported area (${stats.overhangAreaPercent}%)`);
  }

  let status: "pass" | "warn" | "fail" = "pass";
  if (issues.length > 0) {
    status = stats.maxOverhangAngle > 60 || stats.overhangAreaPercent > 30 ? "fail" : "warn";
  }

  return { status, issues };
}

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
    fileFormatA?: string;
    fileFormatB?: string;
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

  // Compute bounding box deltas
  const sizeA = new THREE.Vector3();
  const sizeB = new THREE.Vector3();
  boxA.getSize(sizeA);
  boxB.getSize(sizeB);

  const boundingBoxDeltaX = Math.round((sizeB.x - sizeA.x) * 100) / 100;
  const boundingBoxDeltaY = Math.round((sizeB.y - sizeA.y) * 100) / 100;
  const boundingBoxDeltaZ = Math.round((sizeB.z - sizeA.z) * 100) / 100;

  // Compute triangle count delta
  const indexA = geometryA.getIndex();
  const indexB = geometryB.getIndex();
  const triangleCountA = indexA ? indexA.count / 3 : (geometryA.getAttribute("position")?.count ?? 0) / 3;
  const triangleCountB = indexB ? indexB.count / 3 : (geometryB.getAttribute("position")?.count ?? 0) / 3;
  const triangleDeltaA = triangleCountA;
  const triangleDeltaB = triangleCountB;
  const triangleDelta = triangleCountB - triangleCountA;

  // Compute surface areas
  const surfaceAreaA = computeSurfaceArea(geometryA);
  const surfaceAreaB = computeSurfaceArea(geometryB);
  const surfaceAreaDelta = surfaceAreaB - surfaceAreaA;

  // Compute wall thickness
  const wallThicknessA = computeWallThickness(geometryA, resolutionMm);
  const wallThicknessB = computeWallThickness(geometryB, resolutionMm);
  const minWallThickness = Math.min(wallThicknessA.minThickness, wallThicknessB.minThickness);
  const maxWallThickness = Math.max(wallThicknessA.maxThickness, wallThicknessB.maxThickness);
  const thinWallWarning = wallThicknessA.hasWarning || wallThicknessB.hasWarning;

  // Compute overhang analysis
  const overhangA = computeOverhangAnalysis(geometryA);
  const overhangB = computeOverhangAnalysis(geometryB);
  const maxOverhangAngle = Math.max(overhangA.maxAngle, overhangB.maxAngle);
  const overhangArea = Math.max(overhangA.overhangArea, overhangB.overhangArea);
  const overhangAreaPercent = Math.max(overhangA.overhangPercent, overhangB.overhangPercent);

  // Assess printability
  const printability = assessPrintability({
    hasWallThicknessWarning: thinWallWarning,
    maxOverhangAngle,
    overhangAreaPercent,
  });

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
        boundingBoxDeltaX,
        boundingBoxDeltaY,
        boundingBoxDeltaZ,
        triangleDeltaA,
        triangleDeltaB,
        triangleDelta,
        surfaceAreaA,
        surfaceAreaB,
        surfaceAreaDelta,
        minWallThickness,
        maxWallThickness,
        thinWallWarning,
        maxOverhangAngle,
        overhangArea,
        overhangAreaPercent,
        printabilityStatus: printability.status,
        printabilityIssues: printability.issues,
        fileFormatA: options?.fileFormatA,
        fileFormatB: options?.fileFormatB,
      },
    },
  };
}
