import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { HoleChange, Result } from "../types/diff.js";
import { voxelizeGeometryIntoGrid } from "./voxelize.js";
import { detectCylindricalHoles, type DetectedHole } from "./holeDetection.js";

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
  // Hole inventory (cylindrical bore detection — axis-aligned only, see holeDetection.ts)
  holeCountA: number;
  holeCountB: number;
  holesAdded: number;
  holesRemoved: number;
  holesDiameterChanged: number;
  minHoleDiameterMm: number;
  holeChanges: HoleChange[];
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
// CLAUDE.md "3D Printing Constraints (FDM Focus)": holes smaller than this
// tend to fill in with filament during printing.
const FDM_MIN_HOLE_DIAMETER_MM = 2;
// A matched hole's diameter has to move by more than this to count as an
// actual change rather than mesh-faceting/circle-fit noise.
const HOLE_DIAMETER_CHANGE_THRESHOLD_MM = 0.1;
// A file-size cap (see apps/api/src/lib/fileSizeLimit.ts) only bounds bytes
// on disk — it doesn't bound triangle count, and triangle count is what
// actually drives memory here: MeshBVH builds a full tree per mesh, and
// position/normal buffers get cloned multiple times over during loading and
// merging. A ZIP-compressed 3MF can unpack to far more triangles than its
// compressed byte size suggests, and that mismatch was observed crashing a
// Render instance with an unrecoverable V8 heap OOM even after the 50MB
// byte cap was in place. finalize()/diff() fundamentally hold TWO meshes
// (previous + current) resident at once — computeVoxelDiff voxelizes both
// into a shared grid and computes deltas between them, so there's no way to
// process one and release it before the other; a per-mesh cap has to leave
// headroom for double its own cost plus Node/Fastify baseline overhead. The
// cap went 1,000,000 -> 200,000 after a real OOM on Render's Standard
// (2GB) plan; even 200,000 turned out to still push the same instance to a
// 40-SECOND, GC-thrashing near-miss (confirmed via Render's request logs:
// one finalize() call took 40398ms against files that individually
// shouldn't take more than milliseconds) — the previous version being
// diffed against is very often a real, detailed 3D-printable model, not a
// synthetic test file. 50,000 gives real safety margin on a 1-CPU/2GB
// instance while still comfortably covering the vast majority of
// real-world FDM-printable parts. Exported so loadMeshServer.ts can reject
// an oversized mesh right after parsing — before the expensive
// toNonIndexed()/merge expansion steps that duplicate every vertex per
// triangle, which is where OBJ/3MF memory actually blows up (this check
// alone, running only once diffing starts, is too late to prevent that).
export const MAX_TRIANGLES_PER_MESH = 50_000;

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

// Cap the number of sampled triangles so a dense mesh (tens of thousands of
// triangles) still costs one bounded pass of BVH raycasts rather than one
// per triangle.
const MAX_WALL_THICKNESS_SAMPLES = 4000;
// Nudge the ray origin this far inward off the originating triangle before
// casting, so the BVH raycast doesn't immediately re-hit that same triangle
// at t≈0 (which would report a false zero-thickness reading).
const WALL_THICKNESS_RAY_EPSILON_MM = 1e-3;

/**
 * Opposing-normal raycast wall-thickness measurement (the same technique
 * slicers like PrusaSlicer/Meshmixer use): for a sample of surface points,
 * cast a ray inward along the negated face normal and take the distance to
 * the first back-facing surface the ray hits. That distance is the local
 * shell thickness at that point. Requires a closed, outward-facing manifold
 * mesh — same assumption `isPointInsideMesh` (voxelize.ts) already makes for
 * well-formed STL/3MF/OBJ prints.
 */
function computeWallThickness(geometry: THREE.BufferGeometry, resolutionMm: number): {
  minThickness: number;
  maxThickness: number;
  hasWarning: boolean;
} {
  const position = geometry.getAttribute("position");
  if (!position) {
    return { minThickness: 0, maxThickness: 0, hasWarning: false };
  }

  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  if (triangleCount === 0) {
    return { minThickness: 0, maxThickness: 0, hasWarning: false };
  }

  const bvh = new MeshBVH(geometry);
  const stride = Math.max(1, Math.floor(triangleCount / MAX_WALL_THICKNESS_SAMPLES));

  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();

  let minThickness = Infinity;
  let maxThickness = 0;
  let sampleCount = 0;

  for (let t = 0; t < triangleCount; t += stride) {
    const i = t * 3;
    const a = index ? index.getX(i) : i;
    const b = index ? index.getX(i + 1) : i + 1;
    const c = index ? index.getX(i + 2) : i + 2;
    v1.fromBufferAttribute(position, a);
    v2.fromBufferAttribute(position, b);
    v3.fromBufferAttribute(position, c);

    edge1.subVectors(v2, v1);
    edge2.subVectors(v3, v1);
    normal.crossVectors(edge1, edge2);
    if (normal.lengthSq() === 0) continue; // degenerate triangle
    normal.normalize();

    centroid.copy(v1).add(v2).add(v3).divideScalar(3);
    rayOrigin.copy(centroid).addScaledVector(normal, -WALL_THICKNESS_RAY_EPSILON_MM);
    rayDirection.copy(normal).negate();

    const hit = bvh.raycastFirst(new THREE.Ray(rayOrigin, rayDirection), THREE.DoubleSide);
    if (hit && hit.distance > 0) {
      minThickness = Math.min(minThickness, hit.distance);
      maxThickness = Math.max(maxThickness, hit.distance);
      sampleCount++;
    }
  }

  if (sampleCount === 0) {
    // Non-manifold/open mesh — no opposing surface for any sampled ray to
    // hit. Fall back to the old voxel-resolution estimate rather than
    // reporting a meaningless 0mm.
    const estimatedMinThickness = resolutionMm * 2;
    const estimatedMaxThickness = resolutionMm * 8;
    return {
      minThickness: estimatedMinThickness,
      maxThickness: estimatedMaxThickness,
      hasWarning: estimatedMinThickness < FDM_MIN_WALL_THICKNESS_MM,
    };
  }

  return {
    minThickness: Math.round(minThickness * 100) / 100,
    maxThickness: Math.round(maxThickness * 100) / 100,
    hasWarning: minThickness < FDM_MIN_WALL_THICKNESS_MM,
  };
}

// A face lying within this distance of the mesh's lowest Z is treated as
// part of the model's own base — resting on and supported by the print bed
// itself, not an unsupported overhang. Without this, every closed solid's
// bottom shell (which necessarily faces "down") would register as the worst
// possible overhang, which is what the previous version of this function
// did — see the regression test this bug produced: a plain box and a plain
// sphere both came back "fail" purely from their own flat/curved base.
const BASE_PLANE_EPSILON_MM = 0.05;

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

  geometry.computeBoundingBox();
  const minZ = geometry.boundingBox?.min.z ?? 0;

  // Overhang angle here is measured in degrees *past vertical* — 0° for a
  // vertical wall (fine, no support needed), 90° for a horizontal ceiling
  // facing straight down (worst case). Faces that face upward or are
  // exactly vertical (angle from "up" <= 90°) need no support at all and
  // are excluded entirely, matching how FDM overhangs actually work: a
  // wall doesn't need support just because it isn't horizontal.
  let maxOverhangAngle = 0;
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
      // NOTE: THREE.Vector3.cross() mutates the receiver and returns it, so
      // a second edge1.cross(edge2) call (as the previous version of this
      // code did, to get the un-normalized length for area) would silently
      // re-cross the already-normalized `normal` against edge2 instead of
      // recomputing the original raw cross product — corrupting the normal
      // used for the angle check below. Compute area from the raw cross
      // product first, then normalize a separate clone for the direction.
      const rawNormal = edge1.clone().cross(edge2);
      const faceArea = rawNormal.length() * 0.5;
      totalArea += faceArea;
      if (faceArea === 0) continue; // degenerate triangle — no well-defined normal
      const normal = rawNormal.clone().normalize();

      const restsOnBuildPlate =
        v1.z - minZ < BASE_PLANE_EPSILON_MM &&
        v2.z - minZ < BASE_PLANE_EPSILON_MM &&
        v3.z - minZ < BASE_PLANE_EPSILON_MM;
      if (restsOnBuildPlate) continue;

      const angleFromUp = Math.acos(Math.max(-1, Math.min(1, normal.dot(gravity)))) * (180 / Math.PI);
      if (angleFromUp <= 90) continue; // upward-facing or vertical — no overhang risk

      const overhangAngle = angleFromUp - 90;
      maxOverhangAngle = Math.max(maxOverhangAngle, overhangAngle);

      if (overhangAngle > 45) {
        overhangArea += faceArea;
      }
    }
  }

  return {
    maxAngle: Math.round(maxOverhangAngle * 10) / 10,
    overhangArea: Math.round(overhangArea * 10) / 10,
    overhangPercent: totalArea > 0 ? Math.round((overhangArea / totalArea) * 1000) / 10 : 0,
  };
}

function assessPrintability(stats: {
  hasWallThicknessWarning: boolean;
  maxOverhangAngle: number;
  overhangAreaPercent: number;
  holeCountB: number;
  minHoleDiameterMm: number;
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
  if (stats.holeCountB > 0 && stats.minHoleDiameterMm < FDM_MIN_HOLE_DIAMETER_MM) {
    issues.push(`Small hole diameter (${stats.minHoleDiameterMm.toFixed(2)}mm) may fill in during printing`);
  }

  let status: "pass" | "warn" | "fail" = "pass";
  if (issues.length > 0) {
    status = stats.maxOverhangAngle > 60 || stats.overhangAreaPercent > 30 ? "fail" : "warn";
  }

  return { status, issues };
}

/**
 * Greedily matches mesh B's detected holes to mesh A's nearest unmatched
 * hole (by center distance) within `maxDistanceMm`, and reports the
 * resulting added/removed/diameter-changed set. Not a general assignment
 * solve — real parts rarely have ambiguous near-duplicate holes close
 * enough together for greedy nearest-neighbor to mismatch.
 */
function matchHoles(holesA: DetectedHole[], holesB: DetectedHole[], maxDistanceMm: number): HoleChange[] {
  const changes: HoleChange[] = [];
  const usedA = new Set<number>();
  const usedB = new Set<number>();

  for (let bi = 0; bi < holesB.length; bi++) {
    const holeB = holesB[bi];
    let bestAi = -1;
    let bestDistance = Infinity;
    for (let ai = 0; ai < holesA.length; ai++) {
      if (usedA.has(ai)) continue;
      const holeA = holesA[ai];
      const distance = Math.hypot(
        holeA.centerMm[0] - holeB.centerMm[0],
        holeA.centerMm[1] - holeB.centerMm[1],
        holeA.centerMm[2] - holeB.centerMm[2],
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestAi = ai;
      }
    }
    if (bestAi === -1 || bestDistance > maxDistanceMm) continue;

    usedA.add(bestAi);
    usedB.add(bi);
    const holeA = holesA[bestAi];
    if (Math.abs(holeA.diameterMm - holeB.diameterMm) > HOLE_DIAMETER_CHANGE_THRESHOLD_MM) {
      changes.push({
        id: `hole-changed-${bi}`,
        kind: "diameter-changed",
        diameterBeforeMm: Math.round(holeA.diameterMm * 100) / 100,
        diameterAfterMm: Math.round(holeB.diameterMm * 100) / 100,
        locationMm: holeB.centerMm,
      });
    }
  }

  holesA.forEach((holeA, ai) => {
    if (usedA.has(ai)) return;
    changes.push({
      id: `hole-removed-${ai}`,
      kind: "removed",
      diameterBeforeMm: Math.round(holeA.diameterMm * 100) / 100,
      diameterAfterMm: null,
      locationMm: holeA.centerMm,
    });
  });
  holesB.forEach((holeB, bi) => {
    if (usedB.has(bi)) return;
    changes.push({
      id: `hole-added-${bi}`,
      kind: "added",
      diameterBeforeMm: null,
      diameterAfterMm: Math.round(holeB.diameterMm * 100) / 100,
      locationMm: holeB.centerMm,
    });
  });

  return changes;
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
 * Voxelizes two meshes into a shared index space so they can be classified
 * as unchanged / added / removed. The client-side caller runs this (and
 * classifyVoxelDiff below) inside a Web Worker — see
 * apps/web/src/workers/diffWorker.ts — per CLAUDE.md's "3D Performance
 * Rules"; the API server calls computeVoxelDiff directly since it has no
 * render thread to protect.
 *
 * SAFETY: no PCA/ICP alignment yet (see CLAUDE.md "Alignment Strategy").
 * Mesh A and B are compared in their native coordinates, which is correct
 * for versioned exports that share a CAD origin but not for arbitrary
 * uploads.
 *
 * Everything computeVoxelDiff needs that does *not* depend on toleranceMm:
 * both meshes' voxel occupancy grids plus every stat derived purely from
 * their own geometry (bounding box, triangle/surface-area deltas, wall
 * thickness, overhang, printability). Tolerance only affects the final
 * dilate-and-classify step (see classifyVoxelDiff) — splitting the two
 * apart means a tolerance-only change (e.g. dragging a slider) can skip
 * straight to that cheap step instead of re-voxelizing and re-running BVH
 * wall-thickness raycasts against unchanged geometry.
 */
export interface VoxelDiffBase {
  resolutionMm: number;
  dims: [number, number, number];
  originMm: [number, number, number];
  occupiedA: Uint8Array;
  occupiedB: Uint8Array;
  voxelVolumeMm3: number;
  boundingBoxDeltaX: number;
  boundingBoxDeltaY: number;
  boundingBoxDeltaZ: number;
  triangleDeltaA: number;
  triangleDeltaB: number;
  triangleDelta: number;
  surfaceAreaA: number;
  surfaceAreaB: number;
  surfaceAreaDelta: number;
  minWallThickness: number;
  maxWallThickness: number;
  thinWallWarning: boolean;
  maxOverhangAngle: number;
  overhangArea: number;
  overhangAreaPercent: number;
  printabilityStatus: "pass" | "warn" | "fail";
  printabilityIssues: string[];
  holeCountA: number;
  holeCountB: number;
  holesAdded: number;
  holesRemoved: number;
  holesDiameterChanged: number;
  minHoleDiameterMm: number;
  holeChanges: HoleChange[];
  fileFormatA?: string;
  fileFormatB?: string;
}

export function computeVoxelDiffBase(
  geometryA: THREE.BufferGeometry,
  geometryB: THREE.BufferGeometry,
  options?: {
    resolutionMm?: number;
    targetVoxelsPerAxis?: number;
    fileFormatA?: string;
    fileFormatB?: string;
  },
): Result<VoxelDiffBase> {
  // Checked before any heavy allocation (voxelization, BVH construction) —
  // see MAX_TRIANGLES_PER_MESH above for why this can't just be a file-size
  // check.
  const indexA = geometryA.getIndex();
  const indexB = geometryB.getIndex();
  const triangleCountA = indexA ? indexA.count / 3 : (geometryA.getAttribute("position")?.count ?? 0) / 3;
  const triangleCountB = indexB ? indexB.count / 3 : (geometryB.getAttribute("position")?.count ?? 0) / 3;
  if (triangleCountA > MAX_TRIANGLES_PER_MESH || triangleCountB > MAX_TRIANGLES_PER_MESH) {
    return {
      success: false,
      error: `Mesh has ${Math.max(triangleCountA, triangleCountB).toLocaleString()} triangles, exceeding the ${MAX_TRIANGLES_PER_MESH.toLocaleString()} limit for diffing`,
    };
  }

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
  const voxelVolumeMm3 = resolutionMm ** 3;

  // Compute bounding box deltas
  const sizeA = new THREE.Vector3();
  const sizeB = new THREE.Vector3();
  boxA.getSize(sizeA);
  boxB.getSize(sizeB);

  const boundingBoxDeltaX = Math.round((sizeB.x - sizeA.x) * 100) / 100;
  const boundingBoxDeltaY = Math.round((sizeB.y - sizeA.y) * 100) / 100;
  const boundingBoxDeltaZ = Math.round((sizeB.z - sizeA.z) * 100) / 100;

  // Triangle count delta (counts themselves already computed above, before
  // the triangle-count guard)
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

  // Detect holes and match B's against A's
  const holesA = detectCylindricalHoles(geometryA);
  const holesB = detectCylindricalHoles(geometryB);
  const holeMatchRadiusMm = Math.max(resolutionMm * 4, 1);
  const holeChanges = matchHoles(holesA, holesB, holeMatchRadiusMm);
  const holesAdded = holeChanges.filter((c) => c.kind === "added").length;
  const holesRemoved = holeChanges.filter((c) => c.kind === "removed").length;
  const holesDiameterChanged = holeChanges.filter((c) => c.kind === "diameter-changed").length;
  const minHoleDiameterMm = holesB.length > 0 ? Math.min(...holesB.map((h) => h.diameterMm)) : 0;

  // Assess printability
  const printability = assessPrintability({
    hasWallThicknessWarning: thinWallWarning,
    maxOverhangAngle,
    overhangAreaPercent,
    holeCountB: holesB.length,
    minHoleDiameterMm,
  });

  return {
    success: true,
    data: {
      resolutionMm,
      dims,
      originMm,
      occupiedA,
      occupiedB,
      voxelVolumeMm3,
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
      holeCountA: holesA.length,
      holeCountB: holesB.length,
      holesAdded,
      holesRemoved,
      holesDiameterChanged,
      minHoleDiameterMm,
      holeChanges,
      fileFormatA: options?.fileFormatA,
      fileFormatB: options?.fileFormatB,
    },
  };
}

/**
 * The cheap, tolerance-dependent half of computeVoxelDiff: dilate each
 * mesh's occupancy grid by the tolerance and classify every cell as
 * unchanged/added/removed. Everything else needed to interpret the result
 * (bounding box/triangle/surface-area deltas, wall thickness, overhang,
 * printability) already lives in `base` and doesn't change with tolerance.
 */
export function classifyVoxelDiff(base: VoxelDiffBase, toleranceMm: number = 0): VoxelDiffResult {
  const { dims, occupiedA, occupiedB, resolutionMm, voxelVolumeMm3 } = base;
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

  const volumeAMm3 = (unchangedCount + removedCount) * voxelVolumeMm3;
  const approxVolumeDeltaMm3 = (addedCount - removedCount) * voxelVolumeMm3;
  const approxVolumeDeltaPercent = volumeAMm3 > 0 ? (approxVolumeDeltaMm3 / volumeAMm3) * 100 : 0;

  return {
    grid: { resolutionMm: base.resolutionMm, dims: base.dims, originMm: base.originMm, classification },
    stats: {
      addedCount,
      removedCount,
      unchangedCount,
      voxelVolumeMm3,
      approxVolumeDeltaMm3,
      approxVolumeDeltaPercent,
      boundingBoxDeltaX: base.boundingBoxDeltaX,
      boundingBoxDeltaY: base.boundingBoxDeltaY,
      boundingBoxDeltaZ: base.boundingBoxDeltaZ,
      triangleDeltaA: base.triangleDeltaA,
      triangleDeltaB: base.triangleDeltaB,
      triangleDelta: base.triangleDelta,
      surfaceAreaA: base.surfaceAreaA,
      surfaceAreaB: base.surfaceAreaB,
      surfaceAreaDelta: base.surfaceAreaDelta,
      minWallThickness: base.minWallThickness,
      maxWallThickness: base.maxWallThickness,
      thinWallWarning: base.thinWallWarning,
      maxOverhangAngle: base.maxOverhangAngle,
      overhangArea: base.overhangArea,
      overhangAreaPercent: base.overhangAreaPercent,
      printabilityStatus: base.printabilityStatus,
      printabilityIssues: base.printabilityIssues,
      holeCountA: base.holeCountA,
      holeCountB: base.holeCountB,
      holesAdded: base.holesAdded,
      holesRemoved: base.holesRemoved,
      holesDiameterChanged: base.holesDiameterChanged,
      minHoleDiameterMm: base.minHoleDiameterMm,
      holeChanges: base.holeChanges,
      fileFormatA: base.fileFormatA,
      fileFormatB: base.fileFormatB,
    },
  };
}

/**
 * Convenience wrapper for callers that don't need to cache the base result
 * across repeated tolerance changes (the API server, tests, seed scripts).
 * The client-side worker path calls computeVoxelDiffBase/classifyVoxelDiff
 * directly instead so it can cache the base across a tolerance-only change.
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
  const baseResult = computeVoxelDiffBase(geometryA, geometryB, options);
  if (!baseResult.success) return baseResult;
  return { success: true, data: classifyVoxelDiff(baseResult.data, options?.toleranceMm ?? 0) };
}
