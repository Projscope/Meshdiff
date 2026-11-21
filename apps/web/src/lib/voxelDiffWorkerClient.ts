import * as THREE from "three";
import type { VoxelDiffResult } from "@meshdiff/shared/engine/diffVoxels";
import type { Result } from "@meshdiff/shared/types/diff";
import type { DiffWorkerBaseOptions, DiffWorkerRequest, DiffWorkerResponse } from "../workers/diffWorker";
import { createWorkerClient } from "./createWorkerClient";
import { toIndexArray } from "./geometryTransfer";

// One worker for the whole app's lifetime — spinning up a fresh worker (and
// re-parsing its module graph, incl. three.js) per diff would cost more than
// the computation it's offloading.
const client = createWorkerClient<DiffWorkerRequest, DiffWorkerResponse>(
  () => new Worker(new URL("../workers/diffWorker.ts", import.meta.url), { type: "module" }),
  // A new worker has nothing voxelized, so the "only the tolerance changed" shortcut below must not be taken.
  { onReset: () => resetCachedBase() },
);

// Mirrors the worker's cachedBase: which geometry pair (+ base options) the
// worker currently has voxelized, so this client can tell a genuine
// re-voxelize apart from "only the tolerance slider moved" and send the
// cheap "tolerance" request kind for the latter. Reset whenever a "full"
// request fails, so the two never drift out of sync with what the worker
// actually has cached.
let cachedGeometryA: THREE.BufferGeometry | null = null;
let cachedGeometryB: THREE.BufferGeometry | null = null;
let cachedBaseOptionsKey: string | null = null;

function resetCachedBase(): void {
  cachedGeometryA = null;
  cachedGeometryB = null;
  cachedBaseOptionsKey = null;
}

/** Stops a diff that is running (e.g. the user cancelled, or it is taking too long). */
export function cancelVoxelDiff(message?: string): void {
  client.cancel(message);
}

/**
 * Off-main-thread version of computeVoxelDiff (see CLAUDE.md "3D Performance
 * Rules": heavy computation belongs in a Web Worker). Same inputs/output as
 * the direct call — just async, since it now round-trips through a worker.
 *
 * Re-voxelizing and re-running BVH wall-thickness/overhang analysis is the
 * expensive part; none of it depends on toleranceMm (see diffVoxels.ts's
 * computeVoxelDiffBase/classifyVoxelDiff split). When only toleranceMm
 * changed since the last call for this same geometry pair, this skips
 * straight to the cheap classify-only step instead of re-sending geometry
 * and redoing all of that.
 */
export function computeVoxelDiffOffThread(
  geometryA: THREE.BufferGeometry,
  geometryB: THREE.BufferGeometry,
  options?: DiffWorkerBaseOptions & { toleranceMm?: number },
): Promise<Result<VoxelDiffResult>> {
  const positionA = geometryA.getAttribute("position");
  const positionB = geometryB.getAttribute("position");
  if (!positionA || !positionB) {
    return Promise.resolve({ success: false, error: "geometry is missing a position attribute" });
  }

  const { toleranceMm = 0, ...baseOptions } = options ?? {};
  const baseOptionsKey = JSON.stringify(baseOptions);
  const id = client.nextId();

  const canReuseCachedBase =
    geometryA === cachedGeometryA && geometryB === cachedGeometryB && baseOptionsKey === cachedBaseOptionsKey;

  if (canReuseCachedBase) {
    return client.send({ id, kind: "tolerance", toleranceMm }, []);
  }

  cachedGeometryA = geometryA;
  cachedGeometryB = geometryB;
  cachedBaseOptionsKey = baseOptionsKey;

  const positionsA = (positionA.array as Float32Array).slice();
  const positionsB = (positionB.array as Float32Array).slice();
  const indexA = toIndexArray(geometryA);
  const indexB = toIndexArray(geometryB);

  return client.send(
    { id, kind: "full", positionsA, indexA, positionsB, indexB, options: baseOptions, toleranceMm },
    [positionsA.buffer, positionsB.buffer, ...(indexA ? [indexA.buffer] : []), ...(indexB ? [indexB.buffer] : [])],
  ).then((result) => {
    // A failed "full" request means the worker has no valid cached base
    // (see diffWorker.ts) — clear our mirror so the next call re-sends
    // geometry instead of wrongly assuming a "tolerance" request would work.
    if (!result.success) {
      cachedGeometryA = null;
      cachedGeometryB = null;
      cachedBaseOptionsKey = null;
    }
    return result;
  });
}
