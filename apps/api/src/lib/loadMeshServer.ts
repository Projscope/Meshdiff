import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { Result } from "@meshdiff/shared/types/diff.js";

const stlLoader = new STLLoader();
const objLoader = new OBJLoader();

/**
 * Server-side counterpart to apps/web/src/engine/loadMesh.ts. STL/OBJ parse
 * from buffers/text with no DOM dependency, same as the client. 3MF is
 * intentionally unsupported here — ThreeMFLoader calls DOMParser internally,
 * which needs a Node polyfill (linkedom) not yet wired in; see the
 * "3MF server-side support" follow-up task.
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
      const geometries: THREE.BufferGeometry[] = [];
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          geometries.push(child.geometry);
        }
      });
      if (geometries.length === 0) {
        return { success: false, error: "OBJ file contains no mesh data" };
      }
      geometries[0].computeVertexNormals();
      return { success: true, data: geometries[0] };
    }

    return {
      success: false,
      error: "3MF diffing is not yet supported server-side",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse mesh file",
    };
  }
}
