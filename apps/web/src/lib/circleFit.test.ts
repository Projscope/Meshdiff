import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { fitCircleLeastSquares, fitCircleThroughThreePoints, sampleCircle } from "./circleFit";

function pointOnCircle(center: THREE.Vector3, radius: number, angleRad: number): THREE.Vector3 {
  return new THREE.Vector3(
    center.x + radius * Math.cos(angleRad),
    center.y + radius * Math.sin(angleRad),
    center.z,
  );
}

function pointOnCircleWithNormal(center: THREE.Vector3, radius: number, angle: number, normal: THREE.Vector3): THREE.Vector3 {
  const seed = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = seed.clone().sub(normal.clone().multiplyScalar(seed.dot(normal))).normalize();
  const v = normal.clone().cross(u).normalize();
  return center.clone().addScaledVector(u, radius * Math.cos(angle)).addScaledVector(v, radius * Math.sin(angle));
}

describe("fitCircleThroughThreePoints", () => {
  it("recovers the exact center/radius for three points on a known circle (XY plane)", () => {
    const center = new THREE.Vector3(0, 0, 0);
    const radius = 5;
    const a = pointOnCircle(center, radius, 0);
    const b = pointOnCircle(center, radius, (2 * Math.PI) / 3);
    const c = pointOnCircle(center, radius, (4 * Math.PI) / 3);

    const fit = fitCircleThroughThreePoints(a, b, c);
    expect(fit).not.toBeNull();
    expect(fit!.center.distanceTo(center)).toBeCloseTo(0, 6);
    expect(fit!.radius).toBeCloseTo(radius, 6);
  });

  it("works for an off-origin, off-plane circle (arbitrary center/radius/orientation)", () => {
    const center = new THREE.Vector3(12, -7, 40);
    const radius = 3.25;
    // Points on a circle tilted in an arbitrary plane (not axis-aligned) —
    // build two orthonormal in-plane basis vectors from a chosen normal.
    const normal = new THREE.Vector3(1, 2, 3).normalize();
    const u = new THREE.Vector3(1, 0, 0).sub(normal.clone().multiplyScalar(normal.x)).normalize();
    const v = normal.clone().cross(u).normalize();
    function pointAt(angle: number) {
      return center
        .clone()
        .addScaledVector(u, radius * Math.cos(angle))
        .addScaledVector(v, radius * Math.sin(angle));
    }
    const a = pointAt(0.3);
    const b = pointAt(2.1);
    const c = pointAt(4.4);

    const fit = fitCircleThroughThreePoints(a, b, c);
    expect(fit).not.toBeNull();
    expect(fit!.center.distanceTo(center)).toBeCloseTo(0, 5);
    expect(fit!.radius).toBeCloseTo(radius, 5);
    // Normal should be parallel (or anti-parallel) to the plane's real normal.
    expect(Math.abs(fit!.normal.dot(normal))).toBeCloseTo(1, 5);
  });

  it("returns null for three collinear points (no unique circle)", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(1, 0, 0);
    const c = new THREE.Vector3(2, 0, 0);
    expect(fitCircleThroughThreePoints(a, b, c)).toBeNull();
  });

  it("returns null when two of the three points coincide", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(0, 0, 0);
    const c = new THREE.Vector3(1, 1, 0);
    expect(fitCircleThroughThreePoints(a, b, c)).toBeNull();
  });

  it("every input point lies exactly on the fitted circle (distance from center == radius)", () => {
    const a = new THREE.Vector3(2, 0, 0);
    const b = new THREE.Vector3(0, 3, 1);
    const c = new THREE.Vector3(-1, -1, 2);
    const fit = fitCircleThroughThreePoints(a, b, c);
    expect(fit).not.toBeNull();
    for (const p of [a, b, c]) {
      expect(p.distanceTo(fit!.center)).toBeCloseTo(fit!.radius, 6);
    }
  });
});

describe("sampleCircle", () => {
  it("every sampled point sits exactly `radius` from `center`, in the fitted plane", () => {
    const a = new THREE.Vector3(2, 0, 0);
    const b = new THREE.Vector3(0, 3, 1);
    const c = new THREE.Vector3(-1, -1, 2);
    const fit = fitCircleThroughThreePoints(a, b, c)!;
    const samples = sampleCircle(fit, 32);
    expect(samples).toHaveLength(33); // segments + 1 (closes the loop)
    for (const p of samples) {
      expect(p.distanceTo(fit.center)).toBeCloseTo(fit.radius, 6);
      // In-plane: (p - center) should be perpendicular to the plane normal.
      const offset = p.clone().sub(fit.center);
      expect(offset.dot(fit.normal)).toBeCloseTo(0, 6);
    }
  });

  it("first and last sampled points coincide (closed loop)", () => {
    const fit = fitCircleThroughThreePoints(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-1, 0, 0),
    )!;
    const samples = sampleCircle(fit, 16);
    expect(samples[0].distanceTo(samples[samples.length - 1])).toBeCloseTo(0, 9);
  });
});

describe("fitCircleLeastSquares", () => {
  it("recovers the exact center/radius for many points exactly on a known circle", () => {
    const center = new THREE.Vector3(5, -3, 12);
    const radius = 7.5;
    const normal = new THREE.Vector3(0.2, 0.4, 1).normalize();
    const points = Array.from({ length: 24 }, (_, i) =>
      pointOnCircleWithNormal(center, radius, (i / 24) * Math.PI * 2, normal),
    );

    const fit = fitCircleLeastSquares(points);
    expect(fit).not.toBeNull();
    expect(fit!.center.distanceTo(center)).toBeCloseTo(0, 4);
    expect(fit!.radius).toBeCloseTo(radius, 4);
    expect(Math.abs(fit!.normal.dot(normal))).toBeCloseTo(1, 4);
  });

  it("stays close to the true circle when points have small random noise (robustness over an exact 3-point fit)", () => {
    const center = new THREE.Vector3(0, 0, 0);
    const radius = 10;
    const normal = new THREE.Vector3(0, 0, 1);
    let seed = 42;
    const rand = () => {
      // Deterministic PRNG so the test is stable.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * 2 - 1;
    };
    const points = Array.from({ length: 40 }, (_, i) => {
      const p = pointOnCircleWithNormal(center, radius, (i / 40) * Math.PI * 2, normal);
      p.x += rand() * 0.05;
      p.y += rand() * 0.05;
      return p;
    });

    const fit = fitCircleLeastSquares(points);
    expect(fit).not.toBeNull();
    expect(fit!.center.distanceTo(center)).toBeLessThan(0.05);
    expect(Math.abs(fit!.radius - radius)).toBeLessThan(0.05);
  });

  it("returns null for fewer than 3 points", () => {
    expect(fitCircleLeastSquares([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)])).toBeNull();
  });
});
