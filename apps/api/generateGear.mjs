import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { writeFile } from "fs/promises";

// A gear is inherently simpler to build safely than the bracket
// (generateBracket.mjs): every hole here is a vertical-axis bore through a
// flat disc (always angle-excluded from the overhang check, regardless of
// diameter — see that file's comments on why a *horizontal*-axis bore is
// the tricky case), and there are no vertical walls at all, so there's no
// overhang risk anywhere in this model.

function gearShape(toothCount, tipRadius, rootRadius) {
  const shape = new THREE.Shape();
  const anglePerTooth = (Math.PI * 2) / toothCount;
  const toothTipFraction = 0.4; // fraction of each tooth's angular slot that's the flat tip
  for (let i = 0; i < toothCount; i++) {
    const a0 = i * anglePerTooth;
    const tipStart = a0 + anglePerTooth * (0.5 - toothTipFraction / 2);
    const tipEnd = a0 + anglePerTooth * (0.5 + toothTipFraction / 2);
    const rootEnd = a0 + anglePerTooth;
    const pt = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
    const p1 = pt(rootRadius, a0);
    const p2 = pt(tipRadius, tipStart);
    const p3 = pt(tipRadius, tipEnd);
    const p4 = pt(rootRadius, rootEnd);
    // p1 of this tooth is the same point as p4 of the previous one (both
    // are the root-radius point at angle a0) — emitting it again would add
    // a zero-length edge, which extrudes into a zero-area degenerate
    // triangle on the side wall and crashes three-mesh-bvh's raycaster
    // (a null face normal) when the wall-thickness sampler hits it.
    if (i === 0) {
      shape.moveTo(p1[0], p1[1]);
    }
    shape.lineTo(p2[0], p2[1]);
    shape.lineTo(p3[0], p3[1]);
    // Same reasoning again, at the other end: the last tooth's p4
    // (rootRadius at angle toothCount*anglePerTooth, computed as
    // i*anglePerTooth+anglePerTooth) is meant to coincide exactly with the
    // very first p1 (rootRadius at angle 0), but floating-point angle
    // accumulation lands a hair off of exactly 2π, so it doesn't. Skip it
    // on the last tooth and let closePath() connect straight back to the
    // true start point instead of a near-duplicate.
    if (i < toothCount - 1) shape.lineTo(p4[0], p4[1]);
  }
  shape.closePath();
  return shape;
}

// An explicit polygon rather than absarc's 0-to-2π sweep: computing
// cos/sin at exactly 2π doesn't land on exactly the same float as cos/sin
// at 0, so a full-circle arc leaves a near-zero-length seam edge —
// extruded, that's a zero-area sliver triangle that crashes
// three-mesh-bvh's raycaster (a null face normal) when the wall-thickness
// sampler's ray happens to hit it. Stopping one segment short and letting
// closePath() join back to the true start point avoids the seam entirely.
function circlePath(cx, cy, radius, segments = 48) {
  const path = new THREE.Path();
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

function buildGear({ toothCount, boreRadius, hubRadius, hubHeight }) {
  const tipRadius = 20;
  const rootRadius = 16;
  const thickness = 8;

  const shape = gearShape(toothCount, tipRadius, rootRadius);
  shape.holes.push(circlePath(0, 0, boreRadius));
  const gearGeometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });

  const parts = [gearGeometry];

  if (hubRadius && hubHeight) {
    // Extends from the true floor (z=0) up through the gear body and
    // above it — same "flush with the floor, not embedded above it" rule
    // as generateBracket.mjs's wall/gusset, and already verified clean on
    // generateMotorMount.mjs's raised boss (identical situation: a
    // smaller round part's own footprint sitting inside a larger flat
    // part's footprint, both capped at z=0).
    // Same seam-avoidance as circlePath() above — Shape.absarc() has the
    // identical 0-vs-2π floating-point issue. Deliberately a *different*
    // segment count from circlePath()'s bore hole below (48): sharing one
    // count put this circle's and the bore's vertices at the same angles,
    // and with hubRadius exactly 2x boreRadius, earcut's cap triangulation
    // picked a genuinely (not just numerically) collinear vertex triple —
    // a real zero-area triangle, not a precision artifact — that crashed
    // the same raycaster. Off-count vertices can't align like that.
    const hubShape = new THREE.Shape();
    const hubSegments = 41;
    for (let i = 0; i < hubSegments; i++) {
      const angle = (i / hubSegments) * Math.PI * 2;
      const x = Math.cos(angle) * hubRadius;
      const y = Math.sin(angle) * hubRadius;
      if (i === 0) hubShape.moveTo(x, y);
      else hubShape.lineTo(x, y);
    }
    hubShape.closePath();
    hubShape.holes.push(circlePath(0, 0, boreRadius));
    // `hubHeight` is how far the hub rises *above* the gear body's own top
    // surface — so its total extrude depth needs the gear's thickness
    // folded in, otherwise it'd stop flush with (or short of) the gear's
    // own top instead of standing proud of it.
    const hubGeometry = new THREE.ExtrudeGeometry(hubShape, { depth: thickness + hubHeight, bevelEnabled: false });
    parts.push(hubGeometry);
  }

  const merged = mergeGeometries(parts, false);
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

// v1: plain gear, no hub, smaller bore.
// v2: bore bored out wider (material removed) and a raised center hub
// added for a shaft collar (material added) — same "both directions of
// change in one diff" story as the bracket, on a completely different
// shape.
const v1 = buildGear({ toothCount: 12, boreRadius: 4, hubRadius: 0, hubHeight: 0 });
const v2 = buildGear({ toothCount: 12, boreRadius: 5, hubRadius: 10, hubHeight: 6 });

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage: node generateGear.mjs <output-dir>");
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
