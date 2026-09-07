import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import { loadMeshGeometry } from "../engine/loadMesh";
import { extractThreeMFProperties, loadMeshForDisplay, type ThreeMFProperties } from "../engine/load3mfDisplayExtras";
import { computeVoxelDiffOffThread } from "../lib/voxelDiffWorkerClient";
import AxisLegend from "./AxisLegend";
import ModelScene from "./ModelScene";
import BoundsResetBridge from "./BoundsResetBridge";
import ZoomToFitBridge from "./ZoomToFitBridge";
import MeasureToolbar from "./MeasureToolbar";
import MeasureSceneOverlay from "./MeasureSceneOverlay";
import { useMeasureTool } from "../lib/useMeasureTool";
import { useControlScheme, useOrbitMouseButtons } from "../lib/controlScheme";
import { meshRepairWarning } from "../lib/meshRepairMessage";
import type { MeshRepairReport } from "@meshdiff/shared/engine/repairMesh";
import { useShadingMode } from "../lib/shadingMode";
import EdgeOverlay from "./EdgeOverlay";
import LoadingCube from "./LoadingCube";
import PrintabilityBadge from "./PrintabilityBadge";
import PrintabilityRulesTooltip from "./PrintabilityRulesTooltip";
import ThreeMFPropertiesPanel from "./ThreeMFPropertiesPanel";
import DetailedStatsPanel from "./DetailedStatsPanel";
import CollapsibleSection, { PropertyList, PropertyRow } from "./CollapsibleSection";

// Same rotation the group below applies to lay the Z-up model flat on
// drei's Y-up grid — see VersionDetailPage.tsx, where this exact fix (and
// the grid/axis-positioning one below it) was worked out and verified
// against a real off-origin 3MF export.
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
 * printability/stats via a self-diff, and the same shared measure tool
 * (useMeasureTool) every other viewer in the app uses — minus comments,
 * which need a saved project/version to attach to and don't make sense for
 * a locally-dropped file with nothing to persist to.
 */
const MeasureViewer = forwardRef<MeasureViewerHandle, MeasureViewerProps>(function MeasureViewer(
  { demoUrl },
  ref,
) {
  const { t } = useTranslation();
  const [fileName, setFileName] = useState<string | null>(null);
  const [displayGeometry, setDisplayGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [hasVertexColors, setHasVertexColors] = useState(false);
  const [threeMFProperties, setThreeMFProperties] = useState<ThreeMFProperties | null>(null);
  const [boundingBox, setBoundingBox] = useState<[number, number, number]>([0, 0, 0]);
  const [stats, setStats] = useState<(VoxelDiffStats & { toleranceMm?: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meshWarning, setMeshWarning] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gridPosition, setGridPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [gridFadeDistance, setGridFadeDistance] = useState(100);
  const [axisOrigin, setAxisOrigin] = useState<[number, number, number]>([0, 0, 0]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const zoomToFitRef = useRef<(() => void) | null>(null);
  const [controlScheme] = useControlScheme();
  const mouseButtons = useOrbitMouseButtons(controlScheme);
  const measure = useMeasureTool();
  const [shadingMode] = useShadingMode();

  async function handleFile(file: File) {
    setIsLoading(true);
    measure.clearMeasurement();
    setThreeMFProperties(null);
    setStats(null);

    const result = await loadMeshGeometry(file);
    if (!result.success) {
      setError(result.error);
      setMeshWarning(null);
      setDisplayGeometry(null);
      setIsLoading(false);
      return;
    }

    setFileName(file.name);
    let display = result.data;
    setHasVertexColors(false);
    const repair = result.data.userData.meshRepair as MeshRepairReport | undefined;
    setMeshWarning(repair ? meshRepairWarning(repair) : null);
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
    setError(null);

    display.computeBoundingBox();
    const box = display.boundingBox;
    if (box) {
      const size = box.getSize(new THREE.Vector3());
      const boundingBoxSize: [number, number, number] = [size.x, size.y, size.z];
      setBoundingBox(boundingBoxSize);
      measure.setGeometry(display, boundingBoxSize);

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

  return (
    <div className="flex flex-col md:flex-row h-full w-full gap-3 overflow-y-auto md:overflow-hidden">
      {/* 3D Viewport Pane — Takes 50vh or min 350px on mobile, full height flex-1 on desktop */}
      <div
        className={`relative min-h-[350px] h-[50vh] md:h-full w-full md:flex-1 overflow-hidden rounded-lg border bg-ink-950 ${
          isDragOver
            ? "border-blue-500"
            : measure.isMeasuring && measure.measureMode === "radius"
              ? "border-sky-500"
              : measure.isMeasuring
                ? "border-amber-500"
                : "border-ink-800"
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

        <div className="absolute left-3 top-2 z-10 flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Model</span>
          {displayGeometry && (
            <MeasureToolbar
              measure={measure}
              onZoomToFit={() => zoomToFitRef.current?.()}
              onResetView={() => resetViewRef.current?.()}
            />
          )}
        </div>

        {meshWarning && displayGeometry && (
          <div
            className="absolute left-3 right-3 top-9 z-10 truncate rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-fg-300"
            title={meshWarning}
          >
            ⚠ {meshWarning}
          </div>
        )}

        {!displayGeometry && !isLoading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-center text-sm text-ink-500">
            <span>{error ?? "Drop STL / OBJ / 3MF here"}</span>
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="rounded border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:border-ink-500 hover:text-ink-50"
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
                  className="rounded border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:border-ink-500 hover:text-ink-50"
                >
                  or load demo
                </button>
              )}
            </div>
          </div>
        )}

        <Canvas camera={{ position: [50, 50, 50], fov: 45 }}>
          <ModelScene gridPosition={gridPosition} gridFadeDistance={gridFadeDistance} axisOrigin={axisOrigin}>
            {displayGeometry && (
              <Bounds key={displayGeometry.uuid} fit clip observe margin={1.2}>
                <BoundsResetBridge resetRef={resetViewRef} />
                <ZoomToFitBridge zoomRef={zoomToFitRef} />
                <mesh
                  geometry={displayGeometry}
                  onClick={(event) => measure.onClick(event)}
                  onPointerMove={measure.onPointerMove}
                  onPointerOut={measure.onPointerOut}
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
                {shadingMode === "transparent" && <EdgeOverlay geometry={displayGeometry} />}
              </Bounds>
            )}
            <MeasureSceneOverlay measure={measure} />
          </ModelScene>
          <OrbitControls makeDefault mouseButtons={mouseButtons} />
        </Canvas>
        <AxisLegend />

        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-ink-950/80">
            <LoadingCube />
            <p className="text-xs text-ink-400">Loading model…</p>
          </div>
        )}
      </div>

      {/* Properties Sidebar Panel — Stacks underneath on mobile (w-full), side panel on desktop (md:w-72) */}
      <div className="w-full md:w-72 shrink-0 overflow-y-auto rounded-lg border border-ink-800 bg-ink-900 p-3 text-sm">
        {!fileName && (
          <p className="text-xs text-ink-500">
            Drop a model to see its properties, printability, and stats here.
          </p>
        )}

        {fileName && (
          <>
            <h1 className="truncate text-sm font-semibold text-ink-50">{fileName}</h1>

            <div className="mt-5">
              <CollapsibleSection title={t("versionDetail.printabilityGate")}>
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
