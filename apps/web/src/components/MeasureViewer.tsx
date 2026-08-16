import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import { loadMeshGeometry } from "../engine/loadMesh";
import { extractThreeMFProperties, loadMeshForDisplay, type ThreeMFProperties } from "../engine/load3mfDisplayExtras";
import { computeVoxelDiffOffThread } from "../lib/voxelDiffWorkerClient";
import AxisLegend from "./AxisLegend";
import AxisLabels from "./AxisLabels";
import BoundsResetBridge from "./BoundsResetBridge";
import ZoomToFitBridge from "./ZoomToFitBridge";
import LoadingCube from "./LoadingCube";
import MeasurementOverlay from "./MeasurementOverlay";
import RadiusOverlay from "./RadiusOverlay";
import PrintabilityBadge from "./PrintabilityBadge";
import PrintabilityRulesTooltip from "./PrintabilityRulesTooltip";
import ThreeMFPropertiesPanel from "./ThreeMFPropertiesPanel";
import DetailedStatsPanel from "./DetailedStatsPanel";
import CollapsibleSection, { PropertyList, PropertyRow } from "./CollapsibleSection";
import { fitCircleThroughThreePoints, type CircleFit } from "../lib/circleFit";
import { findCircularFeatureLoops, findNearestLoop, fitCircleLeastSquares, type BoundaryLoop } from "../lib/circleDetect";

// Same rotation the group below applies to lay the Z-up model flat on
// drei's Y-up grid — see VersionDetailPage.tsx, where this exact fix (and
// the grid/axis-positioning one below it) was worked out and verified
// against a real off-origin 3MF export.
const GROUP_ROTATION_INVERSE = new THREE.Matrix4().makeRotationX(Math.PI / 2);
const GROUP_ROTATION = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

export interface MeasureViewerHandle {
  openFileDialog: () => void;
}

interface MeasureViewerProps {
  /** Bundled sample STL to offer as a one-click "or try a demo" option. */
  demoUrl?: string;
}

/**
 * Single-model viewer with the same feature set as the project workspace's
 * version viewer (VersionDetailPage.tsx) — color rendering, 3MF properties,
 * printability/stats via a self-diff, and the vertex/edge-snapping measure tool
 * — minus comments, which need a saved project/version to attach to and
 * don't make sense for a locally-dropped file with nothing to persist to.
 */
const MeasureViewer = forwardRef<MeasureViewerHandle, MeasureViewerProps>(function MeasureViewer(
  { demoUrl },
  ref,
) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [displayGeometry, setDisplayGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [hasVertexColors, setHasVertexColors] = useState(false);
  const [threeMFProperties, setThreeMFProperties] = useState<ThreeMFProperties | null>(null);
  const [boundingBox, setBoundingBox] = useState<[number, number, number]>([0, 0, 0]);
  const [stats, setStats] = useState<(VoxelDiffStats & { toleranceMm?: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gridPosition, setGridPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [gridFadeDistance, setGridFadeDistance] = useState(100);
  const [axisOrigin, setAxisOrigin] = useState<[number, number, number]>([0, 0, 0]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const zoomToFitRef = useRef<(() => void) | null>(null);

  const [measureMode, setMeasureMode] = useState<"distance" | "radius">("distance");
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureA, setMeasureA] = useState<[number, number, number] | null>(null);
  const [measureB, setMeasureB] = useState<[number, number, number] | null>(null);
  const [radiusPoints, setRadiusPoints] = useState<Array<[number, number, number]>>([]);
  const [measureHover, setMeasureHover] = useState<[number, number, number] | null>(null);
  const [boundaryLoops, setBoundaryLoops] = useState<BoundaryLoop[]>([]);
  const [radiusPreviewFit, setRadiusPreviewFit] = useState<CircleFit | null>(null);
  const [radiusCommittedFit, setRadiusCommittedFit] = useState<CircleFit | null>(null);
  const [radiusPreviewLoopPoints, setRadiusPreviewLoopPoints] = useState<Array<[number, number, number]> | null>(null);
  const [radiusCommittedLoopPoints, setRadiusCommittedLoopPoints] = useState<Array<[number, number, number]> | null>(null);

  async function handleFile(file: File) {
    setIsLoading(true);
    setIsMeasuring(false);
    setMeasureA(null);
    setMeasureB(null);
    setRadiusPoints([]);
    setRadiusPreviewFit(null);
    setRadiusCommittedFit(null);
    setMeasureHover(null);
    setThreeMFProperties(null);
    setStats(null);

    const result = await loadMeshGeometry(file);
    if (!result.success) {
      setError(result.error);
      setDisplayGeometry(null);
      setIsLoading(false);
      return;
    }

    setFileName(file.name);
    let display = result.data;
    setHasVertexColors(false);
    if (file.name.toLowerCase().endsWith(".3mf")) {
      const [colored, properties] = await Promise.all([loadMeshForDisplay(file), extractThreeMFProperties(file)]);
      if (colored.success && colored.data.hasColor) {
        display = colored.data.geometry;
        setHasVertexColors(true);
      }
      if (properties && Object.keys(properties.metadata).length > 0) {
        setThreeMFProperties(properties);
      }
    }
    setDisplayGeometry(display);
    setBoundaryLoops(findCircularFeatureLoops(display));
    setError(null);

    display.computeBoundingBox();
    const box = display.boundingBox;
    if (box) {
      const size = box.getSize(new THREE.Vector3());
      setBoundingBox([size.x, size.y, size.z]);

      // Slicer-exported files often place the model at its print-bed
      // position rather than local origin — ground the grid/axes under the
      // model's actual footprint instead of leaving them at world origin.
      const center = box.getCenter(new THREE.Vector3());
      const floorCenterWorld = new THREE.Vector3(center.x, center.y, box.min.z).applyMatrix4(GROUP_ROTATION);
      setGridPosition([floorCenterWorld.x, floorCenterWorld.y, floorCenterWorld.z]);
      setAxisOrigin([box.min.x, box.min.y, box.min.z]);

      // drei's Grid fades out with distance from the camera's projection
      // onto the grid plane (fixed 100-unit default) — scale it to the
      // model's own diagonal so the visible patch always reaches past
      // every corner, with a floor so a tiny part doesn't look cropped.
      setGridFadeDistance(Math.max(size.length() * 1.5, 50));
    }
    setIsLoading(false);

    // Printability/wall-thickness/overhang/volume/surface-area all come out
    // of the diff engine's per-mesh stats — a self-diff (same geometry as
    // both sides) yields real values for a single file with no second
    // version to compare against, same trick the API server uses for a v1
    // upload (see finalize() in versions.ts). hasComparison=false on
    // DetailedStatsPanel below hides the (meaningless, zero) delta section.
    const selfDiff = await computeVoxelDiffOffThread(result.data, result.data, {
      fileFormatB: file.name.split(".").pop()?.toLowerCase(),
    });
    if (selfDiff.success) {
      setStats({ ...selfDiff.data.stats, toleranceMm: 0 });
    }
  }

  async function handleLoadDemo() {
    if (!demoUrl) return;
    setIsLoading(true);
    try {
      const response = await fetch(demoUrl);
      const blob = await response.blob();
      const filename = demoUrl.split("/").pop() ?? "demo.stl";
      await handleFile(new File([blob], filename));
    } catch {
      setError("Failed to load demo model");
      setIsLoading(false);
    }
  }

  useImperativeHandle(ref, () => ({
    openFileDialog: () => fileInputRef.current?.click(),
  }));

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  // Snaps to the nearest of the clicked triangle's 3 vertices OR the nearest
  // point along any of its 3 edges, whichever is closer to the actual click
  // point — clicking a corner snaps to that vertex, clicking along an edge
  // snaps to that point on the edge instead of jumping to whichever
  // endpoint happens to be nearest.
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
    const snapped = nearestMeasurePoint(event);

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
    if (!isMeasuring) return;
    event.stopPropagation();

    if (measureMode === "radius" && radiusPreviewFit) {
      // Hovering a detected hole/rim — one click confirms its full-loop fit
      // instead of requiring 3 manual points.
      setRadiusCommittedFit(radiusPreviewFit);
      setRadiusCommittedLoopPoints(radiusPreviewLoopPoints);
      setRadiusPreviewFit(null);
      setRadiusPreviewLoopPoints(null);
      setIsMeasuring(false);
      setMeasureHover(null);
      return;
    }

    const snapped = nearestMeasurePoint(event);
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

  return (
    <div className="flex flex-col md:flex-row h-full w-full gap-3 overflow-y-auto md:overflow-hidden">
      {/* 3D Viewport Pane — Takes 50vh or min 350px on mobile, full height flex-1 on desktop */}
      <div
        className={`relative min-h-[350px] h-[50vh] md:h-full w-full md:flex-1 overflow-hidden rounded-lg border bg-neutral-950 ${
          isDragOver
            ? "border-blue-500"
            : isMeasuring && measureMode === "radius"
              ? "border-sky-500"
              : isMeasuring
                ? "border-amber-500"
                : "border-neutral-800"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".stl,.obj,.3mf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />

        <div className="absolute left-3 top-2 z-10 flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Model</span>
          {displayGeometry && (
            <>
              <button
                type="button"
                onClick={() => zoomToFitRef.current?.()}
                title="Zoom to fit the model in view"
                className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:border-neutral-500 hover:text-white"
              >
                Zoom to Model
              </button>
              <button
                type="button"
                onClick={() => resetViewRef.current?.()}
                title="Reset camera to the loaded view"
                className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:border-neutral-500 hover:text-white"
              >
                Reset View
              </button>
            </>
          )}
        </div>

        {!displayGeometry && !isLoading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-center text-sm text-neutral-500">
            <span>{error ?? "Drop STL / OBJ / 3MF here"}</span>
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 hover:text-white"
              >
                Browse files
              </button>
              {demoUrl && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleLoadDemo();
                  }}
                  className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 hover:text-white"
                >
                  or load demo
                </button>
              )}
            </div>
          </div>
        )}

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
              Z-up, so the displayed content is rotated -90° around X to lay
              it flat on that floor. Purely a presentation transform. */}
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <group position={axisOrigin}>
              <axesHelper args={[30]} />
              <AxisLabels />
            </group>
            {displayGeometry && (
              <Bounds key={displayGeometry.uuid} fit clip observe margin={1.2}>
                <BoundsResetBridge resetRef={resetViewRef} />
                <ZoomToFitBridge zoomRef={zoomToFitRef} />
                <mesh
                  geometry={displayGeometry}
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
                      material in place doesn't recompile its shader. */}
                  <meshStandardMaterial
                    key={hasVertexColors ? "vertex-colors" : "flat"}
                    color={hasVertexColors ? "#ffffff" : "#4f8ff7"}
                    vertexColors={hasVertexColors}
                  />
                </mesh>
              </Bounds>
            )}
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

        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950/80">
            <LoadingCube />
            <p className="text-xs text-neutral-400">Loading model…</p>
          </div>
        )}
      </div>

      {/* Properties Sidebar Panel — Stacks underneath on mobile (w-full), side panel on desktop (md:w-72) */}
      <div className="w-full md:w-72 shrink-0 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
        {!fileName && (
          <p className="text-xs text-neutral-500">
            Drop a model to see its properties, printability, and stats here.
          </p>
        )}

        {fileName && (
          <>
            <h1 className="truncate text-sm font-semibold text-white">{fileName}</h1>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Measure</h3>
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
                  className={`flex-1 rounded border px-2 py-1 text-[11px] font-medium ${
                    isMeasuring && measureMode === "distance"
                      ? "border-amber-500 bg-amber-500/10 text-amber-400"
                      : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  {isMeasuring && measureMode === "distance" ? "Click two points…" : "Distance"}
                </button>
                <button
                  type="button"
                  onClick={() => startMeasuring("radius")}
                  className={`flex-1 rounded border px-2 py-1 text-[11px] font-medium ${
                    isMeasuring && measureMode === "radius"
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
                    ? `${new THREE.Vector3(...measureA).distanceTo(new THREE.Vector3(...measureB)).toFixed(2)} mm between the two selected points.`
                    : isMeasuring
                      ? measureA
                        ? "First point set — click a second point (vertex or edge)."
                        : "Click a vertex or edge on the model to start."
                      : "Click two points (vertices or edges) on the model to measure the distance between them."
                  : radiusCommittedFit
                    ? `R ${radiusCommittedFit.radius.toFixed(2)} mm, ⌀ ${(radiusCommittedFit.radius * 2).toFixed(2)} mm.`
                    : radiusPreviewFit
                      ? `Detected hole — R ${radiusPreviewFit.radius.toFixed(2)} mm, ⌀ ${(radiusPreviewFit.radius * 2).toFixed(2)} mm. Click to confirm.`
                      : isMeasuring
                        ? radiusPoints.length > 0
                          ? `Click ${3 - radiusPoints.length} more point${3 - radiusPoints.length === 1 ? "" : "s"} on the rim, or hover a hole to auto-detect it.`
                          : "Hover a hole or boss to auto-detect its edge, or click 3 points on it manually."
                        : "Click a hole/boss to measure its radius (auto-detected), or click 3 points manually."}
              </p>
            </div>
            
            <div className="mt-4">
              <CollapsibleSection title="Printability Gate">
                <PropertyList>
                  <PropertyRow
                    label="Status"
                    value={
                      <PrintabilityRulesTooltip>
                        <PrintabilityBadge status={stats?.printabilityStatus ?? null} />
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
              <DetailedStatsPanel stats={stats} hasComparison={false} boundingBoxB={boundingBox} />
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default MeasureViewer;