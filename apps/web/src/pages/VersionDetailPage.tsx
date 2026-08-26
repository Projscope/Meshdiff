import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as THREE from "three";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Bounds, Line, OrbitControls } from "@react-three/drei";
import {
  getVersion,
  getDiff,
  getProject,
  listComments,
  createComment,
  deleteComment,
  type VersionDetail,
  type CommentSummary,
  type ProjectDetail,
} from "../lib/projectsApi";
import { useAuth } from "../lib/AuthProvider";
import { useAccountStatus } from "../components/ProjectsLayout";
import ConfirmDialog from "../components/ConfirmDialog";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import { extensionOf, loadMeshGeometry } from "../engine/loadMesh";
import { extractThreeMFProperties, loadMeshForDisplay, type ThreeMFProperties } from "../engine/load3mfDisplayExtras";
import PrintabilityBadge from "../components/PrintabilityBadge";
import PrintabilityRulesTooltip from "../components/PrintabilityRulesTooltip";
import DetailedStatsPanel from "../components/DetailedStatsPanel";
import CommentsPanel from "../components/CommentsPanel";
import CommentPopover from "../components/CommentPopover";
import PendingCommentPopover from "../components/PendingCommentPopover";
import CommentPin from "../components/CommentPin";
import AxisLegend from "../components/AxisLegend";
import ModelScene from "../components/ModelScene";
import BoundsResetBridge from "../components/BoundsResetBridge";
import ZoomToFitBridge from "../components/ZoomToFitBridge";
import ControlSchemeSelect from "../components/ControlSchemeSelect";
import ShadingModeToggle from "../components/ShadingModeToggle";
import GridToggle from "../components/GridToggle";
import { useShadingMode } from "../lib/shadingMode";
import EdgeOverlay from "../components/EdgeOverlay";
import { useControlScheme, useOrbitMouseButtons } from "../lib/controlScheme";
import LoadingCube from "../components/LoadingCube";
import ThreeMFPropertiesPanel from "../components/ThreeMFPropertiesPanel";
import CollapsibleSection, { PropertyList, PropertyRow } from "../components/CollapsibleSection";
import PrintLogSection from "../components/PrintLogSection";
import MeasurementOverlay from "../components/MeasurementOverlay";
import RadiusOverlay from "../components/RadiusOverlay";
import { fitCircleThroughThreePoints, type CircleFit } from "../lib/circleFit";
import { findCircularFeatureLoops, findNearestLoop, fitCircleLeastSquares, type BoundaryLoop } from "../lib/circleDetect";

// The scene wraps its content in <group rotation={[-Math.PI/2,0,0]}> to lay
// the Z-up model flat on drei's Y-up grid (see the comment at that group
// below). R3F pointer events report positions in WORLD space, which already
// has that rotation baked in. The measurement overlay renders *inside* that
// same rotated group, so storing a world-space point there would double-apply
// the rotation and place markers nowhere near the actual click — this is the
// group's inverse rotation, used to convert back to its local space first.
const GROUP_ROTATION_INVERSE = new THREE.Matrix4().makeRotationX(Math.PI / 2);

// The comment mesh itself carries no extra transform of its own (no
// position/rotation/scale props on the <mesh> below) — it sits directly
// inside the rotated group, so its raw geometry-space vertices are already
// in that group's local space with no conversion needed, unlike the
// world-space event.point values elsewhere in this file.
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

// Same local-space reasoning as computeUniqueVertices — dedupes each
// triangle edge against the shared edge its neighboring triangle also
// contributes, keyed on its (rounded) endpoint pair regardless of winding.
// Trims an edge segment down to just the portion that falls inside the
// snap-radius circle, so a long edge that merely passes near the hover
// point doesn't get drawn end-to-end across the whole model — only the
// bit actually inside the "close area" indicator. Returns null when the
// segment doesn't intersect the circle within its own [a, b] bounds.
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

export default function VersionDetailPage() {
  const { projectId, versionId } = useParams<{ projectId: string; versionId: string }>();
  const { user } = useAuth();
  const { isPro } = useAccountStatus();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [diffStats, setDiffStats] = useState<VoxelDiffStats | null>(null);
  const [hasComparison, setHasComparison] = useState(false);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const zoomToFitRef = useRef<(() => void) | null>(null);
  const [controlScheme] = useControlScheme();
  const mouseButtons = useOrbitMouseButtons(controlScheme);
  const [shadingMode] = useShadingMode();
  const [hasVertexColors, setHasVertexColors] = useState(false);
  const [threeMFProperties, setThreeMFProperties] = useState<ThreeMFProperties | null>(null);

  // Re-fetches just the version's metadata (fresh signed URLs for the
  // print-log attachments) without re-running the full mesh-load pipeline
  // the main effect below does — the mesh itself hasn't changed.
  async function refreshVersion() {
    if (!projectId || !versionId) return;
    const result = await getVersion(projectId, versionId);
    if (result.success) setVersion(result.data);
  }
  const [boundingBox, setBoundingBox] = useState<[number, number, number]>([0, 0, 0]);
  const [gridPosition, setGridPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [gridFadeDistance, setGridFadeDistance] = useState(100);
  const [axisOrigin, setAxisOrigin] = useState<[number, number, number]>([0, 0, 0]);
  const [error, setError] = useState<string | null>(null);
  const [isMeshLoading, setIsMeshLoading] = useState(true);

  const [comments, setComments] = useState<CommentSummary[]>([]);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [pendingDeleteComment, setPendingDeleteComment] = useState<CommentSummary | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const [isPlacingComment, setIsPlacingComment] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<[number, number, number] | null>(null);
  const [pendingNormal, setPendingNormal] = useState<[number, number, number] | undefined>();
  const [isDraggingPin, setIsDraggingPin] = useState(false);
  const [commentSnapPreview, setCommentSnapPreview] = useState<[number, number, number] | null>(null);
  const [nearbyVertices, setNearbyVertices] = useState<[number, number, number][]>([]);
  const [nearbyEdges, setNearbyEdges] = useState<Array<[[number, number, number], [number, number, number]]>>([]);
  const uniqueVerticesRef = useRef<THREE.Vector3[]>([]);
  const uniqueEdgesRef = useRef<Array<[THREE.Vector3, THREE.Vector3]>>([]);

  const [measureMode, setMeasureMode] = useState<"distance" | "radius">("distance");
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureA, setMeasureA] = useState<[number, number, number] | null>(null);
  const [measureB, setMeasureB] = useState<[number, number, number] | null>(null);
  const [radiusPoints, setRadiusPoints] = useState<Array<[number, number, number]>>([]);
  const [measureHover, setMeasureHover] = useState<[number, number, number] | null>(null);
  // Every hole/rim boundary on the mesh, computed once when it loads — see
  // circleDetect.ts. Radius mode checks this on hover so a click on a real
  // hole measures its actual full edge loop (far more reliable than 3
  // manually-clicked points, which are sensitive to exactly which vertices
  // you happened to snap to) instead of always requiring 3 manual clicks.
  const [boundaryLoops, setBoundaryLoops] = useState<BoundaryLoop[]>([]);
  const [radiusPreviewFit, setRadiusPreviewFit] = useState<CircleFit | null>(null);
  const [radiusCommittedFit, setRadiusCommittedFit] = useState<CircleFit | null>(null);
  // The detected loop's own traced vertices, kept alongside its fit so the
  // overlay can highlight the actual mesh edge that was found (not just an
  // abstract circle) — null for the manual 3-point path, which has no real
  // loop backing it.
  const [radiusPreviewLoopPoints, setRadiusPreviewLoopPoints] = useState<Array<[number, number, number]> | null>(null);
  const [radiusCommittedLoopPoints, setRadiusCommittedLoopPoints] = useState<Array<[number, number, number]> | null>(null);

  useEffect(() => {
    if (!projectId || !versionId) return;
    let cancelled = false;
    setIsMeshLoading(true);

    Promise.all([getProject(projectId), getVersion(projectId, versionId)]).then(async ([projectResult, versionResult]) => {
      if (cancelled) return;
      if (projectResult.success) setProject(projectResult.data);
      if (!versionResult.success) {
        setError(versionResult.error);
        setIsMeshLoading(false);
        return;
      }
      setVersion(versionResult.data);

      // No previous version (v1): self-diff still yields real per-mesh
      // Version Stats/Printability values for the "B" side (same trick
      // finalize uses server-side) — just don't treat the zeroed-out
      // deltas as a real comparison for the Geometric Delta section.
      const versionAId = versionResult.data.previousVersionId ?? versionId;
      setHasComparison(versionResult.data.previousVersionId !== null);
      getDiff(versionAId, versionId).then((diffResult) => {
        if (!cancelled && diffResult.success) setDiffStats(diffResult.data);
      });

      const response = await fetch(versionResult.data.downloadUrl);
      const blob = await response.blob();
      const file = new File([blob], versionResult.data.fileName);
      const meshResult = await loadMeshGeometry(file);
      if (cancelled) return;
      if (meshResult.success) {
        let displayGeometry = meshResult.data;

        if (extensionOf(versionResult.data.fileName) === "3mf") {
          const [colored, properties] = await Promise.all([
            loadMeshForDisplay(file),
            extractThreeMFProperties(file),
          ]);
          if (!cancelled) {
            if (colored.success && colored.data.hasColor) {
              displayGeometry = colored.data.geometry;
              setHasVertexColors(true);
            }
            if (properties && Object.keys(properties.metadata).length > 0) {
              setThreeMFProperties(properties);
            }
          }
        }

        setGeometry(displayGeometry);
        uniqueVerticesRef.current = computeUniqueVertices(displayGeometry);
        uniqueEdgesRef.current = computeUniqueEdges(displayGeometry);
        setBoundaryLoops(findCircularFeatureLoops(displayGeometry));
        displayGeometry.computeBoundingBox();
        const box = displayGeometry.boundingBox;
        if (box) {
          const size = box.getSize(new THREE.Vector3());
          setBoundingBox([size.x, size.y, size.z]);

          // Slicer-exported files (e.g. BambuStudio) often place the model
          // at its print-bed position rather than local origin — the grid
          // stays at world origin by default, so a model sitting at, say,
          // (128, 130) on its bed renders far from the visible grid patch.
          // Ground the grid under the model's actual footprint instead:
          // same rotation the model itself gets (-90° about X, see the
          // <group> below) applied to the model's own local floor-center
          // point, so the two line up regardless of where the file placed
          // the model.
          const center = box.getCenter(new THREE.Vector3());
          const floorCenterWorld = new THREE.Vector3(center.x, center.y, box.min.z).applyMatrix4(
            new THREE.Matrix4().makeRotationX(-Math.PI / 2),
          );
          setGridPosition([floorCenterWorld.x, floorCenterWorld.y, floorCenterWorld.z]);

          // drei's Grid fades out with distance from the camera's
          // projection onto the grid plane, using a fixed 100-unit default
          // — fine for a small part, but a model whose footprint is wider
          // than that fades out well before reaching its edges. Scale the
          // fade radius to the model's own diagonal so the visible patch
          // always reaches past every corner, with a floor so a tiny part
          // doesn't end up with an oddly cropped-looking grid either.
          setGridFadeDistance(Math.max(size.length() * 1.5, 50));

          // Same problem as the grid: the axes gizmo sits at local origin by
          // default, which can be far from where the model itself actually
          // is (see the grid-positioning comment above). Anchor it to the
          // model's own bounding-box corner instead — it's a sibling of the
          // mesh inside the same rotated group, so no extra transform is
          // needed here, just the model's own local coordinates.
          setAxisOrigin([box.min.x, box.min.y, box.min.z]);
        }
      } else {
        setError(meshResult.error);
      }
      setIsMeshLoading(false);
    });

    listComments(projectId, versionId).then((result) => {
      if (!cancelled && result.success) setComments(result.data);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId]);

  // Snaps to the nearest of the clicked triangle's 3 vertices OR the nearest
  // point along any of its 3 edges, whichever is closer to the actual click
  // point — cheap (3 vertices + 3 edge projections, not a full-mesh search)
  // and matches what "click an edge or vertex" actually means in practice:
  // clicking a corner snaps to that vertex, clicking along an edge (not at
  // its endpoints) snaps to that point on the edge instead of jumping to
  // whichever end happens to be nearest. Distance comparison happens in
  // world space (matching event.point's space); the returned point is
  // converted to the rotated group's local space so it's safe to render
  // directly inside that group.
  function nearestMeasurePoint(event: ThreeEvent<MouseEvent>): THREE.Vector3 | null {
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

  function handleMeasureHover(event: ThreeEvent<MouseEvent>) {
    if (!isMeasuring) return;
    event.stopPropagation();

    // Hole/boss auto-detect searches off the raw surface point (not a
    // single-triangle vertex/edge snap) against a generous magnet radius —
    // matching useMeasureTool.ts's radius branch. Snapping to one
    // triangle's 3 corners misses most of a hole's rim, since most
    // triangles touching a hole have only 1-2 corners actually on it; see
    // the shared circleDetect.ts module both this page and DiffView.tsx
    // (via useMeasureTool.ts) rely on for the same detection.
    if (measureMode === "radius") {
      const surfacePoint = event.point.clone().applyMatrix4(GROUP_ROTATION_INVERSE);
      const loop = findNearestLoop(boundaryLoops, surfacePoint, snapHighlightRadius());
      if (loop) {
        setRadiusPreviewFit(fitCircleLeastSquares(loop.points));
        setRadiusPreviewLoopPoints(loop.points.map((p): [number, number, number] => [p.x, p.y, p.z]));
        setMeasureHover(null);
        setNearbyVertices([]);
        setNearbyEdges([]);
        return;
      }
      setRadiusPreviewFit(null);
      setRadiusPreviewLoopPoints(null);
    }

    // Same freeform-with-magnet placement as comments, plus the same
    // nearby vertex/edge highlight so it's clear what's in snapping range.
    const point = snappedOrSurfacePoint(event);
    setMeasureHover(point ? [point.x, point.y, point.z] : null);
    if (point) {
      updateNearbyVertices(point);
      updateNearbyEdges(point);
    } else {
      setNearbyVertices([]);
      setNearbyEdges([]);
    }
  }

  function handleMeshClick(event: ThreeEvent<MouseEvent>) {
    if (isMeasuring) {
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
        return;
      }

      const snapped = snappedOrSurfacePoint(event);
      if (!snapped) return;
      const point: [number, number, number] = [snapped.x, snapped.y, snapped.z];
      if (measureMode === "distance") {
        if (!measureA) {
          setMeasureA(point);
        } else {
          setMeasureB(point);
          setIsMeasuring(false);
          setMeasureHover(null);
          setNearbyVertices([]);
          setNearbyEdges([]);
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
            setNearbyVertices([]);
            setNearbyEdges([]);
          }
          return next;
        });
      }
      return;
    }

    if (!isPlacingComment) return;
    event.stopPropagation();
    // Freeform surface placement, only "sticking" to a vertex/edge when the
    // cursor is actually close to one (see snappedOrSurfacePoint) — unlike
    // the measure tool below, which always forces a vertex/edge snap.
    const point = snappedOrSurfacePoint(event);
    if (!point) return;
    setPendingPosition([point.x, point.y, point.z]);
    if (event.face?.normal && event.object) {
      const worldNormal = event.face.normal.clone().transformDirection(event.object.matrixWorld);
      setPendingNormal([worldNormal.x, worldNormal.y, worldNormal.z]);
    } else {
      setPendingNormal(undefined);
    }
    setIsPlacingComment(false);
    setCommentSnapPreview(null);
    setNearbyVertices([]);
    setNearbyEdges([]);
  }

  // Highlight radius for nearby-vertex/edge coloring while placing/dragging
  // a comment or hovering in measure mode — scaled off the model's own size
  // so it reads sensibly whether the model is a 10mm bracket or a 200mm
  // enclosure.
  function snapHighlightRadius(): number {
    const maxDimension = Math.max(...boundingBox);
    return maxDimension > 0 ? Math.max(maxDimension * 0.04, 0.5) : 1;
  }

  // Deliberately much tighter than snapHighlightRadius() above — that one's
  // a broad "here's what's nearby" preview area, not a snap distance. Using
  // it as the magnet threshold would mean almost every point on a face of a
  // simple/low-poly model snaps, since its own vertices are already within
  // 4% of the model's size — exactly the "sticks immediately" behavior this
  // is fixing.
  function snapMagnetThreshold(): number {
    const maxDimension = Math.max(...boundingBox);
    return maxDimension > 0 ? Math.max(maxDimension * 0.01, 0.15) : 0.3;
  }

  // The actual surface point under the cursor, magnetized to the nearest
  // vertex/edge only when the cursor is genuinely close to one. Otherwise
  // this is freeform placement anywhere on the surface — used for both
  // comment placement and (unlike nearestMeasurePoint's forced snap) the
  // measure tool's own point picking below.
  function snappedOrSurfacePoint(event: ThreeEvent<MouseEvent>): THREE.Vector3 | null {
    if (!event.face) return null;
    const surfacePoint = event.point.clone().applyMatrix4(GROUP_ROTATION_INVERSE);
    const snapped = nearestMeasurePoint(event);
    if (snapped && snapped.distanceTo(surfacePoint) <= snapMagnetThreshold()) {
      return snapped;
    }
    return surfacePoint;
  }

  function updateNearbyVertices(center: THREE.Vector3) {
    const radius = snapHighlightRadius();
    const nearby = uniqueVerticesRef.current
      .filter((vertex) => vertex.distanceTo(center) <= radius)
      .map((vertex): [number, number, number] => [vertex.x, vertex.y, vertex.z]);
    // Capped so a very dense mesh in this hover area can't spawn hundreds
    // of individual highlight meshes per pointer move.
    setNearbyVertices(nearby.length > 60 ? nearby.slice(0, 60) : nearby);
  }

  function updateNearbyEdges(center: THREE.Vector3) {
    const radius = snapHighlightRadius();
    const nearby: Array<[[number, number, number], [number, number, number]]> = [];
    for (const [a, b] of uniqueEdgesRef.current) {
      const clipped = clipSegmentToCircle(a, b, center, radius);
      if (!clipped) continue;
      const [p1, p2] = clipped;
      nearby.push([
        [p1.x, p1.y, p1.z],
        [p2.x, p2.y, p2.z],
      ]);
      // Capped so a very dense mesh in this hover area can't spawn
      // hundreds of highlight lines per pointer move.
      if (nearby.length >= 60) break;
    }
    setNearbyEdges(nearby);
  }

  function handlePointerMove(event: ThreeEvent<MouseEvent>) {
    // Repositions the not-yet-submitted pin as the user drags it — freeform
    // across the surface, same as handleMeshClick, only sticking to a
    // vertex/edge when actually close to one.
    if (isDraggingPin) {
      event.stopPropagation();
      const point = snappedOrSurfacePoint(event);
      if (!point) return;
      setPendingPosition([point.x, point.y, point.z]);
      updateNearbyVertices(point);
      updateNearbyEdges(point);
      if (event.face?.normal && event.object) {
        const worldNormal = event.face.normal.clone().transformDirection(event.object.matrixWorld);
        setPendingNormal([worldNormal.x, worldNormal.y, worldNormal.z]);
      } else {
        setPendingNormal(undefined);
      }
      return;
    }

    // Before the first click, previews where the pin will land as the
    // cursor moves over the mesh — same snap target handleMeshClick uses.
    if (isPlacingComment) {
      const point = snappedOrSurfacePoint(event);
      setCommentSnapPreview(point ? [point.x, point.y, point.z] : null);
      if (point) {
        updateNearbyVertices(point);
        updateNearbyEdges(point);
      } else {
        setNearbyVertices([]);
        setNearbyEdges([]);
      }
      return;
    }

    handleMeasureHover(event);
  }

  useEffect(() => {
    if (!isPlacingComment) {
      setCommentSnapPreview(null);
      if (!isDraggingPin) {
        setNearbyVertices([]);
        setNearbyEdges([]);
      }
    }
  }, [isPlacingComment, isDraggingPin]);

  useEffect(() => {
    if (!isDraggingPin) return;
    const stopDragging = () => setIsDraggingPin(false);
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, [isDraggingPin]);

  // A tool reads as "active" whether it's still mid-measurement or already
  // has a finished result sitting on screen — either way, clicking its
  // toolbar button again should clear it rather than silently starting a
  // second measurement over the first.
  function isToolActive(mode: "distance" | "radius"): boolean {
    if (measureMode !== mode) return false;
    if (isMeasuring) return true;
    return mode === "distance" ? !!(measureA || measureB) : radiusPoints.length > 0 || !!radiusCommittedFit;
  }

  function toggleMeasuring(mode: "distance" | "radius") {
    if (isToolActive(mode)) {
      clearMeasurement();
    } else {
      startMeasuring(mode);
    }
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
    setNearbyVertices([]);
    setNearbyEdges([]);
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
    setNearbyVertices([]);
    setNearbyEdges([]);
  }

  async function handleSubmitComment(body: string) {
    if (!projectId || !versionId || !pendingPosition) return;
    const result = await createComment(projectId, versionId, body, pendingPosition, pendingNormal);
    if (result.success) {
      setComments((prev) => [...prev, result.data]);
      setPendingPosition(null);
      setPendingNormal(undefined);
    } else {
      setError(result.error);
    }
  }

  // Replies reuse the parent's own position/normal — they're not separately
  // pinned on the model, just rendered inside the parent's popover.
  async function handleSubmitReply(parent: CommentSummary, body: string) {
    if (!projectId || !versionId) return;
    const result = await createComment(
      projectId,
      versionId,
      body,
      parent.position,
      parent.normal ?? undefined,
      parent.id,
    );
    if (result.success) {
      setComments((prev) => [...prev, result.data]);
    } else {
      setError(result.error);
    }
  }

  // Owner/admin can moderate any comment on the project; everyone else can
  // only remove their own — mirrors the same check the API enforces.
  function canDeleteComment(comment: CommentSummary): boolean {
    const canModerateAny = project?.myRole === "owner" || project?.myRole === "admin";
    return canModerateAny || comment.authorUserId === user?.id;
  }

  async function handleConfirmDeleteComment() {
    if (!projectId || !versionId || !pendingDeleteComment) return;
    setIsDeletingComment(true);
    const result = await deleteComment(projectId, versionId, pendingDeleteComment.id);
    setIsDeletingComment(false);
    if (result.success) {
      // Deleting a parent cascades to its replies at the DB level (see
      // migration 0020's `on delete cascade`) — mirror that here too, or
      // the replies would linger in the popover until the next refetch.
      setComments((prev) =>
        prev.filter((c) => c.id !== pendingDeleteComment.id && c.parentCommentId !== pendingDeleteComment.id),
      );
      if (hoveredCommentId === pendingDeleteComment.id) setHoveredCommentId(null);
      if (selectedCommentId === pendingDeleteComment.id) setSelectedCommentId(null);
    } else {
      setError(result.error);
    }
    setPendingDeleteComment(null);
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] w-full gap-4 px-4 py-4">
      <div
        className={`relative flex-1 overflow-hidden rounded-lg border bg-ink-950 ${isPlacingComment
          ? "border-indigo-500"
          : isMeasuring && measureMode === "radius"
            ? "border-sky-500"
            : isMeasuring
              ? "border-amber-500"
              : "border-ink-800"
          }`}
      >
        {geometry && (
          <div className="absolute left-3 top-2 z-10 flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-950/70 p-1">
            <button
              type="button"
              onClick={() => toggleMeasuring("distance")}
              title={
                isToolActive("distance")
                  ? "Click to clear this distance measurement"
                  : "Measure distance between two points"
              }
              className={`flex h-7 w-7 items-center justify-center rounded text-sm ${
                isToolActive("distance")
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              }`}
            >
              📏
            </button>
            <button
              type="button"
              onClick={() => toggleMeasuring("radius")}
              title={isToolActive("radius") ? "Click to clear this radius measurement" : "Measure a hole/boss radius"}
              className={`flex h-7 w-7 items-center justify-center rounded text-sm ${
                isToolActive("radius")
                  ? "bg-sky-500/20 text-sky-400"
                  : "text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              }`}
            >
              ⌀
            </button>
            {isPro && (
              <>
                <div className="mx-0.5 h-5 w-px bg-ink-800" />
                <button
                  type="button"
                  onClick={() => setIsPlacingComment((prev) => !prev)}
                  title={isPlacingComment ? "Cancel adding a comment" : "Click a spot on the model to add a comment"}
                  className={`flex h-7 w-7 items-center justify-center rounded text-sm ${
                    isPlacingComment
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "text-ink-300 hover:bg-ink-800 hover:text-ink-50"
                  }`}
                >
                  💬
                </button>
              </>
            )}
            <div className="mx-0.5 h-5 w-px bg-ink-800" />
            <button
              type="button"
              onClick={() => zoomToFitRef.current?.()}
              title="Zoom to fit the model in view"
              className="flex h-7 w-7 items-center justify-center rounded text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-50"
            >
              ⛶
            </button>
            <button
              type="button"
              onClick={() => resetViewRef.current?.()}
              title="Reset camera to the loaded view"
              className="flex h-7 w-7 items-center justify-center rounded text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-50"
            >
              ⟲
            </button>
            <div className="mx-0.5 h-5 w-px bg-ink-800" />
            <ShadingModeToggle />
            <GridToggle />
            <div className="mx-0.5 h-5 w-px bg-ink-800" />
            <ControlSchemeSelect showLegend={false} />
          </div>
        )}
        <Canvas camera={{ position: [50, 50, 50], fov: 45 }}>
          {/* Comment pins' stored positions come from raycasting against the
              (rotated) mesh — see ModelScene.tsx for the Z-up-to-Y-up
              transform they, and everything else here, inherit. */}
          <ModelScene gridPosition={gridPosition} gridFadeDistance={gridFadeDistance} axisOrigin={axisOrigin}>
            {geometry && (
              <Bounds key={geometry.uuid} fit clip observe margin={1.2}>
                <BoundsResetBridge resetRef={resetViewRef} />
                <ZoomToFitBridge zoomRef={zoomToFitRef} />
                <mesh
                  geometry={geometry}
                  onClick={handleMeshClick}
                  onPointerMove={handlePointerMove}
                  onPointerOut={() => {
                    setMeasureHover(null);
                    setRadiusPreviewFit(null);
                    setRadiusPreviewLoopPoints(null);
                    setCommentSnapPreview(null);
                    setNearbyVertices([]);
                    setNearbyEdges([]);
                  }}
                >
                  {/* key forces a fresh material instance when hasVertexColors
                      or shadingMode flips — mutating vertexColors/flatShading
                      on an already-compiled material doesn't recompile its
                      shader. */}
                  <meshStandardMaterial
                    key={`${hasVertexColors ? "vertex-colors" : "solid"}-${shadingMode}`}
                    color={hasVertexColors ? "#ffffff" : "#4f8ff7"}
                    vertexColors={hasVertexColors}
                    flatShading={shadingMode === "flat"}
                    transparent={shadingMode === "transparent"}
                    opacity={shadingMode === "transparent" ? 0.4 : 1}
                    depthWrite={shadingMode !== "transparent"}
                    side={shadingMode === "transparent" ? THREE.DoubleSide : THREE.FrontSide}
                  />
                </mesh>
                {shadingMode === "transparent" && <EdgeOverlay geometry={geometry} />}
              </Bounds>
            )}
            {isPro && (
              <>
                {comments
                  .filter((comment) => !comment.parentCommentId)
                  .map((comment) => (
                    <CommentPin
                      key={comment.id}
                      position={comment.position}
                      label={comment.body}
                      highlighted={hoveredCommentId === comment.id || selectedCommentId === comment.id}
                      onHoverChange={(hovering) => setHoveredCommentId(hovering ? comment.id : null)}
                      onSelect={() => setSelectedCommentId(comment.id)}
                      messageCount={1 + comments.filter((c) => c.parentCommentId === comment.id).length}
                    />
                  ))}
                {comments
                  .filter(
                    (comment) =>
                      !comment.parentCommentId && (hoveredCommentId === comment.id || selectedCommentId === comment.id),
                  )
                  .map((comment) => (
                    <CommentPopover
                      key={comment.id}
                      comment={comment}
                      replies={comments.filter((c) => c.parentCommentId === comment.id)}
                      canDelete={canDeleteComment}
                      onDelete={setPendingDeleteComment}
                      onReply={(body) => handleSubmitReply(comment, body)}
                      onClose={() => {
                        setSelectedCommentId(null);
                        setHoveredCommentId(null);
                      }}
                    />
                  ))}
                {pendingPosition && (
                  <>
                    <CommentPin position={pendingPosition} pending onDragStart={() => setIsDraggingPin(true)} />
                    <PendingCommentPopover
                      position={pendingPosition}
                      onSubmit={handleSubmitComment}
                      onCancel={() => {
                        setPendingPosition(null);
                        setPendingNormal(undefined);
                      }}
                    />
                  </>
                )}
                {!pendingPosition && commentSnapPreview && (
                  <>
                    {/* Sized to snapHighlightRadius() so this visually IS the
                        "close area" the nearby vertex/edge highlights below
                        are limited to, not just a fixed-size cosmetic marker. */}
                    <mesh position={commentSnapPreview}>
                      <sphereGeometry args={[snapHighlightRadius(), 16, 16]} />
                      <meshBasicMaterial color="#a5b4fc" transparent opacity={0.3} depthTest={false} />
                    </mesh>
                    <mesh position={commentSnapPreview}>
                      <sphereGeometry args={[0.4, 12, 12]} />
                      <meshBasicMaterial color="#818cf8" depthTest={false} />
                    </mesh>
                  </>
                )}
              </>
            )}
            {/* Nearby vertex/edge "close area" highlight — shared by comment
                placement/dragging and measure-tool hovering, so it isn't
                gated behind isPro like the comment UI above. */}
            {(isPlacingComment || isDraggingPin || isMeasuring) &&
              nearbyVertices.map((vertex, index) => (
                <mesh key={`${vertex.join(",")}-${index}`} position={vertex}>
                  <sphereGeometry args={[0.35, 8, 8]} />
                  <meshBasicMaterial color="#facc15" transparent opacity={0.85} depthTest={false} />
                </mesh>
              ))}
            {(isPlacingComment || isDraggingPin || isMeasuring) &&
              nearbyEdges.map(([a, b], index) => (
                <Line
                  key={`${a.join(",")}-${b.join(",")}-${index}`}
                  points={[a, b]}
                  color="#facc15"
                  lineWidth={2.5}
                  transparent
                  opacity={0.85}
                  depthTest={false}
                />
              ))}
            {measureMode === "distance" ? (
              <MeasurementOverlay pointA={measureA} pointB={measureB} hoverPoint={measureHover} />
            ) : (
              <RadiusOverlay
                manualPoints={radiusPoints}
                hoverPoint={measureHover}
                fit={radiusCommittedFit ?? radiusPreviewFit}
                loopPoints={radiusCommittedLoopPoints ?? radiusPreviewLoopPoints}
                isPreview={!radiusCommittedFit && radiusPreviewFit !== null}
              />
            )}
          </ModelScene>
          <OrbitControls makeDefault enabled={!isDraggingPin} mouseButtons={mouseButtons} />
        </Canvas>
        <AxisLegend />

        {isMeshLoading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-950/80">
            <LoadingCube />
            <p className="text-xs text-ink-400">Loading model…</p>
          </div>
        )}
      </div>

      <div className="w-80 shrink-0 overflow-y-auto pr-3">
        <Link to={`/projects/${projectId}`} className="text-xs text-ink-500 hover:text-ink-300">
          ← {version ? "Back to project" : "Back"}
        </Link>

        {error && (
          <div className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {version && (
          <>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded border border-ink-700 bg-ink-800 px-2 py-0.5 text-xs font-semibold text-ink-300">
                v{version.versionNumber}
              </span>
              <h1 className="truncate text-sm font-semibold text-ink-50">{version.fileName}</h1>
            </div>

            <div className="mt-5">
              <CollapsibleSection title="Summary">
                <div className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-xs leading-relaxed text-ink-300">
                  {version.changeSummary ?? "No summary available."}
                </div>
              </CollapsibleSection>
            </div>

            <div className="mt-4">
              <CollapsibleSection title="Printability Gate">
                <PropertyList>
                  <PropertyRow
                    label="Status"
                    value={
                      <PrintabilityRulesTooltip>
                        <PrintabilityBadge status={version.printabilityStatus} />
                      </PrintabilityRulesTooltip>
                    }
                  />
                </PropertyList>
              </CollapsibleSection>
            </div>

            <div className="mt-4">
              <PrintLogSection
                projectId={projectId!}
                versionId={versionId!}
                slicerProfile={version.slicerProfile}
                printPhoto={version.printPhoto}
                onChange={() => void refreshVersion()}
              />
            </div>

            {threeMFProperties && (
              <div className="mt-5">
                <ThreeMFPropertiesPanel properties={threeMFProperties} />
              </div>
            )}

            <div className="mt-5">
              <DetailedStatsPanel
                stats={diffStats}
                hasComparison={hasComparison}
                boundingBoxB={boundingBox}
              />
            </div>



            {isPro && (
              <div className="mt-5">
                <CommentsPanel
                  comments={comments}
                  isPlacingComment={isPlacingComment}
                  onTogglePlacing={() => setIsPlacingComment((prev) => !prev)}
                  pendingPosition={pendingPosition}
                  onCancelPending={() => {
                    setPendingPosition(null);
                    setPendingNormal(undefined);
                  }}
                  highlightedCommentId={hoveredCommentId}
                  onHoverComment={setHoveredCommentId}
                  onSelectComment={(commentId) => {
                    // Only top-level comments have their own pin/popover —
                    // selecting a reply opens its parent's thread instead.
                    const target = comments.find((c) => c.id === commentId);
                    setSelectedCommentId(target?.parentCommentId ?? commentId);
                  }}
                  canDeleteComment={canDeleteComment}
                  onRequestDelete={setPendingDeleteComment}
                />
              </div>
            )}
          </>
        )}
      </div>

      {pendingDeleteComment && (
        <ConfirmDialog
          title="Delete comment?"
          message={(() => {
            const replyCount = comments.filter((c) => c.parentCommentId === pendingDeleteComment.id).length;
            return replyCount > 0
              ? `This will also delete ${replyCount} ${replyCount === 1 ? "reply" : "replies"}. This can't be undone.`
              : "This can't be undone.";
          })()}
          confirmLabel="Delete"
          isDestructive
          isConfirming={isDeletingComment}
          onConfirm={() => void handleConfirmDeleteComment()}
          onCancel={() => setPendingDeleteComment(null)}
        />
      )}
    </div>
  );
}
