import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DOMParser } from "linkedom";
import { parseProductionThreeMF } from "@meshdiff/shared/engine/parseProductionThreeMF";
import type { Result } from "@meshdiff/shared/types/diff";

const stlLoader = new STLLoader();
const objLoader = new OBJLoader();
const threeMFLoader = new ThreeMFLoader();

// ThreeMFLoader calls `new DOMParser().parseFromString(...)` internally,
// which doesn't exist in plain Node. linkedom implements enough of the DOM
// (querySelector/querySelectorAll/getAttribute/textContent) for the loader's
// XML parsing to work — verified against a real 3MF fixture before wiring
// this in (see task notes). Installed once at module load, not per-call.
(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser;

/**
 * Server-side counterpart to apps/web/src/engine/loadMesh.ts. STL/OBJ parse
 * from buffers/text with no DOM dependency, same as the client. 3MF mirrors
 * the client's merge-all-objects logic exactly (see loadMesh.ts's comment
 * for why: multiple mesh objects per file, world-space baking).
 *
 * three.js's stock ThreeMFLoader doesn't support the 3MF Production
 * Extension (objects split across separate `3D/Objects/*.model` files,
 * referenced via a component's `p:path` attribute — used by BambuStudio,
 * PrusaSlicer, OrcaSlicer for multi-plate/multi-instance files) and throws
 * "Cannot read properties of undefined (reading 'mesh')" on those. When
 * that happens, parseProductionThreeMF re-parses the same buffer by
 * actually following p:path across model parts. Same pattern in
 * apps/web/src/engine/loadMesh.ts.
 */
export async function loadMeshGeometryServer(
  buffer: ArrayBuffer,
  fileFormat: "stl" | "obj" | "3mf",
): Promise<Result<THREE.BufferGeometry>> {
  try {
    if (fileFormat === "stl") {
      const geometry = stlLoader.parse(buffer);
      geometry.computeVertexNormals();
      return { success: true, data: geometry };
    }

    if (fileFormat === "obj") {
      const text = new TextDecoder().decode(buffer);
      const group = objLoader.parse(text);
      group.updateWorldMatrix(true, true);

      const geometries: THREE.BufferGeometry[] = [];
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          let geometry = child.geometry.clone();
          geometry.applyMatrix4(child.matrixWorld);
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

    // 3mf
    let group: THREE.Group;
    try {
      group = threeMFLoader.parse(buffer);
    } catch {
      // Stock ThreeMFLoader doesn't support the Production Extension (see
      // parseProductionThreeMF's doc comment) — retry with the p:path-aware
      // parser before giving up.
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

    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!merged) {
      return { success: false, error: "Failed to merge 3MF mesh data" };
    }
    merged.computeVertexNormals();
    return { success: true, data: merged };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse mesh file",
    };
  }
}
