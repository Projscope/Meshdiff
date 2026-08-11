import * as THREE from "three";

export interface CircleFit {
  center: THREE.Vector3;
  radius: number;
  /** Unit normal of the plane the three points (and the fitted circle) lie in. */
  normal: THREE.Vector3;
}

/**
 * The circle passing through three points — same "3-point radius" tool a
 * caliper or CAD measure command offers: click three spots on a hole or
 * boss's rim and get its radius, without needing the part's true center to
 * be a real vertex you could click directly.
 *
 * Circumcenter via barycentric weights (a well-known, easily-verified
 * formula — see the accompanying test for a check against a circle with a
 * known radius/center): for triangle ABC with side lengths a=|BC|, b=|CA|,
 * c=|AB|, the circumcenter is (wA*A + wB*B + wC*C) / (wA+wB+wC) where
 * wA = a²(b²+c²−a²), and circumradius = abc / (4 * triangle area).
 */
export function fitCircleThroughThreePoints(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): CircleFit | null {
  const sideA = b.distanceTo(c);
  const sideB = c.distanceTo(a);
  const sideC = a.distanceTo(b);

  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  const normalRaw = ab.clone().cross(ac);
  const area = normalRaw.length() / 2;
  if (area < 1e-9) return null; // collinear (or coincident) points — no unique circle

  const sideA2 = sideA * sideA;
  const sideB2 = sideB * sideB;
  const sideC2 = sideC * sideC;
  const wA = sideA2 * (sideB2 + sideC2 - sideA2);
  const wB = sideB2 * (sideC2 + sideA2 - sideB2);
  const wC = sideC2 * (sideA2 + sideB2 - sideC2);
  const wSum = wA + wB + wC;
  if (Math.abs(wSum) < 1e-9) return null;

  const center = new THREE.Vector3()
    .addScaledVector(a, wA)
    .addScaledVector(b, wB)
    .addScaledVector(c, wC)
    .divideScalar(wSum);

  const radius = (sideA * sideB * sideC) / (4 * area);

  return { center, radius, normal: normalRaw.normalize() };
}

/** Points tracing the fitted circle's outline, for rendering a ring. */
export function sampleCircle(fit: CircleFit, segments = 64): THREE.Vector3[] {
  // Any vector not parallel to normal works as a seed for an in-plane basis.
  const seed = Math.abs(fit.normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = seed.clone().sub(fit.normal.clone().multiplyScalar(seed.dot(fit.normal))).normalize();
  const v = fit.normal.clone().cross(u).normalize();

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(
      fit.center
        .clone()
        .addScaledVector(u, fit.radius * Math.cos(angle))
        .addScaledVector(v, fit.radius * Math.sin(angle)),
    );
  }
  return points;
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
 * counterpart to fitCircleThroughThreePoints above. A real mesh's boundary
 * loop is only *approximately* circular (finite triangulation, not a
 * mathematical curve), so this fits the best circle through every loop
 * vertex instead of trusting 3 arbitrary ones exactly.
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
