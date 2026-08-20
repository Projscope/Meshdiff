import * as THREE from "three";
import { computeSurfaceDeviation, type SurfaceDeviationResult } from "../engine/surfaceDeviation";
import type { Result } from "@meshdiff/shared/types/diff";

export interface SurfaceDeviationWorkerRequest {
  id: number;
  sourcePositions: Float32Array;
  sourceIndex: Uint32Array | Uint16Array | null;
  referencePositions: Float32Array;
  referenceIndex: Uint32Array | Uint16Array | null;
  options?: { clampMm?: number; toleranceMm?: number; addedColorHex?: string; removedColorHex?: string };
}

export interface SurfaceDeviationWorkerResponse {
  id: number;
  result: Result<SurfaceDeviationResult>;
}

// Same self-cast rationale as diffWorker.ts — avoids pulling in the
// "webworker" lib, whose own `self` global conflicts with lib.dom's.
const ctx = self as unknown as {
  postMessage(message: SurfaceDeviationWorkerResponse, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<SurfaceDeviationWorkerRequest>) => void) | null;
};

function buildGeometry(positions: Float32Array, index: Uint32Array | Uint16Array | null): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (index) {
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
  }
  return geometry;
}

ctx.onmessage = (event: MessageEvent<SurfaceDeviationWorkerRequest>) => {
  const { id, sourcePositions, sourceIndex, referencePositions, referenceIndex, options } = event.data;
  const sourceGeometry = buildGeometry(sourcePositions, sourceIndex);
  const referenceGeometry = buildGeometry(referencePositions, referenceIndex);

  const result = computeSurfaceDeviation(sourceGeometry, referenceGeometry, options);
  if (!result.success) {
    ctx.postMessage({ id, result }, []);
    return;
  }

  // Freshly allocated in this worker call — nothing else references these
  // buffers, so transfer (not copy) them back across the boundary.
  ctx.postMessage(
    { id, result: { success: true, data: result.data } },
    [result.data.colors.buffer, result.data.signedDistancesMm.buffer],
  );
};
