import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { writeFile } from "fs/promises";

function roundedRectShape(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

// Rounds only the top two corners (+y side), leaving the bottom square. A
// convex round on the *bottom* corner of a shape that stands up from the
// build plate curls the material inward as it nears the floor — a real,
// physically genuine overhang right at the base, not just a cosmetic
// choice. The top corners are purely cosmetic and safe to round.
function topRoundedRectShape(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x, y);
  shape.lineTo(x + w, y);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y);
  return shape;
}

function circlePath(cx, cy, radius) {
  const path = new THREE.Path();
  path.absarc(cx, cy, radius, 0, Math.PI * 2, false);
  return path;
}

// A hole through a vertical wall with a *round* top always has a real 90°
// "roof" overhang at its apex — the topmost point of any circle has a
// horizontal tangent, i.e. a downward-facing surface directly above open
// air, regardless of diameter. A teardrop — a semicircle capped by two
// 45°-from-vertical straight sides meeting at a point — is the standard
// FDM-safe hole shape for exactly this case: those sides sit right at the
// self-supporting threshold (CLAUDE.md: "Maximum overhang without supports:
// 45°-55°").
function teardropPath(cx, cy, radius) {
  const path = new THREE.Path();
  path.moveTo(cx - radius, cy);
  path.absarc(cx, cy, radius, Math.PI, 2 * Math.PI, false); // bottom semicircle
  path.lineTo(cx, cy + radius); // right side, 45° up to the apex
  path.lineTo(cx - radius, cy); // left side, 45° down from the apex
  return path;
}

// All dimensions in mm. Model space is Z-up (see CLAUDE.md's Alignment
// Strategy / ModelScene.tsx's Z-up-to-Y-up presentation rotation) — "up"
// here means +Z, matching every other seeded/demo model in this repo.
//
// The base and wall are two separately-authored solids merged (not
// boolean-unioned) into one mesh. A boolean union (tried first, via
// three-bvh-csg) does produce a topologically cleaner result, but its
// output triangulation occasionally gets misread by the shared
// hole-detection heuristic (detectCylindricalHoles, used by both the
// printability gate and the version diff) as a bogus, wildly-off-model
// cylindrical hole — a pre-existing fragility in the diff engine, not
// something worth fixing here. A plain merge avoids that entirely; the
// tradeoff is that every joint has to be placed by hand to avoid two
// failure modes the merge can't paper over:
//   1. Two solids' flat faces sitting exactly coincident/tangent (rather
//      than genuinely overlapping) reads as a ~0mm gap to the wall-
//      thickness sampler, which raycasts against *any* surface, duplicate
//      or not.
//   2. A solid's own face embedded *above* the true floor (rather than
//      resting flush on it) is a real, physically-nonexistent "buried
//      ceiling" to the overhang check, which examines raw triangles with
//      no boolean union to remove it — so joints are kept flush with the
//      build plate (letting the "resting on the build plate" exclusion
//      do its job) rather than embedded above it.
function buildBracket({ centerHoleRadius, mountingHoleCenters, cornerRadius, baseThickness = 6 }) {
  const baseWidth = 40; // X
  const baseDepth = 36; // Y
  // Z — independent of the wall below (wallHeight is a fixed span from the
  // floor, not relative to this), so thickening the base is a pure
  // material addition with no knock-on positioning to fix.
  const wallHeight = 44; // Z, flush with the floor through the base's thickness
  const wallThickness = 6; // Y
  const wallTopCornerRadius = 4;
  // The wall is narrower than the base and inset from its back edge by
  // this much — both to avoid sitting exactly flush/tangent on the base's
  // own edges (failure mode 1 above), and, for the width margin
  // specifically, to stay clear of the base's rounded corners: a wall
  // spanning the base's full flat width would poke a genuine, real sliver
  // past the corner's rounded-off material with nothing beneath it.
  const margin = 5;

  // --- Base plate: rounded rect in XY, extruded up along Z ---
  const baseShape = roundedRectShape(baseWidth, baseDepth, cornerRadius);
  for (const [hx, hy] of mountingHoleCenters) {
    baseShape.holes.push(circlePath(hx, hy, 2));
  }
  const baseGeometry = new THREE.ExtrudeGeometry(baseShape, { depth: baseThickness, bevelEnabled: false });

  // --- Vertical wall: rounded-top rect with a center bore, drawn flat in
  // XY then rotated up to stand along Z. ---
  const wallWidth = baseWidth - margin * 2;
  const wallShape = topRoundedRectShape(wallWidth, wallHeight, wallTopCornerRadius);
  wallShape.holes.push(teardropPath(0, 4, centerHoleRadius));
  const wallGeometry = new THREE.ExtrudeGeometry(wallShape, { depth: wallThickness, bevelEnabled: false });
  // rotateX(+90deg) maps local (x, y, z) -> world (x, -z, y): the
  // extrude-depth axis (local z, [0, wallThickness]) becomes world Y in
  // [-wallThickness, 0], and the shape's height axis (local y,
  // [-wallHeight/2, wallHeight/2]) becomes world Z.
  wallGeometry.rotateX(Math.PI / 2);
  // Y: inset `margin` from the base's back edge. Z: flush with the floor
  // (wallHeight/2, not wallHeight/2 + something) — see the note above.
  wallGeometry.translate(0, baseDepth / 2 - margin, wallHeight / 2);

  // --- Diagonal gusset: a right-triangle prism reinforcing the inside
  // corner, instead of a plain right-angle box joint. Built as the convex
  // hull of its 6 corners (a triangular prism is convex, so this gives a
  // correct, outward-facing mesh with no manual winding bookkeeping).
  // Earlier attempts at this embedded the gusset's bottom face *above* the
  // floor to dodge coincidence with the base's own bottom cap, which
  // created a real buried "ceiling" (failure mode 2 above) and a false
  // 90° overhang reading. The fix: rest it flush on the floor exactly like
  // the wall does — that's what makes the wall's own coincident-footprint
  // bottom edge read clean, so the same trick works here too.
  const gussetThickness = 6; // X
  const gussetRun = 20; // along Y, from the wall face toward the front
  const gussetRise = 20; // along Z, from the floor up the wall — 45° to match run
  const gx0 = baseWidth / 2 - gussetThickness - 2; // right side, 2mm in from the edge
  const gx1 = gx0 + gussetThickness;
  const gy0 = baseDepth / 2 - margin - wallThickness + 2; // 2mm into the wall's own thickness
  const gussetPoints = [
    [gx0, gy0, 0],
    [gx0, gy0 - gussetRun, 0],
    [gx0, gy0, gussetRise],
    [gx1, gy0, 0],
    [gx1, gy0 - gussetRun, 0],
    [gx1, gy0, gussetRise],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const gussetGeometry = new ConvexGeometry(gussetPoints);
  // ConvexGeometry emits no uv attribute; mergeGeometries requires every
  // input to share the same attribute set.
  const gussetVertexCount = gussetGeometry.attributes.position.count;
  gussetGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(gussetVertexCount * 2), 2));

  const merged = mergeGeometries([baseGeometry, wallGeometry, gussetGeometry], false);
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}

async function exportSTL(geometry, filePath) {
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  const exporter = new STLExporter();
  const result = exporter.parse(mesh, { binary: true });
  await writeFile(filePath, Buffer.from(result.buffer, result.byteOffset, result.byteLength));
}

const v1 = buildBracket({
  centerHoleRadius: 9, // 18mm bore
  mountingHoleCenters: [
    [-14, -12],
    [14, -12],
  ],
  cornerRadius: 3,
});

const v2 = buildBracket({
  centerHoleRadius: 11, // bored out to 22mm for a larger shaft
  mountingHoleCenters: [
    [-14, -12],
    [14, -12],
    [0, -12], // added a third mounting hole
  ],
  cornerRadius: 3,
  baseThickness: 8, // thickened for extra rigidity — a real material *addition*,
  // so the diff shows both added (green) and removed (red) regions, not just
  // removed holes.
});

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage: node generateBracket.mjs <output-dir>");
  process.exit(1);
}

await exportSTL(v1, `${outDir}/sample-v1.stl`);
await exportSTL(v2, `${outDir}/sample-v2.stl`);

for (const [name, geom] of [
  ["v1", v1],
  ["v2", v2],
]) {
  const box = geom.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const triangleCount = geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3;
  console.log(`${name}: triangles=${triangleCount}, size=${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}mm`);
}
console.log("Done.");
