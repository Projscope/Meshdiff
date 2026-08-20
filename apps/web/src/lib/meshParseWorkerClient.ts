import * as THREE from "three";
import type { Result } from "@meshdiff/shared/types/diff";
import type { MeshParseWorkerRequest, MeshParseWorkerResponse, ParsedMeshGeometry } from "../workers/meshParseWorker";
import { createWorkerClient } from "./createWorkerClient";

// One worker for the whole app's lifetime — avoids re-parsing the module
// graph (incl. three.js and linkedom) on every file drop.
const client = createWorkerClient<MeshParseWorkerRequest, MeshParseWorkerResponse>(
  () => new Worker(new URL("../workers/meshParseWorker.ts", import.meta.url), { type: "module" }),
);

function toGeometry(data: ParsedMeshGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  if (data.normals) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  }
  if (data.index) {
    geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  }
  // Rides along on the standard userData bag rather than changing this
  // function's return type — see loadMesh.ts's callers, most of which have
  // no reason to care whether the mesh needed cleanup on load.
  geometry.userData.meshRepair = data.repair;
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
  const id = client.nextId();
  return client.send({ id, file }).then((result) =>
    result.success ? { success: true, data: toGeometry(result.data) } : result,
  );
}
