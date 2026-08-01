import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { Result } from "@meshdiff/shared/types/diff";

const stlLoader = new STLLoader();
const objLoader = new OBJLoader();

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/**
 * Parses an uploaded STL or OBJ file into a single BufferGeometry.
 * SAFETY: 3MF is in scope per the product spec but not yet implemented —
 * it requires unzipping structured XML, unlike STL/OBJ's flat parse.
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

    if (extension === "3mf") {
      return {
        success: false,
        error: "3MF support is not yet implemented — upload STL or OBJ for now",
      };
    }

    return { success: false, error: `Unsupported file type: .${extension}` };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse mesh file",
    };
  }
}
