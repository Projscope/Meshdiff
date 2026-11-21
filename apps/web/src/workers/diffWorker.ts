import * as THREE from "three";
import {
  computeVoxelDiffBase,
  classifyVoxelDiff,
  type VoxelDiffBase,
  type VoxelDiffResult,
} from "@meshdiff/shared/engine/diffVoxels";
import type { Result } from "@meshdiff/shared/types/diff";

export interface DiffWorkerBaseOptions {
  resolutionMm?: number;
  targetVoxelsPerAxis?: number;
  fileFormatA?: string;
  fileFormatB?: string;
  maxTriangles?: number;
}

// A "full" request re-voxelizes both meshes and re-derives every
// geometry-only stat (wall thickness, overhang, ...) — expensive, needed
// whenever the meshes themselves (or resolution/format options) change. A
// "tolerance" request reuses the last full request's base result and only
// re-runs the cheap dilate-and-classify step — the client sends this kind
// when just the tolerance slider moved. See voxelDiffWorkerClient.ts for
// which kind gets picked.
export type DiffWorkerRequest =
  | {
      id: number;
      kind: "full";
      positionsA: Float32Array;
      indexA: Uint32Array | Uint16Array | null;
      positionsB: Float32Array;
      indexB: Uint32Array | Uint16Array | null;
      options?: DiffWorkerBaseOptions;
      toleranceMm: number;
    }
  | {
      id: number;
      kind: "tolerance";
      toleranceMm: number;
    };

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

// Lives for the worker's lifetime — one geometry pair at a time, matching
// the single shared worker instance in voxelDiffWorkerClient.ts.
let cachedBase: VoxelDiffBase | null = null;

ctx.onmessage = (event: MessageEvent<DiffWorkerRequest>) => {
  const request = event.data;

  if (request.kind === "tolerance") {
    if (!cachedBase) {
      ctx.postMessage({
        id: request.id,
        result: { success: false, error: "worker has no cached base result for a tolerance-only request" },
      });
      return;
    }
    ctx.postMessage({ id: request.id, result: { success: true, data: classifyVoxelDiff(cachedBase, request.toleranceMm) } });
    return;
  }

  const geometryA = buildGeometry(request.positionsA, request.indexA);
  const geometryB = buildGeometry(request.positionsB, request.indexB);
  const baseResult = computeVoxelDiffBase(geometryA, geometryB, request.options);
  if (!baseResult.success) {
    cachedBase = null;
    ctx.postMessage({ id: request.id, result: baseResult });
    return;
  }
  cachedBase = baseResult.data;
  ctx.postMessage({ id: request.id, result: { success: true, data: classifyVoxelDiff(cachedBase, request.toleranceMm) } });
};
