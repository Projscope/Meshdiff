import type * as THREE from "three";
import type { Result } from "@meshdiff/shared/types/diff";
import { loadMeshGeometryOffThread } from "../lib/meshParseWorkerClient";

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/**
 * Parses an uploaded STL, OBJ, or 3MF file into a single BufferGeometry.
 * OBJ and 3MF can both contain multiple mesh objects/groups (each becomes
 * a separate `THREE.Mesh` under the parsed group), so those are baked into
 * world space and merged into one geometry rather than only keeping the
 * first (matching CLAUDE.md's "multiple meshes per file" note on 3MF —
 * multi-group OBJ files need the same treatment). Only positions/normals
 * survive the merge — per-mesh attributes like color/uv aren't guaranteed
 * consistent across objects.
 *
 * ThreeMFLoader doesn't support the 3MF Production Extension (objects
 * split across separate `3D/Objects/*.model` files, referenced via a
 * component's `p:path` attribute — used by BambuStudio, PrusaSlicer,
 * OrcaSlicer for multi-plate/multi-instance files) and throws "Cannot
 * read properties of undefined (reading 'mesh')" on those; the actual
 * fallback parser lives in apps/shared/src/engine/parseProductionThreeMF.ts.
 *
 * The parsing itself (loaders, merge, Production Extension fallback) runs
 * in a Web Worker — see apps/web/src/workers/meshParseWorker.ts — per
 * CLAUDE.md's "3D Performance Rules". This function just hands the file
 * across and reconstructs a BufferGeometry from the result.
 */
export function loadMeshGeometry(file: File): Promise<Result<THREE.BufferGeometry>> {
  return loadMeshGeometryOffThread(file);
}
