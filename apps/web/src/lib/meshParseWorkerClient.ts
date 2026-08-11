import * as THREE from "three";
import type { Result } from "@meshdiff/shared/types/diff";
import type { MeshParseWorkerRequest, MeshParseWorkerResponse, ParsedMeshGeometry } from "../workers/meshParseWorker";

// One worker for the whole app's lifetime — same rationale as
// voxelDiffWorkerClient.ts (avoid re-parsing the module graph, incl.
// three.js and linkedom, on every file drop).
let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<number, (response: Result<ParsedMeshGeometry>) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/meshParseWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<MeshParseWorkerResponse>) => {
      const resolve = pending.get(event.data.id);
      if (!resolve) return; // stale/unknown request (shouldn't happen) — drop it
      pending.delete(event.data.id);
      resolve(event.data.result);
    };
  }
  return worker;
}

function toGeometry(data: ParsedMeshGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  if (data.normals) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  }
  if (data.index) {
    geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  }
  return geometry;
}

/**
 * Off-main-thread STL/OBJ/3MF parsing (see CLAUDE.md "3D Performance
 * Rules"). File objects structured-clone across the worker boundary for
 * free — no manual serialization needed for the input. The worker parses,
 * merges multi-object files, and computes normals exactly as the old
 * inline implementation did; only the transfer of the resulting typed
 * arrays back is new.
 */
export function loadMeshGeometryOffThread(file: File): Promise<Result<THREE.BufferGeometry>> {
  const id = nextRequestId++;
  const request: MeshParseWorkerRequest = { id, file };

  return new Promise((resolve) => {
    pending.set(id, (result) => {
      resolve(result.success ? { success: true, data: toGeometry(result.data) } : result);
    });
    getWorker().postMessage(request);
  });
}
