import * as THREE from "three";
import { computeVoxelDiff, type VoxelDiffResult } from "@meshdiff/shared/engine/diffVoxels";
import type { Result } from "@meshdiff/shared/types/diff";

export interface DiffWorkerRequest {
  id: number;
  positionsA: Float32Array;
  indexA: Uint32Array | Uint16Array | null;
  positionsB: Float32Array;
  indexB: Uint32Array | Uint16Array | null;
  options?: {
    resolutionMm?: number;
    targetVoxelsPerAxis?: number;
    toleranceMm?: number;
    fileFormatA?: string;
    fileFormatB?: string;
  };
}

export interface DiffWorkerResponse {
  id: number;
  result: Result<VoxelDiffResult>;
}

// Cast rather than pull in the "webworker" lib: it declares its own `self`
// global that conflicts with lib.dom's (this file lives in a project whose
// tsconfig targets DOM, shared with the rest of the app). MessageEvent is
// already available via DOM.
const ctx = self as unknown as {
  postMessage(message: DiffWorkerResponse): void;
  onmessage: ((event: MessageEvent<DiffWorkerRequest>) => void) | null;
};

function buildGeometry(positions: Float32Array, index: Uint32Array | Uint16Array | null): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (index) {
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
  }
  return geometry;
}

ctx.onmessage = (event: MessageEvent<DiffWorkerRequest>) => {
  const { id, positionsA, indexA, positionsB, indexB, options } = event.data;
  const geometryA = buildGeometry(positionsA, indexA);
  const geometryB = buildGeometry(positionsB, indexB);
  const result = computeVoxelDiff(geometryA, geometryB, options);
  ctx.postMessage({ id, result });
};
