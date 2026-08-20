import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { detectCylindricalHoles } from "./holeDetection.js";

/**
 * Builds a non-indexed cylindrical tube — like a raw STL export, every
 * triangle gets its own copy of each vertex, exercising the
 * position-based (not index-based) adjacency detectCylindricalHoles relies
 * on. Winding is reversed relative to a normal outward-facing cylinder side
 * wall, so face normals point *toward* the Z axis — i.e. this is the inner
 * wall of a bore, not a solid rod.
 */
function buildInwardFacingTube(radiusMm: number, heightMm: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    const theta0 = (i / segments) * Math.PI * 2;
    const theta1 = ((i + 1) / segments) * Math.PI * 2;
    const b0: [number, number, number] = [radiusMm * Math.cos(theta0), radiusMm * Math.sin(theta0), 0];
    const b1: [number, number, number] = [radiusMm * Math.cos(theta1), radiusMm * Math.sin(theta1), 0];
    const t0: [number, number, number] = [radiusMm * Math.cos(theta0), radiusMm * Math.sin(theta0), heightMm];
    const t1: [number, number, number] = [radiusMm * Math.cos(theta1), radiusMm * Math.sin(theta1), heightMm];
    positions.push(...b0, ...t0, ...b1);
    positions.push(...b1, ...t0, ...t1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

describe("detectCylindricalHoles", () => {
  it("finds a 5mm-diameter bore within 0.1mm", () => {
    const geometry = buildInwardFacingTube(2.5, 3, 24);

    const holes = detectCylindricalHoles(geometry);

    expect(holes).toHaveLength(1);
    expect(holes[0].axis).toBe(2);
    expect(holes[0].diameterMm).toBeCloseTo(5, 1);
    expect(Math.abs(holes[0].diameterMm - 5)).toBeLessThan(0.1);
  });

  it("does not report a solid rod (outward-facing cylinder) as a hole", () => {
    const geometry = new THREE.CylinderGeometry(2.5, 2.5, 3, 24, 1, true);

    const holes = detectCylindricalHoles(geometry);

    expect(holes).toHaveLength(0);
  });

  it("returns nothing for a plain box", () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10);

    const holes = detectCylindricalHoles(geometry);

    expect(holes).toHaveLength(0);
  });
});
