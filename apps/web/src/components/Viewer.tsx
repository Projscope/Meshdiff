import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Canvas } from "@react-three/fiber";
import { Bounds } from "@react-three/drei";
import * as THREE from "three";
import { loadMeshGeometry } from "../engine/loadMesh";
import { loadMeshForDisplay } from "../engine/load3mfDisplayExtras";
import AxisLegend from "./AxisLegend";
import ModelScene from "./ModelScene";
import BoundsResetBridge from "./BoundsResetBridge";
import ZoomToFitBridge from "./ZoomToFitBridge";
import CameraSync from "./CameraSync";
import MeasureToolbar from "./MeasureToolbar";
import MeasureSceneOverlay from "./MeasureSceneOverlay";
import { useMeasureTool } from "../lib/useMeasureTool";
import { meshRepairWarning } from "../lib/meshRepairMessage";
import type { MeshRepairReport } from "@meshdiff/shared/engine/repairMesh";
import { useShadingMode } from "../lib/shadingMode";
import EdgeOverlay from "./EdgeOverlay";

interface ViewerProps {
  label: string;
  onGeometryLoaded?: (geometry: THREE.BufferGeometry, file: File) => void;
  /** Bundled sample STL to offer as a one-click "or try a demo" option. */
  demoUrl?: string;
  /** Shared camera state for synchronized rotation. */
  syncedCameraState?: { position: [number, number, number]; target: [number, number, number] };
  /** Callback when camera rotates (if sync is enabled). */
  onCameraChange?: (state: { position: [number, number, number]; target: [number, number, number] }) => void;
  /** Whether sync is currently enabled. */
  isSyncEnabled?: boolean;
}

export interface ViewerHandle {
  openFileDialog: () => void;
  loadDemo: () => void;
  /** Loads a mesh from already-fetched bytes (e.g. a shared diff's files). */
  loadFromBytes: (bytes: Blob, filename: string) => void;
  /** PNG data URL of the current render, or null if nothing has rendered yet. */
  captureScreenshot: () => string | null;
  /** Re-frames the camera on the loaded model, undoing any pan/rotate/zoom. */
  resetView: () => void;
  /** Zooms/re-centers to fit the model, keeping the current rotation/angle. */
  zoomToFit: () => void;
}

const Viewer = forwardRef<ViewerHandle, ViewerProps>(function Viewer(
  { label, onGeometryLoaded, demoUrl, syncedCameraState, onCameraChange, isSyncEnabled = false },
  ref,
) {
  const { t } = useTranslation();
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [displayGeometry, setDisplayGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [hasVertexColors, setHasVertexColors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meshWarning, setMeshWarning] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [zoomSpeed, setZoomSpeed] = useState(1);
  const [rotateSpeed, setRotateSpeed] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const [gridFadeDistance, setGridFadeDistance] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orbitControlsRef = useRef<any>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const zoomToFitRef = useRef<(() => void) | null>(null);
  const measure = useMeasureTool();
  const [shadingMode] = useShadingMode();

  async function handleFile(file: File) {
    const result = await loadMeshGeometry(file);
    if (result.success) {
      setGeometry(result.data);
      let display = result.data;
      setDisplayGeometry(result.data);
      setHasVertexColors(false);
      setError(null);
      const repair = result.data.userData.meshRepair as MeshRepairReport | undefined;
      setMeshWarning(repair ? meshRepairWarning(repair) : null);
      measure.clearMeasurement();
      // The diff engine gets the stripped position-only geometry regardless
      // of color — only the mesh actually rendered in this viewer swaps to
      // the colored version, and only if the file is 3MF with real color.
      onGeometryLoaded?.(result.data, file);

      // drei's Grid fades out with distance from the camera's projection
      // onto the grid plane (fixed 100-unit default) — scale it to the
      // model's own diagonal so the visible patch always reaches past
      // every corner, with a floor so a tiny part doesn't look cropped.
      result.data.computeBoundingBox();
      const box = result.data.boundingBox;
      const boundingBoxSize: [number, number, number] = box
        ? box.getSize(new THREE.Vector3()).toArray()
        : [0, 0, 0];
      if (box) {
        setGridFadeDistance(Math.max(box.getSize(new THREE.Vector3()).length() * 1.5, 50));
      }

      if (file.name.toLowerCase().endsWith(".3mf")) {
        const colored = await loadMeshForDisplay(file);
        if (colored.success && colored.data.hasColor) {
          display = colored.data.geometry;
          setDisplayGeometry(colored.data.geometry);
          setHasVertexColors(true);
        }
      }

      // Uses whichever geometry actually ends up rendered/raycast against
      // (the color-swapped 3MF version when applicable), so vertex/edge
      // snapping matches what's on screen.
      measure.setGeometry(display, boundingBoxSize);
    } else {
      setError(result.error);
      setMeshWarning(null);
    }
  }

  async function handleLoadDemo() {
    if (!demoUrl) return;
    setIsLoadingDemo(true);
    try {
      const response = await fetch(demoUrl);
      const blob = await response.blob();
      const filename = demoUrl.split("/").pop() ?? "demo.stl";
      await handleFile(new File([blob], filename));
    } catch {
      setError("Failed to load demo model");
    } finally {
      setIsLoadingDemo(false);
    }
  }

  useImperativeHandle(ref, () => ({
    openFileDialog: () => fileInputRef.current?.click(),
    loadDemo: () => void handleLoadDemo(),
    loadFromBytes: (bytes, filename) => void handleFile(new File([bytes], filename)),
    captureScreenshot: () => canvasElRef.current?.toDataURL("image/png") ?? null,
    resetView: () => resetViewRef.current?.(),
    zoomToFit: () => zoomToFitRef.current?.(),
  }));

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-lg border bg-ink-950 ${
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
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setShowControls(!showControls)}
          title={t("viewer.rotateZoomSpeedTooltip")}
          className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400 hover:border-ink-500 hover:text-ink-50"
        >
          ⚙
        </button>
        {geometry && (
          <MeasureToolbar
            measure={measure}
            onZoomToFit={() => zoomToFitRef.current?.()}
            onResetView={() => resetViewRef.current?.()}
          />
        )}
      </div>
      {showControls && geometry && (
        <div className="absolute left-3 top-8 z-20 rounded border border-ink-700 bg-ink-900 p-2 text-xs text-ink-300">
          <div className="flex flex-col gap-1.5 w-32">
            <label className="flex items-center justify-between gap-2">
              <span>Rotate:</span>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={rotateSpeed}
                onChange={(e) => setRotateSpeed(parseFloat(e.target.value))}
                className="w-16 h-1"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Zoom:</span>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={zoomSpeed}
                onChange={(e) => setZoomSpeed(parseFloat(e.target.value))}
                className="w-16 h-1"
              />
            </label>
            <button
              type="button"
              onClick={() => zoomToFitRef.current?.()}
              className="mt-1 w-full rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400 hover:border-ink-500 hover:text-ink-50"
            >
              Zoom to model
            </button>
            <button
              type="button"
              onClick={() => resetViewRef.current?.()}
              className="mt-1 w-full rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400 hover:border-ink-500 hover:text-ink-50"
            >
              Reset view
            </button>
          </div>
        </div>
      )}
      {meshWarning && geometry && (
        <div
          className="absolute left-3 right-3 top-9 z-10 truncate rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-fg-300"
          title={meshWarning}
        >
          ⚠ {meshWarning}
        </div>
      )}
      {!geometry && (
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
                disabled={isLoadingDemo}
                className="rounded border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:border-ink-500 hover:text-ink-50 disabled:opacity-50"
              >
                {isLoadingDemo ? "Loading…" : "or load demo"}
              </button>
            )}
          </div>
        </div>
      )}
      <Canvas
        camera={{ position: [50, 50, 50], fov: 45 }}
        gl={{ preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          canvasElRef.current = gl.domElement;
        }}
      >
        <ModelScene gridFadeDistance={gridFadeDistance}>
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
                    on an already-compiled material in place doesn't
                    recompile its shader, so the change would silently be
                    ignored otherwise. */}
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
        <CameraSync
          syncedCameraState={syncedCameraState}
          onCameraChange={onCameraChange}
          isSyncEnabled={isSyncEnabled}
          zoomSpeed={zoomSpeed}
          rotateSpeed={rotateSpeed}
          onControlsReady={(controls) => {
            orbitControlsRef.current = controls;
          }}
        />
      </Canvas>
      <AxisLegend />
    </div>
  );
});

export default Viewer;
