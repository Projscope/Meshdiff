import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { findBoundaryLoops, findNearestLoop, fitCircleLeastSquares } from "./circleDetect";

function pointOnCircle(center: THREE.Vector3, radius: number, angle: number, normal: THREE.Vector3): THREE.Vector3 {
  const seed = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = seed.clone().sub(normal.clone().multiplyScalar(seed.dot(normal))).normalize();
  const v = normal.clone().cross(u).normalize();
  return center.clone().addScaledVector(u, radius * Math.cos(angle)).addScaledVector(v, radius * Math.sin(angle));
}

describe("fitCircleLeastSquares", () => {
  it("recovers the exact center/radius for many points exactly on a known circle", () => {
    const center = new THREE.Vector3(5, -3, 12);
    const radius = 7.5;
    const normal = new THREE.Vector3(0.2, 0.4, 1).normalize();
    const points = Array.from({ length: 24 }, (_, i) =>
      pointOnCircle(center, radius, (i / 24) * Math.PI * 2, normal),
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
      const p = pointOnCircle(center, radius, (i / 40) * Math.PI * 2, normal);
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

/**
 * Builds a flat annulus (washer) as a non-indexed triangle soup — matching
 * how loadMeshGeometry actually produces geometry — with a known inner and
 * outer radius, so findBoundaryLoops has a ground-truth answer to check
 * against: exactly two boundary loops (inner rim + outer rim).
 */
function buildAnnulusGeometry(innerRadius: number, outerRadius: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const outerA = new THREE.Vector3(outerRadius * Math.cos(a0), outerRadius * Math.sin(a0), 0);
    const outerB = new THREE.Vector3(outerRadius * Math.cos(a1), outerRadius * Math.sin(a1), 0);
    const innerA = new THREE.Vector3(innerRadius * Math.cos(a0), innerRadius * Math.sin(a0), 0);
    const innerB = new THREE.Vector3(innerRadius * Math.cos(a1), innerRadius * Math.sin(a1), 0);
    // Two triangles per quad segment of the ring.
    for (const tri of [
      [outerA, outerB, innerA],
      [innerA, outerB, innerB],
    ]) {
      for (const p of tri) positions.push(p.x, p.y, p.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

describe("findBoundaryLoops", () => {
  it("finds exactly two loops (inner + outer rim) on a flat annulus, matching the known radii", () => {
    const innerRadius = 3;
    const outerRadius = 10;
    const geometry = buildAnnulusGeometry(innerRadius, outerRadius, 32);

    const loops = findBoundaryLoops(geometry);
    expect(loops).toHaveLength(2);

    const radii = loops
      .map((loop) => fitCircleLeastSquares(loop.points))
      .filter((fit): fit is NonNullable<typeof fit> => fit !== null)
      .map((fit) => fit.radius)
      .sort((a, b) => a - b);

    expect(radii).toHaveLength(2);
    expect(radii[0]).toBeCloseTo(innerRadius, 2);
    expect(radii[1]).toBeCloseTo(outerRadius, 2);
  });

  it("finds no boundary loops on a fully closed mesh (a cube — every edge shared by exactly 2 triangles)", () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const loops = findBoundaryLoops(geometry);
    expect(loops).toHaveLength(0);
  });

  it("each loop's points are all within tolerance of the same radius from its own centroid", () => {
    const geometry = buildAnnulusGeometry(4, 9, 24);
    const loops = findBoundaryLoops(geometry);
    for (const loop of loops) {
      const distances = loop.points.map((p) => p.distanceTo(loop.centroid));
      const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
      for (const d of distances) {
        expect(Math.abs(d - mean)).toBeLessThan(0.01);
      }
    }
  });
});

describe("findNearestLoop", () => {
  it("matches a point that is exactly one of a loop's own vertices", () => {
    const geometry = buildAnnulusGeometry(3, 10, 32);
    const loops = findBoundaryLoops(geometry);
    const target = loops[0].points[5].clone();
    const found = findNearestLoop(loops, target, 1e-3);
    expect(found).toBe(loops[0]);
  });

  it("returns null for a point far from every loop", () => {
    const geometry = buildAnnulusGeometry(3, 10, 32);
    const loops = findBoundaryLoops(geometry);
    const farPoint = new THREE.Vector3(1000, 1000, 1000);
    expect(findNearestLoop(loops, farPoint, 1e-3)).toBeNull();
  });

  it("returns null for a point near a loop but outside maxDistance", () => {
    const geometry = buildAnnulusGeometry(3, 10, 32);
    const loops = findBoundaryLoops(geometry);
    const nearMiss = loops[0].points[0].clone().add(new THREE.Vector3(0.5, 0, 0));
    expect(findNearestLoop(loops, nearMiss, 1e-3)).toBeNull();
  });
});
