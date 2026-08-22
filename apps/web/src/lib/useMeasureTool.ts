import { useRef, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { fitCircleThroughThreePoints, type CircleFit } from "./circleFit";
import { findCircularFeatureLoops, findNearestLoop, fitCircleLeastSquares, type BoundaryLoop } from "./circleDetect";

// The scene wraps its content in <group rotation={[-Math.PI/2,0,0]}> (see
// ModelScene.tsx) to lay the Z-up model flat on drei's Y-up grid. R3F
// pointer events report positions in WORLD space, which already has that
// rotation baked in — this is its inverse, used to convert back to the
// group's local space before rendering a point inside that same group.
const GROUP_ROTATION_INVERSE = new THREE.Matrix4().makeRotationX(Math.PI / 2);

function computeUniqueVertices(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const position = geometry.getAttribute("position");
  const seen = new Map<string, THREE.Vector3>();
  const EPS = 1e-4;
  for (let i = 0; i < position.count; i++) {
    const vertex = new THREE.Vector3().fromBufferAttribute(position, i);
    const key = `${Math.round(vertex.x / EPS)},${Math.round(vertex.y / EPS)},${Math.round(vertex.z / EPS)}`;
    if (!seen.has(key)) seen.set(key, vertex);
  }
  return [...seen.values()];
}

function computeUniqueEdges(geometry: THREE.BufferGeometry): Array<[THREE.Vector3, THREE.Vector3]> {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const EPS = 1e-4;
  const keyOf = (v: THREE.Vector3) => `${Math.round(v.x / EPS)},${Math.round(v.y / EPS)},${Math.round(v.z / EPS)}`;
  const seenEdges = new Set<string>();
  const edges: Array<[THREE.Vector3, THREE.Vector3]> = [];

  function addEdge(a: THREE.Vector3, b: THREE.Vector3) {
    const keyA = keyOf(a);
    const keyB = keyOf(b);
    if (keyA === keyB) return;
    const edgeKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
    if (seenEdges.has(edgeKey)) return;
    seenEdges.add(edgeKey);
    edges.push([a, b]);
  }

  const vertexAt = (i: number) => new THREE.Vector3().fromBufferAttribute(position, i);
  const triangleCount = index ? index.count / 3 : position.count / 3;
  for (let t = 0; t < triangleCount; t++) {
    const [ia, ib, ic] = index
      ? [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)]
      : [t * 3, t * 3 + 1, t * 3 + 2];
    const a = vertexAt(ia);
    const b = vertexAt(ib);
    const c = vertexAt(ic);
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  return edges;
}

function clipSegmentToCircle(
  a: THREE.Vector3,
  b: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): [THREE.Vector3, THREE.Vector3] | null {
  const direction = new THREE.Vector3().subVectors(b, a);
  const toStart = new THREE.Vector3().subVectors(a, center);
  const A = direction.dot(direction);
  if (A === 0) return null;
  const B = 2 * toStart.dot(direction);
  const C = toStart.dot(toStart) - radius * radius;
  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0) return null;
  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = Math.max(0, (-B - sqrtDiscriminant) / (2 * A));
  const t2 = Math.min(1, (-B + sqrtDiscriminant) / (2 * A));
  if (t1 >= t2) return null;
  return [a.clone().addScaledVector(direction, t1), a.clone().addScaledVector(direction, t2)];
}

export interface MeasureTool {
  measureMode: "distance" | "radius";
  isMeasuring: boolean;
  measureA: [number, number, number] | null;
  measureB: [number, number, number] | null;
  measureHover: [number, number, number] | null;
  radiusPoints: Array<[number, number, number]>;
  radiusPreviewFit: CircleFit | null;
  radiusCommittedFit: CircleFit | null;
  radiusPreviewLoopPoints: Array<[number, number, number]> | null;
  radiusCommittedLoopPoints: Array<[number, number, number]> | null;
  nearbyVertices: [number, number, number][];
  nearbyEdges: Array<[[number, number, number], [number, number, number]]>;
  isToolActive: (mode: "distance" | "radius") => boolean;
  toggleMeasuring: (mode: "distance" | "radius") => void;
  clearMeasurement: () => void;
  /** Call once whenever the mesh's geometry (re)loads, so the vertex/edge
   * snap index and hole-boundary detection are ready before any hover. */
  setGeometry: (geometry: THREE.BufferGeometry, boundingBox: [number, number, number]) => void;
  /** Wire onto the mesh's onPointerMove. No-ops when not measuring. */
  onPointerMove: (event: ThreeEvent<MouseEvent>) => void;
  /** Wire onto the mesh's onClick. Returns true if it was consumed (i.e.
   * the caller shouldn't also treat this click as something else). */
  onClick: (event: ThreeEvent<MouseEvent>) => boolean;
  /** Wire onto the mesh's onPointerOut. */
  onPointerOut: () => void;
}

/** Self-contained click-to-measure tool: distance between two points, or a
 * hole/boss radius (auto-detected on hover, or fit through 3 manual
 * points). Point picking is freeform across the surface, magnetizing to
 * the nearest vertex/edge only when the cursor is genuinely close to one
 * (see snappedOrSurfacePoint below) — same "close area" highlight/snap
 * behavior as comment placement in VersionDetailPage.tsx, which has its
 * own copy of this same logic (not deduplicated against this hook yet). */
export function useMeasureTool(): MeasureTool {
  const [measureMode, setMeasureMode] = useState<"distance" | "radius">("distance");
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureA, setMeasureA] = useState<[number, number, number] | null>(null);
  const [measureB, setMeasureB] = useState<[number, number, number] | null>(null);
  const [measureHover, setMeasureHover] = useState<[number, number, number] | null>(null);
  const [radiusPoints, setRadiusPoints] = useState<Array<[number, number, number]>>([]);
  const [radiusPreviewFit, setRadiusPreviewFit] = useState<CircleFit | null>(null);
  const [radiusCommittedFit, setRadiusCommittedFit] = useState<CircleFit | null>(null);
  const [radiusPreviewLoopPoints, setRadiusPreviewLoopPoints] = useState<Array<[number, number, number]> | null>(null);
  const [radiusCommittedLoopPoints, setRadiusCommittedLoopPoints] = useState<Array<[number, number, number]> | null>(
    null,
  );
  const [nearbyVertices, setNearbyVertices] = useState<[number, number, number][]>([]);
  const [nearbyEdges, setNearbyEdges] = useState<Array<[[number, number, number], [number, number, number]]>>([]);

  const uniqueVerticesRef = useRef<THREE.Vector3[]>([]);
  const uniqueEdgesRef = useRef<Array<[THREE.Vector3, THREE.Vector3]>>([]);
  const boundaryLoopsRef = useRef<BoundaryLoop[]>([]);
  const boundingBoxRef = useRef<[number, number, number]>([0, 0, 0]);

  function setGeometry(geometry: THREE.BufferGeometry, boundingBox: [number, number, number]) {
    uniqueVerticesRef.current = computeUniqueVertices(geometry);
    uniqueEdgesRef.current = computeUniqueEdges(geometry);
    boundaryLoopsRef.current = findCircularFeatureLoops(geometry);
    boundingBoxRef.current = boundingBox;
  }

  function snapHighlightRadius(): number {
    const maxDimension = Math.max(...boundingBoxRef.current);
    return maxDimension > 0 ? Math.max(maxDimension * 0.04, 0.5) : 1;
  }

  // Deliberately much tighter than snapHighlightRadius() above — that one's
  // a broad "here's what's nearby" preview area, not a snap distance.
  function snapMagnetThreshold(): number {
    const maxDimension = Math.max(...boundingBoxRef.current);
    return maxDimension > 0 ? Math.max(maxDimension * 0.01, 0.15) : 0.3;
  }

  function nearestSnapPoint(event: ThreeEvent<MouseEvent>): THREE.Vector3 | null {
    if (!event.face || !(event.object instanceof THREE.Mesh)) return null;
    const position = event.object.geometry.getAttribute("position");
    const matrixWorld = event.object.matrixWorld;
    const vertices = [event.face.a, event.face.b, event.face.c].map((index) =>
      new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(matrixWorld),
    );

    let closest = vertices[0];
    let closestDist = vertices[0].distanceTo(event.point);
    for (const vertex of vertices.slice(1)) {
      const dist = vertex.distanceTo(event.point);
      if (dist < closestDist) {
        closestDist = dist;
        closest = vertex;
      }
    }

    const edgePoint = new THREE.Vector3();
    const edges: Array<[THREE.Vector3, THREE.Vector3]> = [
      [vertices[0], vertices[1]],
      [vertices[1], vertices[2]],
      [vertices[2], vertices[0]],
    ];
    for (const [start, end] of edges) {
      new THREE.Line3(start, end).closestPointToPoint(event.point, true, edgePoint);
      const dist = edgePoint.distanceTo(event.point);
      if (dist < closestDist) {
        closestDist = dist;
        closest = edgePoint.clone();
      }
    }

    return closest.applyMatrix4(GROUP_ROTATION_INVERSE);
  }

  function snappedOrSurfacePoint(event: ThreeEvent<MouseEvent>): THREE.Vector3 | null {
    if (!event.face) return null;
    const surfacePoint = event.point.clone().applyMatrix4(GROUP_ROTATION_INVERSE);
    const snapped = nearestSnapPoint(event);
    if (snapped && snapped.distanceTo(surfacePoint) <= snapMagnetThreshold()) {
      return snapped;
    }
    return surfacePoint;
  }

  function updateNearbyHighlights(center: THREE.Vector3) {
    const radius = snapHighlightRadius();
    const vertices = uniqueVerticesRef.current
      .filter((vertex) => vertex.distanceTo(center) <= radius)
      .map((vertex): [number, number, number] => [vertex.x, vertex.y, vertex.z]);
    setNearbyVertices(vertices.length > 60 ? vertices.slice(0, 60) : vertices);

    const edges: Array<[[number, number, number], [number, number, number]]> = [];
    for (const [a, b] of uniqueEdgesRef.current) {
      const clipped = clipSegmentToCircle(a, b, center, radius);
      if (!clipped) continue;
      const [p1, p2] = clipped;
      edges.push([
        [p1.x, p1.y, p1.z],
        [p2.x, p2.y, p2.z],
      ]);
      if (edges.length >= 60) break;
    }
    setNearbyEdges(edges);
  }

  function clearHighlights() {
    setNearbyVertices([]);
    setNearbyEdges([]);
  }

  function isToolActive(mode: "distance" | "radius"): boolean {
    if (measureMode !== mode) return false;
    if (isMeasuring) return true;
    return mode === "distance" ? !!(measureA || measureB) : radiusPoints.length > 0 || !!radiusCommittedFit;
  }

  function startMeasuring(mode: "distance" | "radius") {
    setMeasureMode(mode);
    setIsMeasuring(true);
    setMeasureA(null);
    setMeasureB(null);
    setRadiusPoints([]);
    setRadiusPreviewFit(null);
    setRadiusPreviewLoopPoints(null);
    setRadiusCommittedFit(null);
    setRadiusCommittedLoopPoints(null);
    setMeasureHover(null);
    clearHighlights();
  }

  function clearMeasurement() {
    setIsMeasuring(false);
    setMeasureA(null);
    setMeasureB(null);
    setRadiusPoints([]);
    setRadiusPreviewFit(null);
    setRadiusPreviewLoopPoints(null);
    setRadiusCommittedFit(null);
    setRadiusCommittedLoopPoints(null);
    setMeasureHover(null);
    clearHighlights();
  }

  function toggleMeasuring(mode: "distance" | "radius") {
    if (isToolActive(mode)) {
      clearMeasurement();
    } else {
      startMeasuring(mode);
    }
  }

  function onPointerMove(event: ThreeEvent<MouseEvent>) {
    if (!isMeasuring) return;
    event.stopPropagation();

    // Hole/boss auto-detect searches off the true cursor position on the
    // surface, not a vertex/edge snap — nearestSnapPoint() only considers
    // the 3 corners of whichever single triangle the raycast happens to
    // hit, so if that triangle's nearest corner is a cap-interior vertex
    // rather than one actually on the hole's rim (extremely common: most
    // triangles touching a hole have at most 1-2 of their 3 corners on the
    // boundary), it returns a point that's genuinely ~1mm+ from the real
    // rim — no amount of tolerance on an exact-vertex match fixes that,
    // since it's not floating-point noise, it's the wrong vertex entirely.
    // Searching from the raw surface point against the loop's own points
    // (like a snap magnet, not an exact-match) finds the real rim
    // regardless of which triangle got hit.
    if (measureMode === "radius" && event.face) {
      const surfacePoint = event.point.clone().applyMatrix4(GROUP_ROTATION_INVERSE);
      const loop = findNearestLoop(boundaryLoopsRef.current, surfacePoint, snapHighlightRadius());
      if (loop) {
        setRadiusPreviewFit(fitCircleLeastSquares(loop.points));
        setRadiusPreviewLoopPoints(loop.points.map((p): [number, number, number] => [p.x, p.y, p.z]));
        setMeasureHover(null);
        clearHighlights();
        return;
      }
      setRadiusPreviewFit(null);
      setRadiusPreviewLoopPoints(null);
    }

    const point = snappedOrSurfacePoint(event);
    setMeasureHover(point ? [point.x, point.y, point.z] : null);
    if (point) {
      updateNearbyHighlights(point);
    } else {
      clearHighlights();
    }
  }

  function onClick(event: ThreeEvent<MouseEvent>): boolean {
    if (!isMeasuring) return false;
    event.stopPropagation();

    if (measureMode === "radius" && radiusPreviewFit) {
      // Hovering a detected hole/rim — one click confirms its full-loop
      // fit instead of requiring 3 manual points.
      setRadiusCommittedFit(radiusPreviewFit);
      setRadiusCommittedLoopPoints(radiusPreviewLoopPoints);
      setRadiusPreviewFit(null);
      setRadiusPreviewLoopPoints(null);
      setIsMeasuring(false);
      setMeasureHover(null);
      return true;
    }

    const snapped = snappedOrSurfacePoint(event);
    if (!snapped) return true;
    const point: [number, number, number] = [snapped.x, snapped.y, snapped.z];
    if (measureMode === "distance") {
      if (!measureA) {
        setMeasureA(point);
      } else {
        setMeasureB(point);
        setIsMeasuring(false);
        setMeasureHover(null);
        clearHighlights();
      }
    } else {
      setRadiusPoints((prev) => {
        const next = [...prev, point];
        if (next.length >= 3) {
          setRadiusCommittedLoopPoints(null); // manual 3-point fit — no real loop backs it
          setRadiusCommittedFit(
            fitCircleThroughThreePoints(
              new THREE.Vector3(...next[0]),
              new THREE.Vector3(...next[1]),
              new THREE.Vector3(...next[2]),
            ),
          );
          setIsMeasuring(false);
          setMeasureHover(null);
          clearHighlights();
        }
        return next;
      });
    }
    return true;
  }

  function onPointerOut() {
    setMeasureHover(null);
    setRadiusPreviewFit(null);
    setRadiusPreviewLoopPoints(null);
    clearHighlights();
  }

  return {
    measureMode,
    isMeasuring,
    measureA,
    measureB,
    measureHover,
    radiusPoints,
    radiusPreviewFit,
    radiusCommittedFit,
    radiusPreviewLoopPoints,
    radiusCommittedLoopPoints,
    nearbyVertices,
    nearbyEdges,
    isToolActive,
    toggleMeasuring,
    clearMeasurement,
    setGeometry,
    onPointerMove,
    onClick,
    onPointerOut,
  };
}
