import * as fflate from "fflate";
import * as THREE from "three";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { parseProductionThreeMF } from "@meshdiff/shared/engine/parseProductionThreeMF";
import type { Result } from "@meshdiff/shared/types/diff";

const threeMFLoader = new ThreeMFLoader();
const WHITE = new THREE.Color(0xffffff);

export interface ColoredMeshResult {
  geometry: THREE.BufferGeometry;
  /** False when every object in the file used the loader's plain-white
   * default material and no <colorgroup> — callers should ignore the
   * geometry's color attribute and keep the flat fallback material. */
  hasColor: boolean;
}

/**
 * Display-only alternative to loadMesh.ts's loadMeshGeometry(): preserves
 * 3MF color (a <colorgroup>'s per-vertex color, or a <basematerials>
 * displaycolor baked flat across an object's vertices) instead of
 * stripping every attribute but position. Never call this for anything
 * feeding the diff/printability engine — that code strips color on
 * purpose (mergeGeometries requires matching attribute sets across
 * objects, and per-mesh color isn't meaningful to geometry comparison).
 * STL/OBJ carry no color at all, so this only does anything for 3MF. Most
 * files go through the stock loader (which preserves <colorgroup> and
 * <basematerials> just fine); a Production Extension file that needs
 * parseProductionThreeMF's fallback instead only gets object-level
 * basematerials color (see that file's doc comment for why), not
 * per-triangle colorgroup — still real color, just coarser.
 */
export async function loadMeshForDisplay(file: File): Promise<Result<ColoredMeshResult>> {
  const buffer = await file.arrayBuffer();

  try {
    const group = threeMFLoader.parse(buffer);
    group.updateWorldMatrix(true, true);

    const geometries: THREE.BufferGeometry[] = [];
    let hasColor = false;

    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      let geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);
      if (geometry.index) geometry = geometry.toNonIndexed();

      if (!geometry.getAttribute("color")) {
        const material = Array.isArray(child.material) ? child.material[0] : child.material;
        const baseColor =
          material && "color" in material && material.color instanceof THREE.Color
            ? material.color
            : WHITE;
        const vertexCount = geometry.getAttribute("position").count;
        const colors = new Float32Array(vertexCount * 3);
        for (let i = 0; i < vertexCount; i++) {
          colors[i * 3] = baseColor.r;
          colors[i * 3 + 1] = baseColor.g;
          colors[i * 3 + 2] = baseColor.b;
        }
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        if (!baseColor.equals(WHITE)) hasColor = true;
      } else {
        hasColor = true;
      }

      for (const name of Object.keys(geometry.attributes)) {
        if (name !== "position" && name !== "color") geometry.deleteAttribute(name);
      }
      geometries.push(geometry);
    });

    if (geometries.length === 0) {
      return { success: false, error: "3MF file contains no mesh data" };
    }

    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!merged) {
      return { success: false, error: "Failed to merge 3MF mesh data" };
    }
    merged.computeVertexNormals();
    return { success: true, data: { geometry: merged, hasColor } };
  } catch {
    // Stock ThreeMFLoader doesn't support the Production Extension — retry
    // with the p:path-aware parser, which also bakes basematerials color.
    const fallback = parseProductionThreeMF(buffer);
    if (!fallback.success) return fallback;

    const color = fallback.data.getAttribute("color");
    let hasColor = false;
    if (color) {
      for (let i = 0; i < color.count; i++) {
        if (color.getX(i) !== 1 || color.getY(i) !== 1 || color.getZ(i) !== 1) {
          hasColor = true;
          break;
        }
      }
    }
    fallback.data.computeVertexNormals();
    return { success: true, data: { geometry: fallback.data, hasColor } };
  }
}

const METADATA_FIELDS = [
  "Title",
  "Designer",
  "Description",
  "Copyright",
  "LicenseTerms",
  "Rating",
  "CreationDate",
  "ModificationDate",
];

export interface ThreeMFProperties {
  unit: string;
  metadata: Record<string, string>;
}

/**
 * Reads the root model's <metadata> block and unit attribute directly
 * (fflate + DOMParser), independent of which mesh parser succeeded —
 * metadata always lives in the root model file even for Production
 * Extension exports whose actual mesh data is split across other parts.
 */
export async function extractThreeMFProperties(file: File): Promise<ThreeMFProperties | null> {
  try {
    const buffer = await file.arrayBuffer();
    const zip = fflate.unzipSync(new Uint8Array(buffer));
    const decoder = new TextDecoder();

    let rootPath = "3D/3dmodel.model";
    const rootRelsKey = Object.keys(zip).find((f) => /^_rels\/\.rels$/.test(f));
    if (rootRelsKey) {
      const relsDoc = new DOMParser().parseFromString(decoder.decode(zip[rootRelsKey]), "application/xml");
      const relEls = relsDoc.querySelectorAll("Relationship");
      for (let i = 0; i < relEls.length; i++) {
        const target = relEls[i].getAttribute("Target") ?? "";
        if (target.toLowerCase().endsWith(".model")) {
          rootPath = target.replace(/^\/+/, "");
          break;
        }
      }
    }

    const modelEntry = zip[rootPath];
    if (!modelEntry) return null;

    const doc = new DOMParser().parseFromString(decoder.decode(modelEntry), "application/xml");
    const modelEl = doc.querySelector("model");
    const unit = modelEl?.getAttribute("unit") ?? "millimeter";

    const metadata: Record<string, string> = {};
    const metaEls = doc.querySelectorAll("metadata");
    for (let i = 0; i < metaEls.length; i++) {
      const name = metaEls[i].getAttribute("name");
      const value = metaEls[i].textContent?.trim();
      if (name && value && METADATA_FIELDS.includes(name)) {
        metadata[name] = value;
      }
    }

    return { unit, metadata };
  } catch {
    return null;
  }
}
