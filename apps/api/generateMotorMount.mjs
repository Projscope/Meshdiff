import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { writeFile } from "fs/promises";

// Reuses the exact safe, non-CSG construction rules worked out for
// generateBracket.mjs earlier this session: every standing part is flush
// with the global floor (z=0) rather than resting on top of another
// part's face, vertical walls only round their TOP corners, and any hole
// through a vertical wall is a teardrop (never a plain circle) — see that
// file's comments for the full reasoning. A plain circular hole is fine
// through a HORIZONTAL face (its bore is vertical, parallel to the build
// direction, so it's always angle-excluded from the overhang check).

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

function teardropPath(cx, cy, radius) {
  const path = new THREE.Path();
  path.moveTo(cx - radius, cy);
  path.absarc(cx, cy, radius, Math.PI, 2 * Math.PI, false);
  path.lineTo(cx, cy + radius);
  path.lineTo(cx - radius, cy);
  return path;
}

function boltCircleHoles(shape, count, radius, holeRadius, startAngle = 0) {
  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i / count) * Math.PI * 2;
    shape.holes.push(circlePath(Math.cos(angle) * radius, Math.sin(angle) * radius, holeRadius));
  }
}

function buildMotorMount({ boreRadius, boltHoleCount, backWallHeight }) {
  const baseWidth = 60; // X
  const baseDepth = 50; // Y
  const baseThickness = 6; // Z
  const cornerHoleRadius = 2.5;
  const cornerHoleInset = 6; // from each edge

  // --- Base plate ---
  const baseShape = roundedRectShape(baseWidth, baseDepth, 4);
  const hx = baseWidth / 2 - cornerHoleInset;
  const hy = baseDepth / 2 - cornerHoleInset;
  for (const [cx, cy] of [
    [-hx, -hy],
    [hx, -hy],
    [-hx, hy],
    [hx, hy],
  ]) {
    baseShape.holes.push(circlePath(cx, cy, cornerHoleRadius));
  }
  const baseGeometry = new THREE.ExtrudeGeometry(baseShape, { depth: baseThickness, bevelEnabled: false });

  // --- Raised central boss: extends from the floor (z=0) up through and
  // past the base's own thickness, rather than resting flush on top of
  // it — same "flush with the global floor" rule as everything else here. ---
  const bossHeight = 12; // extends 6mm above the base's own top surface
  const bossShape = roundedRectShape(26, 22, 3);
  bossShape.holes.push(circlePath(0, 0, boreRadius));
  boltCircleHoles(bossShape, boltHoleCount, 9, 1.5, Math.PI / boltHoleCount);
  const bossGeometry = new THREE.ExtrudeGeometry(bossShape, { depth: bossHeight, bevelEnabled: false });

  // --- Front wall: shorter, teardrop window ---
  const frontWallWidth = 40;
  const frontWallHeight = 26;
  const frontWallThickness = 6;
  const frontWallShape = topRoundedRectShape(frontWallWidth, frontWallHeight, 4);
  frontWallShape.holes.push(teardropPath(0, 2, 7));
  const frontWallGeometry = new THREE.ExtrudeGeometry(frontWallShape, { depth: frontWallThickness, bevelEnabled: false });
  frontWallGeometry.rotateX(Math.PI / 2);
  // Inset 5mm from the base's front edge (Y negative side) — mirrors the
  // "inset from the edge, flush with the floor" rule from generateBracket.mjs.
  frontWallGeometry.translate(0, -(baseDepth / 2 - 5), frontWallHeight / 2);

  // --- Back wall: taller, teardrop window, reinforcement rib feel ---
  const backWallWidth = 40;
  const backWallThickness = 6;
  const backWallShape = topRoundedRectShape(backWallWidth, backWallHeight, 4);
  backWallShape.holes.push(teardropPath(0, 4, 8));
  const backWallGeometry = new THREE.ExtrudeGeometry(backWallShape, { depth: backWallThickness, bevelEnabled: false });
  backWallGeometry.rotateX(Math.PI / 2);
  backWallGeometry.translate(0, baseDepth / 2 - 5, backWallHeight / 2);

  const merged = mergeGeometries([baseGeometry, bossGeometry, frontWallGeometry, backWallGeometry], false);
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

const v1 = buildMotorMount({ boreRadius: 7, boltHoleCount: 4, backWallHeight: 30 });
const v2 = buildMotorMount({ boreRadius: 8, boltHoleCount: 6, backWallHeight: 38 });

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage: node generateMotorMount.mjs <output-dir>");
  process.exit(1);
}

await exportSTL(v1, `${outDir}/motor-mount-v1.stl`);
await exportSTL(v2, `${outDir}/motor-mount-v2.stl`);

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
