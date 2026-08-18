import type * as THREE from "three";
import type { Result } from "@meshdiff/shared/types/diff";
import type { SurfaceDeviationResult } from "../engine/surfaceDeviation";
import type {
  SurfaceDeviationWorkerRequest,
  SurfaceDeviationWorkerResponse,
} from "../workers/surfaceDeviationWorker";
import { createWorkerClient } from "./createWorkerClient";
import { toIndexArray } from "./geometryTransfer";

// One worker for the whole app's lifetime — same rationale as
// voxelDiffWorkerClient.ts (avoid re-parsing the module graph, incl.
// three.js, on every call).
const client = createWorkerClient<SurfaceDeviationWorkerRequest, SurfaceDeviationWorkerResponse>(
  () => new Worker(new URL("../workers/surfaceDeviationWorker.ts", import.meta.url), { type: "module" }),
);

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

  const id = client.nextId();
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

  return client.send(request, transfer);
}
