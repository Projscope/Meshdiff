import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import AxisLegend from "./AxisLegend";
import ModelScene from "./ModelScene";
import BoundsResetBridge from "./BoundsResetBridge";
import ZoomToFitBridge from "./ZoomToFitBridge";
import MeasureToolbar from "./MeasureToolbar";
import MeasureSceneOverlay from "./MeasureSceneOverlay";
import { useMeasureTool } from "../lib/useMeasureTool";
import { useControlScheme, useOrbitMouseButtons } from "../lib/controlScheme";

interface ReadOnlyMeshViewerProps {
  /** Shown top-left. Pass the loaded version's label (e.g. "v1"); falls back to `fallbackLabel` when `geometry` is null. */
  label: string;
  fallbackLabel: string;
  geometry: THREE.BufferGeometry | null;
  color?: string;
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
  { label, fallbackLabel, geometry, color = "#4f8ff7" },
  ref,
) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const zoomToFitRef = useRef<(() => void) | null>(null);
  const [controlScheme] = useControlScheme();
  const mouseButtons = useOrbitMouseButtons(controlScheme);
  const measure = useMeasureTool();

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
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
      <div className="absolute left-3 top-2 z-10 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {geometry ? label : fallbackLabel}
        </span>
        {geometry && <MeasureToolbar measure={measure} onZoomToFit={() => zoomToFitRef.current?.()} onResetView={() => resetViewRef.current?.()} />}
      </div>
      {!geometry && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-neutral-600">
          No model loaded
        </div>
      )}
      <Canvas
        camera={{ position: [50, 50, 50], fov: 45 }}
        gl={{ preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          canvasElRef.current = gl.domElement;
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
                onClick={(event) => measure.onClick(event)}
                onPointerMove={measure.onPointerMove}
                onPointerOut={measure.onPointerOut}
              >
                <meshStandardMaterial color={color} />
              </mesh>
            </Bounds>
          )}
          <MeasureSceneOverlay measure={measure} />
        </ModelScene>
        <OrbitControls makeDefault enableZoom enablePan enableRotate mouseButtons={mouseButtons} />
      </Canvas>
      <AxisLegend />
    </div>
  );
});

export default ReadOnlyMeshViewer;
