import * as THREE from "three";
import type { Result } from "@meshdiff/shared/types/diff";
import type { SurfaceDeviationResult } from "../engine/surfaceDeviation";
import type {
  SurfaceDeviationWorkerRequest,
  SurfaceDeviationWorkerResponse,
} from "../workers/surfaceDeviationWorker";

// One worker for the whole app's lifetime — same rationale as
// voxelDiffWorkerClient.ts (avoid re-parsing the module graph, incl.
// three.js, on every call).
let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<number, (response: Result<SurfaceDeviationResult>) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/surfaceDeviationWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<SurfaceDeviationWorkerResponse>) => {
      const resolve = pending.get(event.data.id);
      if (!resolve) return; // stale/unknown request (shouldn't happen) — drop it
      pending.delete(event.data.id);
      resolve(event.data.result);
    };
  }
  return worker;
}

function toIndexArray(geometry: THREE.BufferGeometry): Uint32Array | Uint16Array | null {
  const index = geometry.getIndex();
  if (!index) return null;
  const array = index.array;
  // .slice() copies rather than transfers — sourceGeometry/referenceGeometry
  // are also used for on-screen rendering elsewhere, so their buffers must
  // stay intact rather than being detached by a structured-clone transfer.
  return array instanceof Uint16Array ? array.slice() : Uint32Array.from(array);
}

/**
 * Off-main-thread version of computeSurfaceDeviation (see CLAUDE.md "3D
 * Performance Rules": heavy computation, including SDF sampling, belongs in
 * a Web Worker) — the BVH nearest-point query this runs per vertex was
 * previously blocking the main thread inside SurfaceHeatmap's render.
 */
export function computeSurfaceDeviationOffThread(
  sourceGeometry: THREE.BufferGeometry,
  referenceGeometry: THREE.BufferGeometry,
  options?: { clampMm?: number; toleranceMm?: number },
): Promise<Result<SurfaceDeviationResult>> {
  const sourcePositions = sourceGeometry.attributes.position;
  const referencePositions = referenceGeometry.attributes.position;
  if (!sourcePositions || !referencePositions) {
    return Promise.resolve({ success: false, error: "geometry has no position attribute" });
  }

  const id = nextRequestId++;
  const sourcePositionArray = (sourcePositions.array as Float32Array).slice();
  const referencePositionArray = (referencePositions.array as Float32Array).slice();
  const sourceIndex = toIndexArray(sourceGeometry);
  const referenceIndex = toIndexArray(referenceGeometry);

  const request: SurfaceDeviationWorkerRequest = {
    id,
    sourcePositions: sourcePositionArray,
    sourceIndex,
    referencePositions: referencePositionArray,
    referenceIndex,
    options,
  };
  const transfer: Transferable[] = [
    sourcePositionArray.buffer,
    referencePositionArray.buffer,
    ...(sourceIndex ? [sourceIndex.buffer] : []),
    ...(referenceIndex ? [referenceIndex.buffer] : []),
  ];

  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage(request, transfer);
  });
}
