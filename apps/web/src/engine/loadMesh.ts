import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Result } from "@meshdiff/shared/types/diff";

const stlLoader = new STLLoader();
const objLoader = new OBJLoader();
const threeMFLoader = new ThreeMFLoader();

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/**
 * Parses an uploaded STL, OBJ, or 3MF file into a single BufferGeometry.
 * 3MF can contain multiple mesh objects positioned by their own transform,
 * so those are baked into world space and merged into one geometry rather
 * than only keeping the first (matching CLAUDE.md's "multiple meshes per
 * file" note on the format). Only positions survive the merge — per-mesh
 * attributes like color/uv aren't guaranteed consistent across objects,
 * and normals are recomputed on the merged result anyway.
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
      const buffer = await file.arrayBuffer();
      const group = threeMFLoader.parse(buffer);
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
