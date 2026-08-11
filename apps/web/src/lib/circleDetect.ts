import * as THREE from "three";
import type { CircleFit } from "./circleFit";

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
  return rounded === 0 ? 0 : rounded; // still an integer (0.0001mm units) — see below
}

/**
 * Finds every boundary loop in a mesh — the edges of any open region (a
 * hole through the part, or the rim of a cup/bowl) where geometry doesn't
 * continue on the other side. A triangle edge shared by exactly one
 * triangle (instead of the usual two, for a closed manifold surface) is a
 * boundary edge; boundary edges chain into loops.
 *
 * Runs once per loaded mesh (not per mouse move) — the caller should cache
 * the result and just search it on hover. Vertex/edge bookkeeping uses
 * integer vertex IDs and numeric Map keys throughout rather than string
 * keys — measured ~4.4s on a real 441k-triangle mesh with string keys
 * (`toFixed` + template-literal concatenation per triangle corner/edge,
 * ~1.3M times each), which is far too slow to run synchronously on mesh
 * load; this version stays well under that.
 */
export function findBoundaryLoops(geometry: THREE.BufferGeometry): BoundaryLoop[] {
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
    // Combine 3 coordinates (each comfortably within ±2^20 for any
    // reasonable model size at 0.0001mm precision) into one safe-integer
    // key via a fixed-radix mix — cheaper than a string join per corner.
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

  // Pass 2: count each edge (by its two deduped vertex IDs). Edge key packs
  // (min, max) vertex IDs into one number — safe as long as vertexCount² is
  // under Number.MAX_SAFE_INTEGER, true for any mesh this app parses.
  const edgeCount = new Map<number, number>();
  for (let t = 0; t < triangleCount; t++) {
    const base = t * 3;
    const ids = [cornerVertexId[base], cornerVertexId[base + 1], cornerVertexId[base + 2]];
    for (let c = 0; c < 3; c++) {
      const a = ids[c];
      const b = ids[(c + 1) % 3];
      const edgeKey = a < b ? a * vertexCount + b : b * vertexCount + a;
      edgeCount.set(edgeKey, (edgeCount.get(edgeKey) ?? 0) + 1);
    }
  }

  // Pass 3: boundary edges (count === 1) become adjacency between vertex IDs.
  const adjacency = new Map<number, number[]>();
  for (const [edgeKey, count] of edgeCount) {
    if (count !== 1) continue;
    const b = edgeKey % vertexCount;
    const a = (edgeKey - b) / vertexCount;
    if (a === b) continue; // degenerate edge
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a)!.push(b);
    adjacency.get(b)!.push(a);
  }

  const visited = new Set<number>();
  const loops: BoundaryLoop[] = [];

  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) continue;

    const loopIds: number[] = [];
    let current = startId;
    let prev = -1;
    let closed = false;

    // A clean boundary loop is a simple cycle — every vertex on it has
    // exactly two boundary neighbors. Walk forward, always choosing the
    // neighbor that isn't where we just came from, until back at the start.
    for (let steps = 0; steps < 200_000; steps++) {
      visited.add(current);
      loopIds.push(current);
      const neighbors = adjacency.get(current);
      if (!neighbors) break;
      const next = neighbors.find((n) => n !== prev) ?? (neighbors.length === 1 ? undefined : neighbors[0]);
      if (next === undefined) break; // dead end — not a clean closed loop, stop here
      if (next === startId && loopIds.length >= 3) {
        closed = true;
        break;
      }
      if (visited.has(next) && next !== startId) break; // ran into another loop — malformed mesh, bail
      prev = current;
      current = next;
    }

    if (closed && loopIds.length >= 3) {
      const points = loopIds.map((id) => vertexPositions[id]);
      const centroid = points.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(points.length);
      const boundingRadius = points.reduce((max, p) => Math.max(max, p.distanceTo(centroid)), 0);
      loops.push({ points, centroid, boundingRadius });
    }
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

/** Area-weighted average normal of a near-planar polygon loop (Newell's
 * method) — robust to individual noisy vertices, unlike deriving a normal
 * from just 3 of the points. */
function newellNormal(points: THREE.Vector3[]): THREE.Vector3 {
  const normal = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    normal.x += (curr.y - next.y) * (curr.z + next.z);
    normal.y += (curr.z - next.z) * (curr.x + next.x);
    normal.z += (curr.x - next.x) * (curr.y + next.y);
  }
  return normal.normalize();
}

function determinant3x3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

function solve3x3(a: number[][], b: number[]): [number, number, number] | null {
  const det = determinant3x3(a);
  if (Math.abs(det) < 1e-9) return null;
  const withCol = (col: number) => a.map((row, i) => row.map((v, j) => (j === col ? b[i] : v)));
  return [determinant3x3(withCol(0)) / det, determinant3x3(withCol(1)) / det, determinant3x3(withCol(2)) / det];
}

/**
 * Least-squares circle fit through any number (3+) of points — the robust
 * counterpart to fitCircleThroughThreePoints in circleFit.ts. A real mesh's
 * boundary loop is only *approximately* circular (finite triangulation,
 * not a mathematical curve), so this fits the best circle through every
 * loop vertex instead of trusting 3 arbitrary ones exactly.
 *
 * Method: fit the best-fit plane via Newell's method, project every point
 * into that plane, then solve the classic Kåsa linear least-squares circle
 * fit (x²+y² = Dx + Ey + F) via a 3×3 normal-equations solve.
 */
export function fitCircleLeastSquares(points: THREE.Vector3[]): CircleFit | null {
  if (points.length < 3) return null;

  const centroid = points.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(points.length);
  const normal = newellNormal(points);
  if (normal.lengthSq() < 1e-9) return null;

  const seed = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = seed.clone().sub(normal.clone().multiplyScalar(seed.dot(normal))).normalize();
  const v = normal.clone().cross(u).normalize();

  let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0, sumXZ = 0, sumYZ = 0, sumZ = 0;
  const rel = new THREE.Vector3();
  for (const p of points) {
    rel.copy(p).sub(centroid);
    const x = rel.dot(u);
    const y = rel.dot(v);
    const z = x * x + y * y;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
    sumXZ += x * z;
    sumYZ += y * z;
    sumZ += z;
  }

  const solved = solve3x3(
    [
      [sumXX, sumXY, sumX],
      [sumXY, sumYY, sumY],
      [sumX, sumY, points.length],
    ],
    [sumXZ, sumYZ, sumZ],
  );
  if (!solved) return null;
  const [d, e, f] = solved;
  const cx = d / 2;
  const cy = e / 2;
  const radiusSquared = f + cx * cx + cy * cy;
  if (radiusSquared <= 0) return null;

  const center = centroid.clone().addScaledVector(u, cx).addScaledVector(v, cy);
  return { center, radius: Math.sqrt(radiusSquared), normal };
}
