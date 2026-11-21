import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import AxisLegend from "./AxisLegend";
import ModelScene from "./ModelScene";
import BoundsResetBridge from "./BoundsResetBridge";
import ZoomToFitBridge from "./ZoomToFitBridge";
import MeasureToolbar from "./MeasureToolbar";
import MeasureSceneOverlay from "./MeasureSceneOverlay";
import { useMeasureTool } from "../lib/useMeasureTool";
import { useControlScheme, useOrbitMouseButtons } from "../lib/controlScheme";
import { useShadingMode } from "../lib/shadingMode";
import { useClippingPlaneState, computeClippingPlane } from "../lib/clippingPlane";
import ClippingPlaneControl from "./ClippingPlaneControl";
import EdgeOverlay from "./EdgeOverlay";

interface ReadOnlyMeshViewerProps {
  /** Shown top-left. Pass the loaded version's label (e.g. "v1"); falls back to `fallbackLabel` when `geometry` is null. */
  label: string;
  fallbackLabel: string;
  geometry: THREE.BufferGeometry | null;
  color?: string;
  /** Extra scene content (e.g. comment pins), drawn in the same model space as the mesh. */
  children?: ReactNode;
  /** While set, clicks on the mesh go here instead of to the measure tool (e.g. while placing a comment). */
  onMeshClick?: (event: ThreeEvent<MouseEvent>) => void;
  /** Extra toolbar content next to the measure tools. */
  toolbarExtras?: ReactNode;
  /** Hides the measure/cross-section toolbar, for small viewers where it would cover the model. */
  hideToolbar?: boolean;
}

export interface ReadOnlyMeshViewerHandle {
  /** PNG data URL of the current render, or null if nothing has rendered yet. */
  captureScreenshot: () => string | null;
  /** Re-frames the camera on the loaded model, undoing any pan/rotate/zoom. */
  resetView: () => void;
  /** Zooms/re-centers to fit the model, keeping the current rotation/angle. */
  zoomToFit: () => void;
}

const ReadOnlyMeshViewer = forwardRef<ReadOnlyMeshViewerHandle, ReadOnlyMeshViewerProps>(function ReadOnlyMeshViewer(
  { label, fallbackLabel, geometry, color = "#4f8ff7", children, onMeshClick, toolbarExtras, hideToolbar },
  ref,
) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const zoomToFitRef = useRef<(() => void) | null>(null);
  const [controlScheme] = useControlScheme();
  const mouseButtons = useOrbitMouseButtons(controlScheme);
  const measure = useMeasureTool();
  const [shadingMode] = useShadingMode();
  const [clippingPlaneState] = useClippingPlaneState();
  const clipPlane = useMemo(
    () => computeClippingPlane(clippingPlaneState, geometry),
    [clippingPlaneState, geometry],
  );

  useImperativeHandle(ref, () => ({
    captureScreenshot: () => canvasElRef.current?.toDataURL("image/png") ?? null,
    resetView: () => resetViewRef.current?.(),
    zoomToFit: () => zoomToFitRef.current?.(),
  }));

  useEffect(() => {
    if (!geometry) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const size: [number, number, number] = box ? box.getSize(new THREE.Vector3()).toArray() : [0, 0, 0];
    measure.setGeometry(geometry, size);
    measure.clearMeasurement();
    // measure is a fresh object identity every render (plain hook, not
    // memoized) — including it would re-run this on every render instead
    // of only when the geometry itself actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-ink-800 bg-ink-950">
      <div className="absolute left-3 top-2 z-10 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
          {geometry ? label : fallbackLabel}
        </span>
        {geometry && !hideToolbar && <MeasureToolbar measure={measure} onZoomToFit={() => zoomToFitRef.current?.()} onResetView={() => resetViewRef.current?.()} />}
        {geometry && !hideToolbar && <ClippingPlaneControl />}
        {geometry && !hideToolbar && toolbarExtras}
      </div>
      {!geometry && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-ink-600">
          No model loaded
        </div>
      )}
      <Canvas
        camera={{ position: [50, 50, 50], fov: 45 }}
        gl={{ preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          canvasElRef.current = gl.domElement;
          gl.localClippingEnabled = true;
        }}
      >
        <ModelScene>
          {geometry && (
            // Keyed by geometry so a newly-loaded model remounts Bounds
            // (and BoundsResetBridge's captured "loaded" pose) instead of
            // reusing whatever pose the previous model had settled on.
            <Bounds key={geometry.uuid} fit clip observe margin={1.2}>
              <BoundsResetBridge resetRef={resetViewRef} />
              <ZoomToFitBridge zoomRef={zoomToFitRef} />
              <mesh
                geometry={geometry}
                onClick={(event) => (onMeshClick ? onMeshClick(event) : measure.onClick(event))}
                onPointerMove={measure.onPointerMove}
                onPointerOut={measure.onPointerOut}
              >
                {/* key forces a fresh material instance when shadingMode or
                    whether a clip plane is active changes — mutating
                    flatShading/clippingPlanes count on an already-compiled
                    material doesn't recompile its shader. */}
                <meshStandardMaterial
                  key={`${shadingMode}-${clipPlane ? "clip" : "noclip"}`}
                  color={color}
                  flatShading={shadingMode === "flat"}
                  transparent={shadingMode === "transparent"}
                  opacity={shadingMode === "transparent" ? 0.4 : 1}
                  depthWrite={shadingMode !== "transparent"}
                  side={shadingMode === "transparent" || clipPlane ? THREE.DoubleSide : THREE.FrontSide}
                  clippingPlanes={clipPlane ? [clipPlane] : []}
                />
              </mesh>
              {shadingMode === "transparent" && <EdgeOverlay geometry={geometry} />}
            </Bounds>
          )}
          {children}
          <MeasureSceneOverlay measure={measure} />
        </ModelScene>
        <OrbitControls makeDefault enableZoom enablePan enableRotate mouseButtons={mouseButtons} />
      </Canvas>
      <AxisLegend />
    </div>
  );
});

export default ReadOnlyMeshViewer;
