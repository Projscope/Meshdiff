import * as THREE from "three";
import * as fflate from "fflate";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DOMParser as LinkedomDOMParser } from "linkedom/worker";
import { FastXmlDOMParser } from "@meshdiff/shared/engine/fastXmlDomParser";
import { parseProductionThreeMF as parseProductionThreeMFImpl } from "@meshdiff/shared/engine/parseProductionThreeMF";
import { repairMeshGeometry, type MeshRepairReport } from "@meshdiff/shared/engine/repairMesh";
import type { Result } from "@meshdiff/shared/types/diff";

// ThreeMFLoader calls `new DOMParser().parseFromString(...)` internally.
// Dedicated workers don't expose a native DOMParser (verified directly in
// this app's target browser — it's `undefined` in a worker's global scope,
// unlike a window). linkedom's dedicated `/worker` build has no Node
// dependencies (unlike its default export), so it's safe to bundle here —
// same fix as apps/api/src/lib/loadMeshServer.ts, different entry point.
// This is the DEFAULT installed globally — the stock loader uses more of
// the DOM surface (.textContent, .nodeName) than parseProductionThreeMF.ts
// needs, so it stays on the full (if slower) linkedom implementation.
(self as unknown as { DOMParser?: unknown }).DOMParser = LinkedomDOMParser;

// parseProductionThreeMF.ts only ever needs getAttribute/attributes/
// querySelector(All) with plain tag-name selectors (verified against every
// call site — see fastXmlDomParser.ts's doc comment). Its own DOMParser is
// declared as an ambient global, so this swaps the global to the much
// faster FastXmlDOMParser only around this specific call, then restores
// whatever the stock loader needs — real fix for a real regression: a
// user's actual 7.8MB multi-plate 3MF measured at ~11s to parse through
// linkedom's full DOM tree, almost entirely in this one call.
function parseProductionThreeMF(buffer: ArrayBuffer, maxTriangles?: number) {
  const ctx = self as unknown as { DOMParser?: unknown };
  const previous = ctx.DOMParser;
  ctx.DOMParser = FastXmlDOMParser;
  try {
    return parseProductionThreeMFImpl(buffer, { maxTriangles });
  } finally {
    ctx.DOMParser = previous;
  }
}

const stlLoader = new STLLoader();
const objLoader = new OBJLoader();
const threeMFLoader = new ThreeMFLoader();

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

// Stock ThreeMFLoader always throws on a Production Extension file (see the
// function-level comment below) — but only *after* fully parsing its XML
// with the linkedom polyfill above, which is dramatically slower than a
// browser's native DOMParser (the whole reason this got noticed: a 7.8MB
// multi-plate file took 10+ seconds just to fail). A Production Extension
// export (BambuStudio/PrusaSlicer/OrcaSlicer) always splits objects across
// more than one `3D/Objects/*.model` file — checking the zip's entry names
// costs nothing (fflate's `filter` skips decompression entirely for
// rejected entries), so this detects the doomed case up front and skips
// straight to parseProductionThreeMF instead of wasting a full slow parse
// first.
function looksLikeProductionExtension(buffer: ArrayBuffer): boolean {
  try {
    const entries = fflate.unzipSync(new Uint8Array(buffer), { filter: () => false });
    const modelPartCount = Object.keys(entries).filter((name) => /^3D\/.*\.model$/i.test(name)).length;
    return modelPartCount > 1;
  } catch {
    return false; // not a valid zip, or unreadable — let the normal parse path surface the real error
  }
}

// Mirrors apps/web/src/engine/loadMesh.ts's loadMeshGeometry exactly — see
// that file for the full rationale (multi-object OBJ/3MF merging, the
// Production Extension fallback). Duplicated rather than shared because it
// needs the worker-safe DOMParser installed above before ThreeMFLoader
// (used by both) ever runs, and because a worker can't import a module that
// itself isn't worker-safe (loadMesh.ts has no such constraint to satisfy).
async function parseMeshGeometry(file: File, maxTriangles?: number): Promise<Result<THREE.BufferGeometry>> {
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

      const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
      if (!merged) {
        return { success: false, error: "Failed to merge OBJ mesh data" };
      }
      merged.computeVertexNormals();
      return { success: true, data: merged };
    }

    if (extension === "3mf") {
      const buffer = await file.arrayBuffer();

      if (looksLikeProductionExtension(buffer)) {
        const fallback = parseProductionThreeMF(buffer, maxTriangles);
        if (!fallback.success) return fallback;
        fallback.data.computeVertexNormals();
        return { success: true, data: fallback.data };
      }

      let group: THREE.Group;
      try {
        group = threeMFLoader.parse(buffer);
      } catch {
        // Stock ThreeMFLoader doesn't understand the Production Extension
        // (see the function-level comment above) — retry with the
        // p:path-aware parser before giving up. Reached only when the
        // cheap zip-entry check above didn't already catch it (e.g. a
        // single-.model file using p:path in some other way).
        const fallback = parseProductionThreeMF(buffer, maxTriangles);
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
    }

    return { success: false, error: `Unsupported file type: .${extension}` };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse mesh file",
    };
  }
}

export interface MeshParseWorkerRequest {
  id: number;
  file: File;
  /** Overrides the 3MF triangle cap (desktop only; unset means the shared default). */
  maxTriangles?: number;
}

export interface ParsedMeshGeometry {
  positions: Float32Array;
  normals: Float32Array | null;
  index: Uint32Array | Uint16Array | null;
  repair: MeshRepairReport;
}

export interface MeshParseWorkerResponse {
  id: number;
  result: Result<ParsedMeshGeometry>;
}

const ctx = self as unknown as {
  postMessage(message: MeshParseWorkerResponse, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<MeshParseWorkerRequest>) => void) | null;
};

ctx.onmessage = (event: MessageEvent<MeshParseWorkerRequest>) => {
  const { id, file, maxTriangles } = event.data;
  parseMeshGeometry(file, maxTriangles).then((result) => {
    if (!result.success) {
      ctx.postMessage({ id, result }, []);
      return;
    }

    // Weld/degenerate-strip/manifold-check runs once here, off-main-thread,
    // right after parsing — see repairMesh.ts. Every downstream consumer
    // (diffing, measuring, rendering) gets the cleaned geometry for free.
    const { geometry, report } = repairMeshGeometry(result.data);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!position) {
      ctx.postMessage({ id, result: { success: false, error: "parsed geometry has no position attribute" } }, []);
      return;
    }
    const normalAttr = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
    const indexAttr = geometry.getIndex();

    const positions = position.array as Float32Array;
    const normals = normalAttr ? (normalAttr.array as Float32Array) : null;
    const index = indexAttr ? (indexAttr.array as Uint32Array | Uint16Array) : null;

    const transfer: Transferable[] = [positions.buffer];
    if (normals) transfer.push(normals.buffer);
    if (index) transfer.push(index.buffer);

    ctx.postMessage({ id, result: { success: true, data: { positions, normals, index, repair: report } } }, transfer);
  });
};
