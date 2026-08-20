import * as THREE from "three";

/** A cylindrical bore/hole found in a mesh. `axis` is the global axis (0=X,
 * 1=Y, 2=Z) the hole runs along — see the module doc comment for why only
 * axis-aligned holes are detected. */
export interface DetectedHole {
  axis: 0 | 1 | 2;
  centerMm: [number, number, number];
  diameterMm: number;
  depthMm: number;
  triangleCount: number;
}

// A face lying within this far off the perpendicular plane still counts as
// "could be part of a cylindrical wall around this axis" — a real bore's
// side-wall triangles aren't perfectly perpendicular to the axis (mesh
// faceting), so this has to tolerate some slope, not just 0.
const AXIS_NORMAL_EPSILON = 0.3;
// Below this, a patch is more likely a stray sliver near a fillet/seam than
// an intentional bore.
const MIN_PATCH_TRIANGLES = 3;
const DEFAULT_MIN_DIAMETER_MM = 0.3;

const AXES: Array<[number, number]> = [
  [1, 2], // axis 0 (X) -> plane is (Y, Z)
  [0, 2], // axis 1 (Y) -> plane is (X, Z)
  [0, 1], // axis 2 (Z) -> plane is (X, Y)
];

function planeCoords(point: THREE.Vector3, axis: 0 | 1 | 2): [number, number] {
  const [i, j] = AXES[axis];
  const components = [point.x, point.y, point.z];
  return [components[i], components[j]];
}

/**
 * Solves the 3x3 linear system `matrix * x = values` via Gaussian
 * elimination with partial pivoting. Returns null if the system is
 * (near-)singular — e.g. the patch's points are collinear, not a circle.
 */
function solve3x3(matrix: number[][], values: number[]): number[] | null {
  const rows = matrix.map((row, i) => [...row, values[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    if (Math.abs(rows[col][col]) < 1e-12) return null;

    const divisor = rows[col][col];
    for (let k = col; k < 4; k++) rows[col][k] /= divisor;
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let k = col; k < 4; k++) rows[row][k] -= factor * rows[col][k];
    }
  }
  return rows.map((row) => row[3]);
}

/**
 * Algebraic (Kåsa) least-squares circle fit: minimizes the sum of squared
 * residuals of `u² + v² + D*u + E*v + F = 0` over the sampled points, a
 * standard closed-form technique. Returns null if the points don't
 * meaningfully constrain a circle (e.g. too few, or collinear).
 */
function fitCircle(points: Array<[number, number]>): { centerU: number; centerV: number; radius: number } | null {
  let su = 0;
  let sv = 0;
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let squ = 0; // sum of u * (u² + v²)
  let sqv = 0; // sum of v * (u² + v²)
  let sq = 0; // sum of (u² + v²)

  for (const [u, v] of points) {
    const q = u * u + v * v;
    su += u;
    sv += v;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    squ += u * q;
    sqv += v * q;
    sq += q;
  }

  const n = points.length;
  const solution = solve3x3(
    [
      [suu, suv, su],
      [suv, svv, sv],
      [su, sv, n],
    ],
    [-squ, -sqv, -sq],
  );
  if (!solution) return null;

  const [d, e, f] = solution;
  const centerU = -d / 2;
  const centerV = -e / 2;
  const radiusSquared = centerU * centerU + centerV * centerV - f;
  if (!(radiusSquared > 0)) return null;
  return { centerU, centerV, radius: Math.sqrt(radiusSquared) };
}

interface TriangleData {
  vertexIds: [number, number, number]; // canonical (position-deduped) vertex ids
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  candidateAxis: -1 | 0 | 1 | 2;
}

/**
 * Assigns each distinct vertex *position* (not buffer index — a non-indexed
 * geometry gives every triangle its own copy of each vertex, so adjacency
 * has to be found through position, not index identity) a canonical id, so
 * region-growing can walk shared edges regardless of indexing.
 */
function canonicalizePositions(
  position: THREE.BufferAttribute,
  toleranceMm: number,
): { idOf: (bufferIndex: number) => number; positionOf: THREE.Vector3[] } {
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x / toleranceMm)}:${Math.round(y / toleranceMm)}:${Math.round(z / toleranceMm)}`;

  const idByKey = new Map<string, number>();
  const positionOf: THREE.Vector3[] = [];
  const idByBufferIndex = new Int32Array(position.count);

  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const k = key(point.x, point.y, point.z);
    let id = idByKey.get(k);
    if (id === undefined) {
      id = positionOf.length;
      idByKey.set(k, id);
      positionOf.push(point.clone());
    }
    idByBufferIndex[i] = id;
  }

  return { idOf: (bufferIndex) => idByBufferIndex[bufferIndex], positionOf };
}

/**
 * Finds cylindrical bores/holes in a mesh: region-grows patches of triangles
 * whose face normals are roughly perpendicular to one global axis (i.e.
 * could belong to a cylindrical wall running along that axis), fits a
 * circle to each patch, and keeps only the concave ones (normals pointing
 * toward the axis — material is on the *outside*, meaning it's a bore, not
 * a boss/pin sticking out).
 *
 * Deliberately axis-aligned only — the overwhelming majority of
 * drilled/printed holes in CAD exports run along a primary axis; arbitrarily
 * angled holes aren't detected. See CLAUDE.md's "Hole inventory" schema
 * requirement.
 */
export function detectCylindricalHoles(
  geometry: THREE.BufferGeometry,
  options?: { minDiameterMm?: number },
): DetectedHole[] {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!position) return [];

  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  if (triangleCount === 0) return [];

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const diagonalMm = box ? box.getSize(new THREE.Vector3()).length() : 1;
  const weldToleranceMm = Math.max(diagonalMm * 1e-5, 1e-4);
  const { idOf, positionOf } = canonicalizePositions(position, weldToleranceMm);

  const minDiameterMm = options?.minDiameterMm ?? DEFAULT_MIN_DIAMETER_MM;

  const triangles: TriangleData[] = new Array(triangleCount);
  // edgeKey (sorted canonical vertex id pair) -> triangle indices sharing it
  const edgeToTriangles = new Map<string, number[]>();

  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();

  for (let t = 0; t < triangleCount; t++) {
    const i = t * 3;
    const bufA = index ? index.getX(i) : i;
    const bufB = index ? index.getX(i + 1) : i + 1;
    const bufC = index ? index.getX(i + 2) : i + 2;
    const idA = idOf(bufA);
    const idB = idOf(bufB);
    const idC = idOf(bufC);

    v1.copy(positionOf[idA]);
    v2.copy(positionOf[idB]);
    v3.copy(positionOf[idC]);

    const normal = v2.clone().sub(v1).cross(v3.clone().sub(v1));
    const lengthSq = normal.lengthSq();
    let candidateAxis: -1 | 0 | 1 | 2 = -1;
    if (lengthSq > 0) {
      normal.normalize();
      let bestAxis: 0 | 1 | 2 = 0;
      let bestAbs = Math.abs(normal.x);
      if (Math.abs(normal.y) < bestAbs) {
        bestAxis = 1;
        bestAbs = Math.abs(normal.y);
      }
      if (Math.abs(normal.z) < bestAbs) {
        bestAxis = 2;
        bestAbs = Math.abs(normal.z);
      }
      if (bestAbs < AXIS_NORMAL_EPSILON) candidateAxis = bestAxis;
    }

    triangles[t] = {
      vertexIds: [idA, idB, idC],
      normal,
      centroid: v1.clone().add(v2).add(v3).divideScalar(3),
      candidateAxis,
    };

    for (const [x, y] of [
      [idA, idB],
      [idB, idC],
      [idC, idA],
    ]) {
      const key = x < y ? `${x}:${y}` : `${y}:${x}`;
      let list = edgeToTriangles.get(key);
      if (!list) {
        list = [];
        edgeToTriangles.set(key, list);
      }
      list.push(t);
    }
  }

  const visited = new Uint8Array(triangleCount);
  const holes: DetectedHole[] = [];

  for (let seed = 0; seed < triangleCount; seed++) {
    if (visited[seed] || triangles[seed].candidateAxis === -1) continue;

    const axis = triangles[seed].candidateAxis as 0 | 1 | 2;
    const patch: number[] = [];
    const stack = [seed];
    visited[seed] = 1;

    while (stack.length > 0) {
      const t = stack.pop()!;
      patch.push(t);
      const tri = triangles[t];
      for (const [x, y] of [
        [tri.vertexIds[0], tri.vertexIds[1]],
        [tri.vertexIds[1], tri.vertexIds[2]],
        [tri.vertexIds[2], tri.vertexIds[0]],
      ]) {
        const key = x < y ? `${x}:${y}` : `${y}:${x}`;
        for (const neighbor of edgeToTriangles.get(key) ?? []) {
          if (visited[neighbor] || triangles[neighbor].candidateAxis !== axis) continue;
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    if (patch.length < MIN_PATCH_TRIANGLES) continue;

    const vertexIdSet = new Set<number>();
    for (const t of patch) {
      for (const id of triangles[t].vertexIds) vertexIdSet.add(id);
    }
    const patchPoints2D = [...vertexIdSet].map((id) => planeCoords(positionOf[id], axis));
    const fit = fitCircle(patchPoints2D);
    if (!fit || fit.radius * 2 < minDiameterMm) continue;

    let concavity = 0;
    for (const t of patch) {
      const tri = triangles[t];
      const [u, v] = planeCoords(tri.centroid, axis);
      const du = u - fit.centerU;
      const dv = v - fit.centerV;
      const radialLength = Math.hypot(du, dv);
      if (radialLength === 0) continue;
      const [ni, nj] = AXES[axis];
      const normalComponents = [tri.normal.x, tri.normal.y, tri.normal.z];
      const nu = normalComponents[ni];
      const nv = normalComponents[nj];
      concavity += (nu * du + nv * dv) / radialLength;
    }
    // Negative average dot product: face normals point back toward the
    // axis (toward the center) — the surrounding material is outside the
    // circle, i.e. this is a bore. Positive: normals point away from the
    // axis — a boss/pin, not a hole.
    if (concavity >= 0) continue;

    let axisMin = Infinity;
    let axisMax = -Infinity;
    for (const id of vertexIdSet) {
      const components = [positionOf[id].x, positionOf[id].y, positionOf[id].z];
      const value = components[axis];
      axisMin = Math.min(axisMin, value);
      axisMax = Math.max(axisMax, value);
    }
    let axisMean = 0;
    for (const id of vertexIdSet) {
      const components = [positionOf[id].x, positionOf[id].y, positionOf[id].z];
      axisMean += components[axis];
    }
    axisMean /= vertexIdSet.size;

    const centerMm: [number, number, number] = [0, 0, 0];
    const [ci, cj] = AXES[axis];
    centerMm[axis] = axisMean;
    centerMm[ci] = fit.centerU;
    centerMm[cj] = fit.centerV;

    holes.push({
      axis,
      centerMm,
      diameterMm: fit.radius * 2,
      depthMm: axisMax - axisMin,
      triangleCount: patch.length,
    });
  }

  return holes.sort((a, b) => b.diameterMm - a.diameterMm);
}
