import * as THREE from "three";
import type { VoxelDiffResult } from "@meshdiff/shared/engine/diffVoxels";
import type { Result } from "@meshdiff/shared/types/diff";
import type { DiffWorkerRequest, DiffWorkerResponse } from "../workers/diffWorker";

// One worker for the whole app's lifetime — spinning up a fresh worker (and
// re-parsing its module graph, incl. three.js) per diff would cost more than
// the computation it's offloading.
let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<number, (response: Result<VoxelDiffResult>) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/diffWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<DiffWorkerResponse>) => {
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
  // .slice() copies rather than transfers — geometryA/geometryB are also
  // used for on-screen rendering elsewhere, so their buffers must stay
  // intact rather than being detached by a structured-clone transfer.
  return array instanceof Uint16Array ? array.slice() : Uint32Array.from(array);
}

/**
 * Off-main-thread version of computeVoxelDiff (see CLAUDE.md "3D Performance
 * Rules": heavy computation belongs in a Web Worker). Same inputs/output as
 * the direct call — just async, since it now round-trips through a worker.
 */
export function computeVoxelDiffOffThread(
  geometryA: THREE.BufferGeometry,
  geometryB: THREE.BufferGeometry,
  options?: DiffWorkerRequest["options"],
): Promise<Result<VoxelDiffResult>> {
  const positionA = geometryA.getAttribute("position");
  const positionB = geometryB.getAttribute("position");
  if (!positionA || !positionB) {
    return Promise.resolve({ success: false, error: "geometry is missing a position attribute" });
  }

  const id = nextRequestId++;
  const request: DiffWorkerRequest = {
    id,
    positionsA: (positionA.array as Float32Array).slice(),
    indexA: toIndexArray(geometryA),
    positionsB: (positionB.array as Float32Array).slice(),
    indexB: toIndexArray(geometryB),
    options,
  };

  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage(request, [
      request.positionsA.buffer,
      request.positionsB.buffer,
      ...(request.indexA ? [request.indexA.buffer] : []),
      ...(request.indexB ? [request.indexB.buffer] : []),
    ]);
  });
}
