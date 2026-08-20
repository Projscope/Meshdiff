import * as THREE from "three";

export interface MeshRepairReport {
  weldedVertexCount: number;
  removedDegenerateTriangleCount: number;
  openBoundaryEdgeCount: number;
  openBoundaryLoopCount: number;
  nonManifoldEdgeCount: number;
  isManifold: boolean;
}

const EMPTY_REPORT: MeshRepairReport = {
  weldedVertexCount: 0,
  removedDegenerateTriangleCount: 0,
  openBoundaryEdgeCount: 0,
  openBoundaryLoopCount: 0,
  nonManifoldEdgeCount: 0,
  isManifold: true,
};

/**
 * Conservative mesh cleanup: welds coincident vertices into a compact
 * indexed geometry, drops degenerate (zero-area) triangles, and reports
 * whether the result is manifold. Doesn't attempt to fill holes or fix
 * non-manifold topology — per CLAUDE.md's error-handling philosophy this
 * only needs to "render what you can, show a warning banner", not solve
 * arbitrary CAD-repair problems.
 *
 * Welding runs unconditionally and isn't itself a defect signal: parsed
 * STL/OBJ/3MF geometry is non-indexed by the time it reaches here (see
 * meshParseWorker.ts), so every shared vertex naturally appears as several
 * separate buffer entries — welding just recovers the indexed structure.
 * The real "this mesh has a problem" signals are
 * `removedDegenerateTriangleCount > 0` and `!isManifold`.
 */
export function repairMeshGeometry(
  geometry: THREE.BufferGeometry,
  options?: { weldToleranceMm?: number },
): { geometry: THREE.BufferGeometry; report: MeshRepairReport } {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!position || position.count === 0) {
    return { geometry, report: EMPTY_REPORT };
  }

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const diagonalMm = box ? box.getSize(new THREE.Vector3()).length() : 1;
  const weldToleranceMm = options?.weldToleranceMm ?? Math.max(diagonalMm * 1e-5, 1e-4);

  const key = (x: number, y: number, z: number) =>
    `${Math.round(x / weldToleranceMm)}:${Math.round(y / weldToleranceMm)}:${Math.round(z / weldToleranceMm)}`;
  const idByKey = new Map<string, number>();
  const weldedPositions: number[] = [];
  const idByBufferIndex = new Int32Array(position.count);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const k = key(x, y, z);
    let id = idByKey.get(k);
    if (id === undefined) {
      id = weldedPositions.length / 3;
      idByKey.set(k, id);
      weldedPositions.push(x, y, z);
    }
    idByBufferIndex[i] = id;
  }
  const weldedVertexCount = position.count - weldedPositions.length / 3;

  const sourceIndex = geometry.getIndex();
  const sourceTriangleCount = sourceIndex ? sourceIndex.count / 3 : position.count / 3;

  // Strip degenerate triangles: a repeated vertex after welding, or three
  // distinct (but collinear) vertices with zero cross-product area.
  const keptIndices: number[] = [];
  let removedDegenerateTriangleCount = 0;
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  for (let t = 0; t < sourceTriangleCount; t++) {
    const i = t * 3;
    const bufA = sourceIndex ? sourceIndex.getX(i) : i;
    const bufB = sourceIndex ? sourceIndex.getX(i + 1) : i + 1;
    const bufC = sourceIndex ? sourceIndex.getX(i + 2) : i + 2;
    const a = idByBufferIndex[bufA];
    const b = idByBufferIndex[bufB];
    const c = idByBufferIndex[bufC];

    if (a === b || b === c || c === a) {
      removedDegenerateTriangleCount++;
      continue;
    }

    v1.set(weldedPositions[a * 3], weldedPositions[a * 3 + 1], weldedPositions[a * 3 + 2]);
    v2.set(weldedPositions[b * 3], weldedPositions[b * 3 + 1], weldedPositions[b * 3 + 2]);
    v3.set(weldedPositions[c * 3], weldedPositions[c * 3 + 1], weldedPositions[c * 3 + 2]);
    const area = v2.clone().sub(v1).cross(v3.clone().sub(v1)).length() * 0.5;
    if (area <= 0) {
      removedDegenerateTriangleCount++;
      continue;
    }

    keptIndices.push(a, b, c);
  }

  // Manifold check: every edge of a closed, well-formed solid is shared by
  // exactly 2 triangles. Count===1 is an open boundary; count>2 is
  // non-manifold (e.g. a seam where two unrelated shells touch).
  const edgeCount = new Map<string, number>();
  for (let t = 0; t < keptIndices.length / 3; t++) {
    const a = keptIndices[t * 3];
    const b = keptIndices[t * 3 + 1];
    const c = keptIndices[t * 3 + 2];
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = x < y ? `${x}:${y}` : `${y}:${x}`;
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
  }

  let openBoundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  // Union-find over the vertices touched by boundary edges, to count
  // connected boundary loops without walking actual edge cycles.
  const boundaryParent = new Map<number, number>();
  function find(x: number): number {
    let root = x;
    while (boundaryParent.get(root) !== root) root = boundaryParent.get(root)!;
    boundaryParent.set(x, root);
    return root;
  }
  function union(x: number, y: number) {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) boundaryParent.set(rootX, rootY);
  }

  for (const [edgeKey, count] of edgeCount) {
    if (count === 1) {
      openBoundaryEdgeCount++;
      const [xStr, yStr] = edgeKey.split(":");
      const x = Number(xStr);
      const y = Number(yStr);
      if (!boundaryParent.has(x)) boundaryParent.set(x, x);
      if (!boundaryParent.has(y)) boundaryParent.set(y, y);
      union(x, y);
    } else if (count > 2) {
      nonManifoldEdgeCount++;
    }
  }

  const boundaryRoots = new Set<number>();
  for (const vertexId of boundaryParent.keys()) boundaryRoots.add(find(vertexId));
  const openBoundaryLoopCount = boundaryRoots.size;

  const repaired = new THREE.BufferGeometry();
  repaired.setAttribute("position", new THREE.Float32BufferAttribute(weldedPositions, 3));
  repaired.setIndex(keptIndices);
  repaired.computeVertexNormals();

  return {
    geometry: repaired,
    report: {
      weldedVertexCount,
      removedDegenerateTriangleCount,
      openBoundaryEdgeCount,
      openBoundaryLoopCount,
      nonManifoldEdgeCount,
      isManifold: openBoundaryEdgeCount === 0 && nonManifoldEdgeCount === 0,
    },
  };
}
