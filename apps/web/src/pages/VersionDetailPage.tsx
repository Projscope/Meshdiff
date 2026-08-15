import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as THREE from "three";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import {
  getVersion,
  getDiff,
  listComments,
  createComment,
  type VersionDetail,
  type CommentSummary,
} from "../lib/projectsApi";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import { extensionOf, loadMeshGeometry } from "../engine/loadMesh";
import { extractThreeMFProperties, loadMeshForDisplay, type ThreeMFProperties } from "../engine/load3mfDisplayExtras";
import PrintabilityBadge from "../components/PrintabilityBadge";
import PrintabilityRulesTooltip from "../components/PrintabilityRulesTooltip";
import DetailedStatsPanel from "../components/DetailedStatsPanel";
import CommentsPanel from "../components/CommentsPanel";
import CommentPin from "../components/CommentPin";
import AxisLegend from "../components/AxisLegend";
import AxisLabels from "../components/AxisLabels";
import ThreeMFPropertiesPanel from "../components/ThreeMFPropertiesPanel";
import CollapsibleSection, { PropertyList, PropertyRow } from "../components/CollapsibleSection";
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

export default function VersionDetailPage() {
  const { projectId, versionId } = useParams<{ projectId: string; versionId: string }>();
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [diffStats, setDiffStats] = useState<VoxelDiffStats | null>(null);
  const [hasComparison, setHasComparison] = useState(false);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [hasVertexColors, setHasVertexColors] = useState(false);
  const [threeMFProperties, setThreeMFProperties] = useState<ThreeMFProperties | null>(null);
  const [boundingBox, setBoundingBox] = useState<[number, number, number]>([0, 0, 0]);
  const [gridPosition, setGridPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [gridFadeDistance, setGridFadeDistance] = useState(100);
  const [axisOrigin, setAxisOrigin] = useState<[number, number, number]>([0, 0, 0]);
  const [error, setError] = useState<string | null>(null);
  const [isMeshLoading, setIsMeshLoading] = useState(true);

  const [comments, setComments] = useState<CommentSummary[]>([]);
  const [isPlacingComment, setIsPlacingComment] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<[number, number, number] | null>(null);
  const [pendingNormal, setPendingNormal] = useState<[number, number, number] | undefined>();

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

    getVersion(projectId, versionId).then(async (result) => {
      if (cancelled) return;
      if (!result.success) {
        setError(result.error);
        setIsMeshLoading(false);
        return;
      }
      setVersion(result.data);

      // No previous version (v1): self-diff still yields real per-mesh
      // Version Stats/Printability values for the "B" side (same trick
      // finalize uses server-side) — just don't treat the zeroed-out
      // deltas as a real comparison for the Geometric Delta section.
      const versionAId = result.data.previousVersionId ?? versionId;
      setHasComparison(result.data.previousVersionId !== null);
      getDiff(versionAId, versionId).then((diffResult) => {
        if (!cancelled && diffResult.success) setDiffStats(diffResult.data);
      });

      const response = await fetch(result.data.downloadUrl);
      const blob = await response.blob();
      const file = new File([blob], result.data.fileName);
      const meshResult = await loadMeshGeometry(file);
      if (cancelled) return;
      if (meshResult.success) {
        let displayGeometry = meshResult.data;

        if (extensionOf(result.data.fileName) === "3mf") {
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

  // Snaps to whichever of the clicked triangle's 3 vertices is nearest the
  // actual click point — cheap (3 candidates, not a full-mesh search) and
  // matches what "click an edge or vertex" actually means in practice: you
  // click near the corner you mean, not the exact pixel of it. Distance
  // comparison happens in world space (matching event.point's space); the
  // returned point is converted to the rotated group's local space so it's
  // safe to render directly inside that group.
  function nearestTriangleVertex(event: ThreeEvent<MouseEvent>): THREE.Vector3 | null {
    if (!event.face || !(event.object instanceof THREE.Mesh)) return null;
    const position = event.object.geometry.getAttribute("position");
    const candidate = new THREE.Vector3();
    let closest: THREE.Vector3 | null = null;
    let closestDist = Infinity;
    for (const index of [event.face.a, event.face.b, event.face.c]) {
      candidate.fromBufferAttribute(position, index).applyMatrix4(event.object.matrixWorld);
      const dist = candidate.distanceTo(event.point);
      if (dist < closestDist) {
        closestDist = dist;
        closest = candidate.clone();
      }
    }
    return closest?.applyMatrix4(GROUP_ROTATION_INVERSE) ?? null;
  }

  function handleMeasureHover(event: ThreeEvent<MouseEvent>) {
    if (!isMeasuring) return;
    event.stopPropagation();
    const snapped = nearestTriangleVertex(event);

    if (measureMode === "radius" && snapped) {
      const loop = findNearestLoop(boundaryLoops, snapped, 1e-3);
      if (loop) {
        setRadiusPreviewFit(fitCircleLeastSquares(loop.points));
        setRadiusPreviewLoopPoints(loop.points.map((p): [number, number, number] => [p.x, p.y, p.z]));
        setMeasureHover(null);
        return;
      }
      setRadiusPreviewFit(null);
      setRadiusPreviewLoopPoints(null);
    }

    setMeasureHover(snapped ? [snapped.x, snapped.y, snapped.z] : null);
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

      const snapped = nearestTriangleVertex(event);
      if (!snapped) return;
      const point: [number, number, number] = [snapped.x, snapped.y, snapped.z];
      if (measureMode === "distance") {
        if (!measureA) {
          setMeasureA(point);
        } else {
          setMeasureB(point);
          setIsMeasuring(false);
          setMeasureHover(null);
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
          }
          return next;
        });
      }
      return;
    }

    if (!isPlacingComment) return;
    event.stopPropagation();
    const point = event.point;
    setPendingPosition([point.x, point.y, point.z]);
    if (event.face?.normal && event.object) {
      const worldNormal = event.face.normal.clone().transformDirection(event.object.matrixWorld);
      setPendingNormal([worldNormal.x, worldNormal.y, worldNormal.z]);
    } else {
      setPendingNormal(undefined);
    }
    setIsPlacingComment(false);
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
  }

  async function handleSubmitComment(body: string) {
    if (!projectId || !versionId || !pendingPosition) return;
    const result = await createComment(projectId, versionId, body, pendingPosition, pendingNormal);
    if (result.success) {
      setComments((prev) => [...prev, result.data]);
      setPendingPosition(null);
      setPendingNormal(undefined);
    }
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] w-full gap-4 px-4 py-4">
      <div
        className={`relative flex-1 overflow-hidden rounded-lg border bg-neutral-950 ${isPlacingComment
          ? "border-indigo-500"
          : isMeasuring && measureMode === "radius"
            ? "border-sky-500"
            : isMeasuring
              ? "border-amber-500"
              : "border-neutral-800"
          }`}
      >
        <Canvas camera={{ position: [50, 50, 50], fov: 45 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 10]} intensity={0.8} />
          <Grid
            infiniteGrid
            position={gridPosition}
            fadeDistance={gridFadeDistance}
            cellColor="#333"
            sectionColor="#555"
          />
          {/* The grid is drei's default Y-up floor; this app's model data is
              Z-up (see diffVoxels.ts's gravity vector), so the displayed
              content — including comment pins, whose stored positions come
              from raycasting against the (now rotated) mesh — is rotated
              -90° around X to lay it flat on that floor. Purely a
              presentation transform, doesn't touch the geometry used for
              diffing/printability. */}
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <group position={axisOrigin}>
              <axesHelper args={[30]} />
              <AxisLabels />
            </group>
            {geometry && (
              <Bounds fit clip observe margin={1.2}>
                <mesh
                  geometry={geometry}
                  onClick={handleMeshClick}
                  onPointerMove={handleMeasureHover}
                  onPointerOut={() => {
                    setMeasureHover(null);
                    setRadiusPreviewFit(null);
                    setRadiusPreviewLoopPoints(null);
                  }}
                >
                  {/* key forces a fresh material instance when hasVertexColors
                      flips — mutating vertexColors on an already-compiled
                      material in place doesn't recompile its shader, so the
                      color attribute would silently be ignored otherwise. */}
                  <meshStandardMaterial
                    key={hasVertexColors ? "vertex-colors" : "flat"}
                    color={hasVertexColors ? "#ffffff" : "#4f8ff7"}
                    vertexColors={hasVertexColors}
                  />
                </mesh>
              </Bounds>
            )}
            {comments.map((comment) => (
              <CommentPin key={comment.id} position={comment.position} label={comment.body} />
            ))}
            {pendingPosition && <CommentPin position={pendingPosition} pending />}
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
          </group>
          <OrbitControls makeDefault />
        </Canvas>
        <AxisLegend />

        {isMeshLoading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950/80">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-emerald-500" />
            <p className="text-xs text-neutral-400">Loading model…</p>
          </div>
        )}
      </div>

      <div className="w-80 shrink-0 overflow-y-auto pr-3">
        <Link to={`/projects/${projectId}`} className="text-xs text-neutral-500 hover:text-neutral-300">
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
              <span className="rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-300">
                v{version.versionNumber}
              </span>
              <h1 className="truncate text-sm font-semibold text-white">{version.fileName}</h1>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Measure tools
                </h3>
                {(measureA || measureB || radiusPoints.length > 0 || radiusCommittedFit) && (
                  <button
                    type="button"
                    onClick={clearMeasurement}
                    className="text-[11px] text-neutral-500 hover:text-neutral-300"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => startMeasuring("distance")}
                  className={`flex-1 rounded border px-2 py-1 text-[11px] font-medium ${isMeasuring && measureMode === "distance"
                    ? "border-amber-500 bg-amber-500/10 text-amber-400"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                    }`}
                >
                  {isMeasuring && measureMode === "distance" ? "Click two points…" : "Distance"}
                </button>
                <button
                  type="button"
                  onClick={() => startMeasuring("radius")}
                  className={`flex-1 rounded border px-2 py-1 text-[11px] font-medium ${isMeasuring && measureMode === "radius"
                    ? "border-sky-500 bg-sky-500/10 text-sky-400"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                    }`}
                >
                  {isMeasuring && measureMode === "radius"
                    ? radiusPreviewFit
                      ? "Click to confirm…"
                      : `Click point ${radiusPoints.length + 1} of 3…`
                    : "Radius"}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-neutral-500">
                {measureMode === "distance"
                  ? measureA && measureB
                    ? `${new THREE.Vector3(...measureA).distanceTo(new THREE.Vector3(...measureB)).toFixed(2)} mm between the two selected vertices.`
                    : isMeasuring
                      ? measureA
                        ? "First point set — click a second vertex."
                        : "Click a vertex on the model to start."
                      : "Click two vertices on the model to measure the distance between them."
                  : radiusCommittedFit
                    ? `R ${radiusCommittedFit.radius.toFixed(2)} mm, ⌀ ${(radiusCommittedFit.radius * 2).toFixed(2)} mm.`
                    : radiusPreviewFit
                      ? `Detected hole — R ${radiusPreviewFit.radius.toFixed(2)} mm, ⌀ ${(radiusPreviewFit.radius * 2).toFixed(2)} mm. Click to confirm.`
                      : isMeasuring
                        ? radiusPoints.length > 0
                          ? `Click ${3 - radiusPoints.length} more vertex${3 - radiusPoints.length === 1 ? "" : "es"} on the rim, or hover a hole to auto-detect it.`
                          : "Hover a hole or boss to auto-detect its edge, or click 3 points on it manually."
                        : "Click a hole/boss to measure its radius (auto-detected), or click 3 points manually."}
              </p>
            </div>

            <div className="mt-4">
              <CollapsibleSection title="Summary">
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs leading-relaxed text-neutral-300">
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



            <div className="mt-5">
              <CommentsPanel
                comments={comments}
                isPlacingComment={isPlacingComment}
                onTogglePlacing={() => setIsPlacingComment((prev) => !prev)}
                pendingPosition={pendingPosition}
                onSubmitComment={handleSubmitComment}
                onCancelPending={() => {
                  setPendingPosition(null);
                  setPendingNormal(undefined);
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
