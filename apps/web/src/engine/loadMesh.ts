import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { parseProductionThreeMF } from "@meshdiff/shared/engine/parseProductionThreeMF";
import type { Result } from "@meshdiff/shared/types/diff";

const stlLoader = new STLLoader();
const objLoader = new OBJLoader();
const threeMFLoader = new ThreeMFLoader();

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
 * multi-group OBJ files need the same treatment). Only positions survive
 * the merge — per-mesh attributes like color/uv aren't guaranteed
 * consistent across objects, and normals are recomputed on the merged
 * result anyway.
 *
 * ThreeMFLoader doesn't support the 3MF Production Extension (objects
 * split across separate `3D/Objects/*.model` files, referenced via a
 * component's `p:path` attribute — used by BambuStudio, PrusaSlicer,
 * OrcaSlicer for multi-plate/multi-instance files) and throws "Cannot
 * read properties of undefined (reading 'mesh')" on those. When that
 * happens, parseProductionThreeMF re-parses the same bytes by actually
 * following p:path across model parts. Same pattern in
 * apps/api/src/lib/loadMeshServer.ts (identical loader).
 */
export async function loadMeshGeometry(
  file: File,
): Promise<Result<THREE.BufferGeometry>> {
  const extension = extensionOf(file.name);

  try {
    if (extension === "stl") {
      const buffer = await file.arrayBuffer();
      const geometry = stlLoader.parse(buffer);
      geometry.computeVertexNormals();
      return { success: true, data: geometry };
    }

    if (extension === "obj") {
      const text = await file.text();
      const group = objLoader.parse(text);
      group.updateWorldMatrix(true, true);

      const geometries: THREE.BufferGeometry[] = [];
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          let geometry = child.geometry.clone();
          geometry.applyMatrix4(child.matrixWorld);
          // Groups can differ in which attributes they carry (normals/uvs
          // present on some, not others) — mergeGeometries requires
          // matching attribute sets across inputs, so keep only position
          // and let computeVertexNormals rebuild normals on the merged result.
          if (geometry.index) geometry = geometry.toNonIndexed();
          for (const name of Object.keys(geometry.attributes)) {
            if (name !== "position") geometry.deleteAttribute(name);
          }
          geometries.push(geometry);
        }
      });

      if (geometries.length === 0) {
        return { success: false, error: "OBJ file contains no mesh data" };
      }

      const merged =
        geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
      if (!merged) {
        return { success: false, error: "Failed to merge OBJ mesh data" };
      }
      merged.computeVertexNormals();
      return { success: true, data: merged };
    }

    if (extension === "3mf") {
      const buffer = await file.arrayBuffer();

      let group: THREE.Group;
      try {
        group = threeMFLoader.parse(buffer);
      } catch {
        // Stock ThreeMFLoader doesn't understand the Production Extension
        // (see the function-level comment above) — retry with the
        // p:path-aware parser before giving up.
        const fallback = parseProductionThreeMF(buffer);
        if (!fallback.success) return fallback;
        fallback.data.computeVertexNormals();
        return { success: true, data: fallback.data };
      }
      group.updateWorldMatrix(true, true);

      const geometries: THREE.BufferGeometry[] = [];
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          let geometry = child.geometry.clone();
          geometry.applyMatrix4(child.matrixWorld);
          // mergeGeometries requires every input to be indexed or every
          // input to be non-indexed — toNonIndexed() expands the index
          // into a flat triangle list rather than just discarding it, so
          // this normalizes without corrupting vertex connectivity.
          if (geometry.index) geometry = geometry.toNonIndexed();
          for (const name of Object.keys(geometry.attributes)) {
            if (name !== "position") geometry.deleteAttribute(name);
          }
          geometries.push(geometry);
        }
      });

      if (geometries.length === 0) {
        return { success: false, error: "3MF file contains no mesh data" };
      }

      const merged =
        geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
      if (!merged) {
        return { success: false, error: "Failed to merge 3MF mesh data" };
      }
      merged.computeVertexNormals();
      return { success: true, data: merged };
    }

    return { success: false, error: `Unsupported file type: .${extension}` };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse mesh file",
    };
  }
}
