import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { repairMeshGeometry } from "./repairMesh.js";

describe("repairMeshGeometry", () => {
  it("welds a box's per-face-duplicated corners down to 8 unique vertices", () => {
    // BoxGeometry gives each of its 8 corners a separate position entry per
    // adjacent face (24 total) so normals/UVs can differ per face — a
    // textbook case of coincident-but-not-index-shared vertices to weld.
    const box = new THREE.BoxGeometry(10, 10, 10);

    const { geometry, report } = repairMeshGeometry(box);

    expect(report.weldedVertexCount).toBe(16); // 24 - 8
    expect(report.removedDegenerateTriangleCount).toBe(0);
    expect(report.isManifold).toBe(true);
    expect(geometry.getAttribute("position").count).toBe(8);
  });

  it("drops a degenerate (repeated-vertex) triangle", () => {
    const positions = [
      // A real triangle
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      // A degenerate one — two corners at the same point
      2, 0, 0, 2, 0, 0, 2, 1, 0,
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    const { geometry: repaired, report } = repairMeshGeometry(geometry);

    expect(report.removedDegenerateTriangleCount).toBe(1);
    expect((repaired.getIndex()?.count ?? 0) / 3).toBe(1);
  });

  it("flags an open boundary when a face is missing from an otherwise-closed solid", () => {
    // A tetrahedron with one of its 4 faces omitted — every edge of the
    // missing face (B-D, D-C, C-B) now belongs to only one remaining
    // triangle instead of two.
    const a = [0, 0, 0];
    const b = [1, 0, 0];
    const c = [0, 1, 0];
    const d = [0, 0, 1];
    const positions = [...a, ...b, ...c, ...a, ...c, ...d, ...a, ...d, ...b];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    const { report } = repairMeshGeometry(geometry);

    expect(report.removedDegenerateTriangleCount).toBe(0);
    expect(report.isManifold).toBe(false);
    expect(report.openBoundaryEdgeCount).toBe(3);
    expect(report.openBoundaryLoopCount).toBe(1);
    expect(report.nonManifoldEdgeCount).toBe(0);
  });

  it("reports a fully closed mesh as manifold with no boundary edges", () => {
    const box = new THREE.BoxGeometry(10, 10, 10);

    const { report } = repairMeshGeometry(box);

    expect(report.openBoundaryEdgeCount).toBe(0);
    expect(report.openBoundaryLoopCount).toBe(0);
    expect(report.isManifold).toBe(true);
  });
});
