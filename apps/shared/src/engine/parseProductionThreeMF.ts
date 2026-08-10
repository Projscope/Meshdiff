import * as fflate from "fflate";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Result } from "../types/diff.js";

/**
 * Fallback parser for the 3MF Production Extension, which three.js's stock
 * ThreeMFLoader doesn't support (see loadMesh.ts / loadMeshServer.ts for the
 * full explanation). BambuStudio, PrusaSlicer, and OrcaSlicer split a
 * multi-plate/multi-instance export across separate `3D/Objects/*.model`
 * files, referenced from the root model's <build> items or an object's
 * <components> via a `p:path` attribute that stock ThreeMFLoader never
 * reads — it merges every model part's objects into one ID-keyed map with
 * no regard for which file (or which p:path) they actually belong to, so a
 * component pointing at another file's object throws "Cannot read
 * properties of undefined (reading 'mesh')" once IDs don't line up.
 *
 * This walks the actual Production Extension reference graph: resolve the
 * root model via `_rels/.rels`, follow each build item / component's
 * `p:path` to the specific model part it names, and only fall back to the
 * current file when no `p:path` is given (i.e. genuinely local components,
 * same as core-spec 3MF). The resulting geometry always carries a `color`
 * attribute — white when nothing is assigned, an object's <basematerials>
 * displaycolor when it has one, or a per-triangle-corner color when a
 * triangle carries its own `pid`/`p1`/`p2`/`p3` (a <colorgroup> reference,
 * or a basematerials override on individual triangles) — 3MF color is
 * face-varying, not truly per-shared-vertex, so this bakes color per
 * triangle corner rather than per position-buffer index.
 *
 * A real-world wrinkle discovered against an actual BambuStudio export:
 * plenty of these files carry NO spec-native color at all (no
 * <basematerials>, no <colorgroup>, no pid anywhere) — the color the
 * slicer shows comes entirely from BambuStudio's own project files,
 * Metadata/model_settings.config (maps each root-level object id to an
 * `extruder` index) and Metadata/project_settings.config (that extruder's
 * `filament_colour`). Those aren't part of the 3MF spec, but they're the
 * only place the color actually lives for a lot of real single-material
 * prints, so they're read as a fallback when a build item resolves to
 * plain white (i.e. nothing spec-native claimed it).
 */

// apps/shared deliberately has no "dom" lib (it runs server-side too), so
// the DOMParser used here comes from whatever the caller installed on
// globalThis (the browser's own DOMParser client-side, linkedom's
// server-side — see loadMeshServer.ts). These are the minimal structural
// shapes this file actually needs from that parser's output.
interface MinimalAttr {
  name: string;
  value: string;
}
interface MinimalElement {
  getAttribute(name: string): string | null;
  querySelector(selector: string): MinimalElement | null;
  querySelectorAll(selector: string): ArrayLike<MinimalElement>;
  attributes: ArrayLike<MinimalAttr>;
}
interface MinimalDocument {
  querySelector(selector: string): MinimalElement | null;
  querySelectorAll(selector: string): ArrayLike<MinimalElement>;
}
interface MinimalDOMParser {
  parseFromString(text: string, mimeType: string): MinimalDocument;
}
declare const DOMParser: { new (): MinimalDOMParser };

interface ParsedComponent {
  objectId: string;
  path: string | null;
  transform: THREE.Matrix4 | null;
}

interface ParsedTriangle {
  v1: number;
  v2: number;
  v3: number;
  // Per-triangle property overrides (from <triangle pid p1 p2 p3>). When
  // absent, the triangle uses the parent <object>'s pid/pindex instead.
  pid?: string;
  p1?: number;
  p2?: number;
  p3?: number;
}

interface ParsedMesh {
  vertices: Float32Array;
  triangles: ParsedTriangle[];
}

interface ParsedObject {
  meshData?: ParsedMesh;
  components?: ParsedComponent[];
  // Core-spec object-level material assignment — the fallback color for
  // any triangle that doesn't specify its own pid/p1.
  pid?: string;
  pindex?: number;
}

interface ParsedModelFile {
  objects: Map<string, ParsedObject>;
  buildItems: ParsedComponent[];
  // Resource id -> ordered list of RGB colors — covers both <basematerials>
  // (one color per <base>) and <colorgroup> (one color per <color>), which
  // share an id namespace in 3MF and are referenced identically via pid.
  materials: Map<string, [number, number, number][]>;
}

const WHITE: [number, number, number] = [1, 1, 1];

// A color value is "#RRGGBB" or "#RRGGBBAA" — alpha is ignored, this is a
// display-only fallback and the rest of the app has no transparency model.
function parseHexColor(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-fA-F]{6})/.exec(hex);
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}

// 3MF's `transform` attribute is 12 space-separated numbers describing a
// 4x3 matrix in row-major order (three rows of the linear part, then the
// translation row) — same convention/layout three's own 3MFLoader uses.
function parseTransform(value: string): THREE.Matrix4 {
  const t = value.trim().split(/\s+/).map(Number);
  const matrix = new THREE.Matrix4();
  matrix.set(
    t[0], t[3], t[6], t[9],
    t[1], t[4], t[7], t[10],
    t[2], t[5], t[8], t[11],
    0, 0, 0, 1,
  );
  return matrix;
}

// Namespaced `p:path` attributes are read by their literal qualified name
// via getAttribute, which works in both browser DOMParser and linkedom
// (neither does strict namespace-aware attribute resolution here) — but as
// a defensive fallback in case a parser normalizes the prefix differently,
// scan the attribute list for anything ending in `:path`.
function getPathAttribute(el: MinimalElement): string | null {
  const direct = el.getAttribute("p:path");
  if (direct) return direct;
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr.name.toLowerCase().endsWith(":path")) return attr.value;
  }
  return null;
}

function parseComponentLike(el: MinimalElement): ParsedComponent {
  const transformAttr = el.getAttribute("transform");
  return {
    objectId: el.getAttribute("objectid") ?? "",
    path: getPathAttribute(el),
    transform: transformAttr ? parseTransform(transformAttr) : null,
  };
}

function parseModelXml(xmlText: string): ParsedModelFile {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const objects = new Map<string, ParsedObject>();
  const materials = new Map<string, [number, number, number][]>();

  const resourcesEl = doc.querySelector("resources");
  if (resourcesEl) {
    const basematerialsEls = resourcesEl.querySelectorAll("basematerials");
    for (let i = 0; i < basematerialsEls.length; i++) {
      const id = basematerialsEls[i].getAttribute("id");
      if (!id) continue;
      const baseEls = basematerialsEls[i].querySelectorAll("base");
      const colors: [number, number, number][] = [];
      for (let b = 0; b < baseEls.length; b++) {
        colors.push(parseHexColor(baseEls[b].getAttribute("displaycolor") ?? "") ?? WHITE);
      }
      materials.set(id, colors);
    }

    const colorgroupEls = resourcesEl.querySelectorAll("colorgroup");
    for (let i = 0; i < colorgroupEls.length; i++) {
      const id = colorgroupEls[i].getAttribute("id");
      if (!id) continue;
      const colorEls = colorgroupEls[i].querySelectorAll("color");
      const colors: [number, number, number][] = [];
      for (let c = 0; c < colorEls.length; c++) {
        colors.push(parseHexColor(colorEls[c].getAttribute("color") ?? "") ?? WHITE);
      }
      materials.set(id, colors);
    }

    const objectEls = resourcesEl.querySelectorAll("object");
    for (let i = 0; i < objectEls.length; i++) {
      const objectEl = objectEls[i];
      const id = objectEl.getAttribute("id");
      if (!id) continue;
      const pid = objectEl.getAttribute("pid") ?? undefined;
      const pindexAttr = objectEl.getAttribute("pindex");
      const pindex = pindexAttr ? parseInt(pindexAttr, 10) : undefined;

      const meshEl = objectEl.querySelector("mesh");
      if (meshEl) {
        const vertexEls = meshEl.querySelectorAll("vertices vertex");
        const vertices = new Float32Array(vertexEls.length * 3);
        for (let v = 0; v < vertexEls.length; v++) {
          vertices[v * 3] = parseFloat(vertexEls[v].getAttribute("x") ?? "0");
          vertices[v * 3 + 1] = parseFloat(vertexEls[v].getAttribute("y") ?? "0");
          vertices[v * 3 + 2] = parseFloat(vertexEls[v].getAttribute("z") ?? "0");
        }

        const triangleEls = meshEl.querySelectorAll("triangles triangle");
        const triangles: ParsedTriangle[] = [];
        for (let t = 0; t < triangleEls.length; t++) {
          const triEl = triangleEls[t];
          const triPid = triEl.getAttribute("pid") ?? undefined;
          const p1Attr = triEl.getAttribute("p1");
          const p2Attr = triEl.getAttribute("p2");
          const p3Attr = triEl.getAttribute("p3");
          // Per spec, an omitted p2/p3 falls back to p1 (a flat color
          // across that triangle rather than a genuine per-corner blend).
          const p1 = p1Attr ? parseInt(p1Attr, 10) : undefined;
          triangles.push({
            v1: parseInt(triEl.getAttribute("v1") ?? "0", 10),
            v2: parseInt(triEl.getAttribute("v2") ?? "0", 10),
            v3: parseInt(triEl.getAttribute("v3") ?? "0", 10),
            pid: triPid,
            p1,
            p2: p2Attr ? parseInt(p2Attr, 10) : p1,
            p3: p3Attr ? parseInt(p3Attr, 10) : p1,
          });
        }

        objects.set(id, { meshData: { vertices, triangles }, pid, pindex });
        continue;
      }

      const componentsEl = objectEl.querySelector("components");
      if (componentsEl) {
        const componentEls = componentsEl.querySelectorAll("component");
        const components: ParsedComponent[] = [];
        for (let c = 0; c < componentEls.length; c++) {
          components.push(parseComponentLike(componentEls[c]));
        }
        objects.set(id, { components });
        continue;
      }

      // A resource declared with neither <mesh> nor <components> is a
      // valid (if unusual) empty placeholder — skip it, don't treat it as
      // an error, matching how a genuinely empty object should behave.
      objects.set(id, {});
    }
  }

  const buildItems: ParsedComponent[] = [];
  const buildEl = doc.querySelector("build");
  if (buildEl) {
    const itemEls = buildEl.querySelectorAll("item");
    for (let i = 0; i < itemEls.length; i++) {
      const objectId = itemEls[i].getAttribute("objectid");
      if (!objectId) continue;
      buildItems.push(parseComponentLike(itemEls[i]));
    }
  }

  return { objects, buildItems, materials };
}

// BambuStudio/OrcaSlicer-specific: Metadata/model_settings.config maps each
// root-level object id to an extruder index (1-based); that extruder's RGB
// lives in Metadata/project_settings.config's `filament_colour` array
// (0-indexed, so extruder N reads index N-1). Neither file is part of the
// 3MF spec — this is purely a "recover color slicers actually show but
// don't embed spec-natively" fallback. Returns an empty map (not an error)
// for any file that isn't from one of these slicers.
function parseBambuStudioColors(
  zip: Record<string, Uint8Array>,
  decoder: { decode(input: Uint8Array): string },
): Map<string, [number, number, number]> {
  const result = new Map<string, [number, number, number]>();

  const modelSettingsEntry = zip["Metadata/model_settings.config"];
  const projectSettingsEntry = zip["Metadata/project_settings.config"];
  if (!modelSettingsEntry || !projectSettingsEntry) return result;

  let filamentColors: [number, number, number][];
  try {
    const projectSettings = JSON.parse(decoder.decode(projectSettingsEntry)) as {
      filament_colour?: string[];
    };
    filamentColors = (projectSettings.filament_colour ?? [])
      .map((hex) => parseHexColor(hex))
      .filter((c): c is [number, number, number] => c !== null);
  } catch {
    return result;
  }
  if (filamentColors.length === 0) return result;

  const doc = new DOMParser().parseFromString(decoder.decode(modelSettingsEntry), "application/xml");
  const objectEls = doc.querySelectorAll("object");
  for (let i = 0; i < objectEls.length; i++) {
    const objectId = objectEls[i].getAttribute("id");
    if (!objectId) continue;
    const metadataEls = objectEls[i].querySelectorAll("metadata");
    for (let m = 0; m < metadataEls.length; m++) {
      if (metadataEls[m].getAttribute("key") !== "extruder") continue;
      const extruder = parseInt(metadataEls[m].getAttribute("value") ?? "", 10);
      const color = filamentColors[extruder - 1];
      if (color) result.set(objectId, color);
      break;
    }
  }

  return result;
}

// True only when every corner baked so far is the literal untouched
// default — i.e. nothing spec-native (basematerials/colorgroup/pid) ever
// claimed this geometry, so a slicer-specific fallback color is safe to
// apply without clobbering a real (if coincidentally white) material.
function isUncoloredWhite(colors: Float32Array): boolean {
  for (let i = 0; i < colors.length; i++) {
    if (colors[i] !== 1) return false;
  }
  return true;
}

export function parseProductionThreeMF(buffer: ArrayBuffer): Result<THREE.BufferGeometry> {
  try {
    const zip = fflate.unzipSync(new Uint8Array(buffer));
    const decoder = new TextDecoder();

    const rootRelsKey = Object.keys(zip).find((f) => /^_rels\/\.rels$/.test(f));
    if (!rootRelsKey) {
      return { success: false, error: "3MF file is missing the root relationships file" };
    }

    const rootRelsDoc = new DOMParser().parseFromString(decoder.decode(zip[rootRelsKey]), "application/xml");
    const relEls = rootRelsDoc.querySelectorAll("Relationship");
    let rootPath = "3D/3dmodel.model";
    for (let i = 0; i < relEls.length; i++) {
      const target = relEls[i].getAttribute("Target") ?? "";
      if (target.toLowerCase().endsWith(".model")) {
        rootPath = normalizePath(target);
        break;
      }
    }

    const modelCache = new Map<string, ParsedModelFile>();
    function getModel(path: string): ParsedModelFile {
      const key = normalizePath(path);
      const cached = modelCache.get(key);
      if (cached) return cached;
      const entry = zip[key];
      if (!entry) throw new Error(`3MF: referenced model part not found: ${key}`);
      const parsed = parseModelXml(decoder.decode(entry));
      modelCache.set(key, parsed);
      return parsed;
    }

    const rootModel = getModel(rootPath);
    if (rootModel.buildItems.length === 0) {
      return { success: false, error: "3MF file contains no build items" };
    }

    const bambuColors = parseBambuStudioColors(zip, decoder);
    const geometries: THREE.BufferGeometry[] = [];

    function resolve(objectId: string, filePath: string, matrix: THREE.Matrix4): void {
      const model = getModel(filePath);
      const obj = model.objects.get(objectId);
      if (!obj) {
        throw new Error(`3MF: object "${objectId}" referenced but not found in ${filePath}`);
      }

      if (obj.meshData) {
        const { vertices, triangles } = obj.meshData;
        const objectColor: [number, number, number] =
          obj.pid !== undefined && obj.pindex !== undefined
            ? (model.materials.get(obj.pid)?.[obj.pindex] ?? WHITE)
            : WHITE;

        // Color in 3MF is face-varying (per triangle corner), not a single
        // value shared by every triangle touching a vertex — building the
        // geometry non-indexed from the start, one triangle at a time,
        // lets each corner carry its own resolved color directly rather
        // than forcing a per-shared-vertex compromise.
        const positions = new Float32Array(triangles.length * 9);
        const colors = new Float32Array(triangles.length * 9);

        for (let t = 0; t < triangles.length; t++) {
          const tri = triangles[t];
          const corners: [number, number | undefined][] = [
            [tri.v1, tri.p1],
            [tri.v2, tri.p2],
            [tri.v3, tri.p3],
          ];
          const triPid = tri.pid ?? obj.pid;
          const materialColors = triPid ? model.materials.get(triPid) : undefined;

          for (let c = 0; c < 3; c++) {
            const [vertexIndex, propIndex] = corners[c];
            const base = (t * 3 + c) * 3;
            positions[base] = vertices[vertexIndex * 3];
            positions[base + 1] = vertices[vertexIndex * 3 + 1];
            positions[base + 2] = vertices[vertexIndex * 3 + 2];

            const rgb =
              materialColors && propIndex !== undefined
                ? (materialColors[propIndex] ?? objectColor)
                : objectColor;
            colors[base] = rgb[0];
            colors[base + 1] = rgb[1];
            colors[base + 2] = rgb[2];
          }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.applyMatrix4(matrix);
        geometries.push(geometry);
        return;
      }

      if (obj.components) {
        for (const component of obj.components) {
          const childPath = component.path ? normalizePath(component.path) : filePath;
          const childMatrix = component.transform
            ? matrix.clone().multiply(component.transform)
            : matrix.clone();
          resolve(component.objectId, childPath, childMatrix);
        }
      }
      // else: empty placeholder object — contributes no geometry.
    }

    for (const item of rootModel.buildItems) {
      const itemPath = item.path ? normalizePath(item.path) : rootPath;
      const itemMatrix = item.transform ? item.transform.clone() : new THREE.Matrix4();
      const rangeStart = geometries.length;
      resolve(item.objectId, itemPath, itemMatrix);

      const bambuColor = bambuColors.get(item.objectId);
      if (bambuColor) {
        for (let i = rangeStart; i < geometries.length; i++) {
          const colorAttr = geometries[i].getAttribute("color") as THREE.BufferAttribute | undefined;
          if (!colorAttr) continue;
          const values = colorAttr.array as Float32Array;
          if (!isUncoloredWhite(values)) continue; // a real spec color already claimed this part
          for (let v = 0; v < values.length; v += 3) {
            values[v] = bambuColor[0];
            values[v + 1] = bambuColor[1];
            values[v + 2] = bambuColor[2];
          }
          colorAttr.needsUpdate = true;
        }
      }
    }

    if (geometries.length === 0) {
      return { success: false, error: "3MF file contains no mesh data" };
    }

    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!merged) {
      return { success: false, error: "Failed to merge 3MF mesh data" };
    }

    return { success: true, data: merged };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse 3MF file",
    };
  }
}
