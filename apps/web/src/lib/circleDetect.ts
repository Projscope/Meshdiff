import * as THREE from "three";
import { fitCircleLeastSquares as fitCircleLeastSquaresImpl, type CircleFit } from "./circleFit";

export interface BoundaryLoop {
  /** Vertices around the loop, in mesh-local space, in connection order. */
  points: THREE.Vector3[];
  centroid: THREE.Vector3;
  /** Largest distance from centroid to any loop vertex — cheap upper bound
   * for "could the cursor be near this loop" checks before doing real work. */
  boundingRadius: number;
}

// Rounds to a fixed precision AND collapses -0 to 0 — `(-2.4e-15).toFixed(4)`
// is the string "-0.0000" while `(0).toFixed(4)` is "0.0000" (JS preserves
// the sign bit through toFixed even when the rounded magnitude is zero), so
// two positions that should dedupe to the *same* key silently didn't
// whenever one side's tiny floating-point residue landed on the negative
// side of zero (e.g. a mesh's angular wraparound seam, sin(2π) evaluating
// to -2.4e-16 instead of exactly 0) — found via a failing test on a
// synthetic ring mesh before this ever touched a real model.
function roundForKey(n: number): number {
  const rounded = Math.round(n * 10000);
  return rounded === 0 ? 0 : rounded; // still an integer (0.0001mm units)
}

const DEFAULT_CREASE_ANGLE_DEGREES = 25;
// A real mesh's rim isn't a mathematical circle (finite triangulation, and
// real prints have some waviness) — this bounds how far a candidate loop's
// vertices can stray from its own best-fit circle, as a fraction of that
// circle's radius, before it's rejected as "not actually circular" (e.g. a
// square logo's crease, or a mesh corner that slipped past the degree
// filter below).
const DEFAULT_MAX_RELATIVE_FIT_ERROR = 0.08;

// Any 3 non-collinear points sit exactly on *some* circle by construction —
// the circularity check above can never reject a 3-point loop, no matter
// how sharp or arbitrary its corner really is. Real-file testing against a
// 441k-triangle mesh confirmed this: 28 of 30 "loops" found were 3-vertex
// noise (tiny unrelated creases), alongside the 2 real rims (1103 and 1198
// points each). A genuine rim/hole is traced through many triangulated
// segments, never just a handful — this floor rejects the trivially-
// concyclic small cases without needing shape-specific logic.
const MIN_LOOP_POINTS = 8;

/** RMS distance of `points` from `fit`'s circle, as a fraction of its
 * radius — ~0 for points that actually lie on a circle, large for e.g. a
 * square's 4 corners fit to their best circle. Exported mainly so this
 * specific judgment call is directly testable without needing to build a
 * full mesh with a known non-circular crease. */
export function loopCircularityRelativeError(points: THREE.Vector3[], fit: CircleFit): number {
  if (fit.radius <= 0) return Infinity;
  const rms = Math.sqrt(
    points.reduce((sum, p) => sum + (p.distanceTo(fit.center) - fit.radius) ** 2, 0) / points.length,
  );
  return rms / fit.radius;
}

/**
 * Finds circular features on a mesh — holes, rims, bosses — by tracing
 * *feature edges* into loops and keeping only the loops that are actually
 * circular. A feature edge is either a naked boundary edge (belongs to
 * only one triangle — an actual hole through an open/non-manifold surface)
 * or a *crease* edge (belongs to two triangles whose faces meet at a sharp
 * angle — e.g. where a cup's vertical wall meets its rim).
 *
 * Naked-edge-only detection (this function's original approach) turned out
 * to almost never fire on this app's real files: printable meshes are
 * watertight by construction, so even an obviously "open" cup rim has no
 * naked edges at all — there's always a thin closing wall, just a sharp
 * one. Crease-angle detection is what actually finds those rims.
 *
 * A real mesh has plenty of *other* crease edges too (every hard corner,
 * decorative detail, logo) that aren't circular holes — two filters keep
 * only genuine circular loops: (1) only vertices with exactly two feature-
 * edge neighbors can be part of a loop (a simple closed curve is always
 * 2-regular; a cube's corners, where 3 edges meet, are naturally excluded
 * without needing to special-case them), and (2) the loop's vertices must
 * actually lie close to their own best-fit circle (rejects a square
 * logo's crease, which is 2-regular but not remotely round).
 *
 * Runs once per loaded mesh (not per mouse move) — the caller should cache
 * the result and just search it on hover. Vertex/edge bookkeeping uses
 * integer vertex IDs and numeric Map keys throughout rather than string
 * keys — measured ~4.4s on a real 441k-triangle mesh with string keys
 * (`toFixed` + template-literal concatenation ~4M times), which is far too
 * slow to run synchronously on mesh load; this stays well under that.
 */
export function findCircularFeatureLoops(
  geometry: THREE.BufferGeometry,
  creaseAngleDegrees = DEFAULT_CREASE_ANGLE_DEGREES,
  maxRelativeFitError = DEFAULT_MAX_RELATIVE_FIT_ERROR,
): BoundaryLoop[] {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  const cornerCount = triangleCount * 3;

  const vertexIndexAt = (corner: number): number => (index ? index.getX(corner) : corner);

  // Pass 1: dedupe corners into integer vertex IDs by rounded position.
  // Numeric Map keys (not strings) — V8's number-keyed Maps skip string
  // hashing/interning entirely, which is most of the cost at this scale.
  const vertexIdByKey = new Map<number, number>();
  const vertexPositions: THREE.Vector3[] = [];
  const cornerVertexId = new Int32Array(cornerCount);

  for (let c = 0; c < cornerCount; c++) {
    const i = vertexIndexAt(c);
    const rx = roundForKey(position.getX(i));
    const ry = roundForKey(position.getY(i));
    const rz = roundForKey(position.getZ(i));
    const key = (rx + 1_048_576) * 4_398_046_511_104 + (ry + 1_048_576) * 2_097_152 + (rz + 1_048_576);
    let vertexId = vertexIdByKey.get(key);
    if (vertexId === undefined) {
      vertexId = vertexPositions.length;
      vertexIdByKey.set(key, vertexId);
      vertexPositions.push(new THREE.Vector3().fromBufferAttribute(position, i));
    }
    cornerVertexId[c] = vertexId;
  }
  const vertexCount = vertexPositions.length;

  // Pass 2: per-triangle unit normal — needed to test the dihedral angle
  // at each shared edge.
  const triangleNormals = new Float32Array(triangleCount * 3);
  {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (let t = 0; t < triangleCount; t++) {
      const base = t * 3;
      a.fromBufferAttribute(position, vertexIndexAt(base));
      b.fromBufferAttribute(position, vertexIndexAt(base + 1));
      c.fromBufferAttribute(position, vertexIndexAt(base + 2));
      normal.subVectors(b, a).cross(c.clone().sub(a));
      if (normal.lengthSq() > 1e-12) normal.normalize();
      triangleNormals[base] = normal.x;
      triangleNormals[base + 1] = normal.y;
      triangleNormals[base + 2] = normal.z;
    }
  }

  // Pass 3: edge -> every triangle that references it (usually 1, for a
  // naked edge, or 2, for a normal manifold edge; more means a non-manifold
  // edge, unusual but not invalid).
  const edgeTriangles = new Map<number, number[]>();
  for (let t = 0; t < triangleCount; t++) {
    const base = t * 3;
    const ids = [cornerVertexId[base], cornerVertexId[base + 1], cornerVertexId[base + 2]];
    for (let c = 0; c < 3; c++) {
      const va = ids[c];
      const vb = ids[(c + 1) % 3];
      const edgeKey = va < vb ? va * vertexCount + vb : vb * vertexCount + va;
      let list = edgeTriangles.get(edgeKey);
      if (!list) {
        list = [];
        edgeTriangles.set(edgeKey, list);
      }
      list.push(t);
    }
  }

  // Pass 4: classify feature edges (naked, or a sharp-enough crease) into
  // adjacency between vertex IDs.
  const cosCreaseThreshold = Math.cos((creaseAngleDegrees * Math.PI) / 180);
  const rawAdjacency = new Map<number, number[]>();
  const addAdjacency = (a: number, b: number) => {
    if (a === b) return;
    let listA = rawAdjacency.get(a);
    if (!listA) {
      listA = [];
      rawAdjacency.set(a, listA);
    }
    listA.push(b);
    let listB = rawAdjacency.get(b);
    if (!listB) {
      listB = [];
      rawAdjacency.set(b, listB);
    }
    listB.push(a);
  };

  for (const [edgeKey, triangles] of edgeTriangles) {
    let isFeature: boolean;
    if (triangles.length === 1) {
      isFeature = true; // naked boundary edge
    } else if (triangles.length === 2) {
      const i0 = triangles[0] * 3;
      const i1 = triangles[1] * 3;
      const dot =
        triangleNormals[i0] * triangleNormals[i1] +
        triangleNormals[i0 + 1] * triangleNormals[i1 + 1] +
        triangleNormals[i0 + 2] * triangleNormals[i1 + 2];
      isFeature = dot < cosCreaseThreshold;
    } else {
      isFeature = true; // non-manifold edge (3+ triangles) — treat as a feature rather than silently ignore
    }
    if (!isFeature) continue;
    const b = edgeKey % vertexCount;
    const a = (edgeKey - b) / vertexCount;
    addAdjacency(a, b);
  }

  // Only vertices with *exactly* two feature-edge neighbors can be part of
  // a simple closed loop — this is what keeps a cube's corners (3 edges
  // meet there), a decorative detail's branch points, etc. from corrupting
  // the walk below, without needing to special-case any particular shape.
  const adjacency = new Map<number, [number, number]>();
  for (const [vertexId, neighbors] of rawAdjacency) {
    const unique = Array.from(new Set(neighbors));
    if (unique.length === 2) adjacency.set(vertexId, [unique[0], unique[1]]);
  }

  const visited = new Set<number>();
  const loops: BoundaryLoop[] = [];

  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) continue;

    const loopIds: number[] = [];
    let current = startId;
    let prev = -1;
    let closed = false;

    for (let steps = 0; steps < 200_000; steps++) {
      const pair = adjacency.get(current);
      if (!pair) break; // walked into a vertex that didn't pass the degree-2 filter
      visited.add(current);
      loopIds.push(current);
      const next = pair[0] === prev ? pair[1] : pair[0];
      if (next === startId && loopIds.length >= 3) {
        closed = true;
        break;
      }
      if (visited.has(next) && next !== startId) break; // ran into another loop — bail
      prev = current;
      current = next;
    }

    if (!closed || loopIds.length < MIN_LOOP_POINTS) continue;

    const points = loopIds.map((id) => vertexPositions[id]);
    const fit = fitCircleLeastSquaresImpl(points);
    if (!fit || fit.radius <= 0) continue;
    if (loopCircularityRelativeError(points, fit) > maxRelativeFitError) continue; // not actually circular

    const centroid = points.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(points.length);
    const boundingRadius = points.reduce((max, p) => Math.max(max, p.distanceTo(centroid)), 0);
    loops.push({ points, centroid, boundingRadius });
  }

  return loops;
}

/**
 * Finds whichever precomputed loop has a vertex closest to `point`, within
 * `maxDistance` — used to check "is the cursor's snapped vertex actually
 * part of a hole/rim boundary?" `point` is expected to already be one of
 * the mesh's own vertices (e.g. from a nearest-vertex snap), so a match is
 * normally near-exact; maxDistance just absorbs floating-point round-trip
 * error through coordinate-space conversions, not real distance search.
 */
export function findNearestLoop(loops: BoundaryLoop[], point: THREE.Vector3, maxDistance: number): BoundaryLoop | null {
  let best: BoundaryLoop | null = null;
  let bestDistance = maxDistance;
  for (const loop of loops) {
    // Cheap reject before scanning every point in the loop.
    if (point.distanceTo(loop.centroid) > loop.boundingRadius + maxDistance) continue;
    for (const p of loop.points) {
      const d = point.distanceTo(p);
      if (d < bestDistance) {
        bestDistance = d;
        best = loop;
      }
    }
  }
  return best;
}

export { fitCircleLeastSquaresImpl as fitCircleLeastSquares };
export type { CircleFit };
