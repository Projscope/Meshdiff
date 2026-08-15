import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { fitCircleLeastSquares } from "./circleFit";
import { findCircularFeatureLoops, findNearestLoop, loopCircularityRelativeError } from "./circleDetect";

/**
 * Builds a flat annulus (washer) as a non-indexed triangle soup — matching
 * how loadMeshGeometry actually produces geometry — with a known inner and
 * outer radius. This mesh has real naked boundary edges (it's an open
 * shell, not watertight), so it also exercises that path.
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

/**
 * Builds a fully closed (watertight) cylinder — side wall + both end caps —
 * with a known radius. Every edge is shared by exactly 2 triangles (no
 * naked edges anywhere), but the rim where the vertical wall meets each
 * flat cap is a sharp ~90° crease at that known radius — this is the
 * real-world case a 3D-printable file's rim/hole actually looks like:
 * topologically closed, but with a genuine sharp edge.
 */
function buildClosedCylinderGeometry(radius: number, height: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    for (const p of [a, b, c]) positions.push(p.x, p.y, p.z);
  };
  const ringPoint = (radiusAt: number, angle: number, z: number) =>
    new THREE.Vector3(radiusAt * Math.cos(angle), radiusAt * Math.sin(angle), z);

  const bottomCenter = new THREE.Vector3(0, 0, 0);
  const topCenter = new THREE.Vector3(0, 0, height);

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const bottomA = ringPoint(radius, a0, 0);
    const bottomB = ringPoint(radius, a1, 0);
    const topA = ringPoint(radius, a0, height);
    const topB = ringPoint(radius, a1, height);

    // Side wall (2 triangles per segment).
    pushTri(bottomA, bottomB, topA);
    pushTri(topA, bottomB, topB);
    // Bottom cap fan and top cap fan.
    pushTri(bottomCenter, bottomB, bottomA);
    pushTri(topCenter, topA, topB);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

describe("findCircularFeatureLoops", () => {
  it("finds two loops (inner + outer rim) via naked edges on an open annulus", () => {
    const innerRadius = 3;
    const outerRadius = 10;
    const geometry = buildAnnulusGeometry(innerRadius, outerRadius, 32);

    const loops = findCircularFeatureLoops(geometry);
    expect(loops).toHaveLength(2);

    const radii = loops
      .map((loop) => fitCircleLeastSquares(loop.points))
      .filter((fit): fit is NonNullable<typeof fit> => fit !== null)
      .map((fit) => fit.radius)
      .sort((a, b) => a - b);

    expect(radii[0]).toBeCloseTo(innerRadius, 2);
    expect(radii[1]).toBeCloseTo(outerRadius, 2);
  });

  it("finds no loops on a fully closed mesh with no sharp creases (a UV sphere)", () => {
    const geometry = new THREE.SphereGeometry(5, 24, 16).toNonIndexed();
    expect(findCircularFeatureLoops(geometry)).toHaveLength(0);
  });

  it("finds no loops on a closed mesh whose only creases aren't 2-regular (a cube's corners meet 3 edges)", () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    expect(findCircularFeatureLoops(geometry)).toHaveLength(0);
  });

  it("finds the rim crease on a fully watertight cylinder — no naked edges anywhere, only a sharp angle", () => {
    const radius = 6;
    const geometry = buildClosedCylinderGeometry(radius, 12, 32);

    // Sanity check the fixture is actually watertight: an extreme crease
    // threshold (only a genuinely naked edge could ever qualify) must find
    // nothing, or this test isn't testing what it claims to.
    expect(findCircularFeatureLoops(geometry, 179)).toHaveLength(0);

    const loops = findCircularFeatureLoops(geometry);
    expect(loops.length).toBeGreaterThanOrEqual(2); // top rim + bottom rim
    for (const loop of loops) {
      const fit = fitCircleLeastSquares(loop.points)!;
      expect(fit.radius).toBeCloseTo(radius, 1);
    }
  });

  it("respects a tighter crease-angle threshold (a shallower rim than the threshold isn't detected)", () => {
    const geometry = buildClosedCylinderGeometry(6, 12, 32);
    // The cylinder's rim is a ~90° crease — a 170° threshold demands an
    // almost-flat mesh to register as a feature, which this isn't.
    expect(findCircularFeatureLoops(geometry, 170)).toHaveLength(0);
  });
});

describe("loopCircularityRelativeError", () => {
  it("is near zero for points that actually lie on a circle", () => {
    const radius = 10;
    const points = Array.from(
      { length: 20 },
      (_, i) => new THREE.Vector3(radius * Math.cos((i / 20) * Math.PI * 2), radius * Math.sin((i / 20) * Math.PI * 2), 0),
    );
    const fit = fitCircleLeastSquares(points)!;
    expect(loopCircularityRelativeError(points, fit)).toBeLessThan(0.001);
  });

  it("is large for points sampled around a square's perimeter fit to their best circle", () => {
    // Just the 4 corners wouldn't do it — 4 points spaced symmetrically
    // around a common center are always exactly concyclic by construction,
    // regardless of the shape connecting them. Sampling along the edges
    // too (not just corners) is what actually reveals non-circularity:
    // edge-midpoints sit closer to the center (distance 5) than corners do
    // (distance 5√2 ≈ 7.07).
    const points: THREE.Vector3[] = [];
    const half = 5;
    // Per-edge sampling (5 points per edge, corners included).
    const edges: Array<[[number, number], [number, number]]> = [
      [[half, half], [-half, half]],
      [[-half, half], [-half, -half]],
      [[-half, -half], [half, -half]],
      [[half, -half], [half, half]],
    ];
    for (const [[x0, y0], [x1, y1]] of edges) {
      for (let s = 0; s < 5; s++) {
        const t = s / 5;
        points.push(new THREE.Vector3(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0));
      }
    }
    const fit = fitCircleLeastSquares(points)!;
    // A square's edge midpoints sit noticeably closer to center than its
    // corners do — well above the ~8% default threshold.
    expect(loopCircularityRelativeError(points, fit)).toBeGreaterThan(0.08);
  });
});

describe("findNearestLoop", () => {
  it("matches a point that is exactly one of a loop's own vertices", () => {
    const geometry = buildAnnulusGeometry(3, 10, 32);
    const loops = findCircularFeatureLoops(geometry);
    const target = loops[0].points[5].clone();
    const found = findNearestLoop(loops, target, 1e-3);
    expect(found).toBe(loops[0]);
  });

  it("returns null for a point far from every loop", () => {
    const geometry = buildAnnulusGeometry(3, 10, 32);
    const loops = findCircularFeatureLoops(geometry);
    const farPoint = new THREE.Vector3(1000, 1000, 1000);
    expect(findNearestLoop(loops, farPoint, 1e-3)).toBeNull();
  });

  it("returns null for a point near a loop but outside maxDistance", () => {
    const geometry = buildAnnulusGeometry(3, 10, 32);
    const loops = findCircularFeatureLoops(geometry);
    const nearMiss = loops[0].points[0].clone().add(new THREE.Vector3(0.5, 0, 0));
    expect(findNearestLoop(loops, nearMiss, 1e-3)).toBeNull();
  });
});
