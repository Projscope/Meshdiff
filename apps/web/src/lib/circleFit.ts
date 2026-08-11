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
