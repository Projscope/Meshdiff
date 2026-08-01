import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { Result } from "@meshdiff/shared/types/diff";
import { isPointInsideMesh } from "./voxelize";

export interface SurfaceDeviationResult {
  /** Per-vertex RGB, aligned 1:1 with sourceGeometry's position attribute. */
  colors: Float32Array;
  /** Per-vertex signed distance in mm, same alignment as colors. */
  signedDistancesMm: Float32Array;
  maxAbsDeviationMm: number;
}

export const UNCHANGED_COLOR = new THREE.Color("#8b90a0");
const ADDED_COLOR = new THREE.Color("#22c55e");
const REMOVED_COLOR = new THREE.Color("#ef4444");

/**
 * For every vertex of sourceGeometry, finds the signed distance to
 * referenceGeometry's surface: positive (green) means the vertex sits
 * outside the reference volume (material added / surface pushed out),
 * negative (red) means it's inside (material removed / surface pulled in).
 * Distance magnitude comes from three-mesh-bvh's accelerated nearest-point
 * query; sign comes from the same parity inside-test used by the voxelizer.
 *
 * SAFETY: like the voxel diff, this assumes both meshes already share a
 * coordinate frame (no PCA/ICP alignment yet — see CLAUDE.md).
 */
export function computeSurfaceDeviation(
  sourceGeometry: THREE.BufferGeometry,
  referenceGeometry: THREE.BufferGeometry,
  options?: {
    /** Caps the color scale's max deviation; defaults to this mesh's own max. */
    clampMm?: number;
    /** Deviations within this distance render as unchanged (gray), not colored. */
    toleranceMm?: number;
  },
): Result<SurfaceDeviationResult> {
  const sourcePositions = sourceGeometry.attributes.position;
  const referencePositions = referenceGeometry.attributes.position;
  if (!sourcePositions || !referencePositions) {
    return { success: false, error: "geometry has no position attribute" };
  }

  const referenceBvh = new MeshBVH(referenceGeometry);
  const vertexCount = sourcePositions.count;
  const signedDistancesMm = new Float32Array(vertexCount);

  const point = new THREE.Vector3();
  const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };
  let maxAbsDeviationMm = 0;

  for (let i = 0; i < vertexCount; i++) {
    point.fromBufferAttribute(sourcePositions, i);
    const result = referenceBvh.closestPointToPoint(point, hit);
    const distance = result?.distance ?? 0;
    const sign = isPointInsideMesh(referenceBvh, point) ? -1 : 1;
    const signedDistance = sign * distance;
    signedDistancesMm[i] = signedDistance;
    maxAbsDeviationMm = Math.max(maxAbsDeviationMm, Math.abs(signedDistance));
  }

  const clamp = options?.clampMm ?? maxAbsDeviationMm;
  const normalizer = clamp > 0 ? clamp : 1;
  const toleranceMm = options?.toleranceMm ?? 0;
  const colors = new Float32Array(vertexCount * 3);
  const color = new THREE.Color();

  for (let i = 0; i < vertexCount; i++) {
    const distance = signedDistancesMm[i];
    if (Math.abs(distance) <= toleranceMm) {
      colors[i * 3] = UNCHANGED_COLOR.r;
      colors[i * 3 + 1] = UNCHANGED_COLOR.g;
      colors[i * 3 + 2] = UNCHANGED_COLOR.b;
      continue;
    }
    const t = THREE.MathUtils.clamp(distance / normalizer, -1, 1);
    if (t >= 0) {
      color.copy(UNCHANGED_COLOR).lerp(ADDED_COLOR, t);
    } else {
      color.copy(UNCHANGED_COLOR).lerp(REMOVED_COLOR, -t);
    }
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  return {
    success: true,
    data: { colors, signedDistancesMm, maxAbsDeviationMm },
  };
}
