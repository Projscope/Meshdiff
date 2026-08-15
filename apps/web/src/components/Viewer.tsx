import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { loadMeshGeometry } from "../engine/loadMesh";
import { loadMeshForDisplay } from "../engine/load3mfDisplayExtras";
import AxisLegend from "./AxisLegend";
import AxisLabels from "./AxisLabels";

interface CameraSyncProps {
  syncedCameraState: { position: [number, number, number]; target: [number, number, number] } | undefined;
  onCameraChange: ((state: { position: [number, number, number]; target: [number, number, number] }) => void) | undefined;
  isSyncEnabled: boolean;
  zoomSpeed?: number;
  rotateSpeed?: number;
  onControlsReady?: (controls: any) => void;
}

function CameraSync({ syncedCameraState, onCameraChange, isSyncEnabled, zoomSpeed = 1, rotateSpeed = 1, onControlsReady }: CameraSyncProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const readyRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastPosRef = useRef(new THREE.Vector3());
  const lastTargetRef = useRef(new THREE.Vector3());
  const lastLocalPosRef = useRef(new THREE.Vector3());
  const userInteractingRef = useRef(false);
  const interactionCooldownRef = useRef(0);
  const idleFramesRef = useRef(0);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls?.target) return;

    // Set speeds every frame (safer than useEffect in R3F)
    controls.zoomSpeed = zoomSpeed;
    controls.rotateSpeed = rotateSpeed;

    // Call onControlsReady once
    if (!readyRef.current) {
      readyRef.current = true;
      lastPosRef.current.copy(camera.position);
      lastTargetRef.current.copy(controls.target);
      lastLocalPosRef.current.copy(camera.position);
      onControlsReady?.(controls);
    }

    // Only do sync logic if sync is enabled
    if (!isSyncEnabled) return;

    frameCountRef.current++;

    // Skip sync for first 60 frames (model loading phase to avoid shake)
    const isLoading = frameCountRef.current < 60;

    // Detect if user is actively rotating (not zooming)
    // Zoom = distance from camera to target changed significantly
    // Rotation = camera moved but distance to target stayed roughly same
    const curDist = camera.position.distanceTo(controls.target);
    const lastDist = lastLocalPosRef.current.distanceTo(controls.target);
    const distanceChange = Math.abs(curDist - lastDist);
    const positionMovement = camera.position.distanceTo(lastLocalPosRef.current);

    // If distance changed a lot, it's zoom - don't block sync
    // If position moved but distance didn't change much, it's rotation - block sync
    if (positionMovement > 0.5 && distanceChange < 0.15) {
      userInteractingRef.current = true;
      interactionCooldownRef.current = 15;
      idleFramesRef.current = 0;
    }
    if (interactionCooldownRef.current > 0) {
      interactionCooldownRef.current--;
    } else {
      userInteractingRef.current = false;
    }

    // Track idle frames (no user interaction)
    if (!userInteractingRef.current && positionMovement < 0.01) {
      idleFramesRef.current++;
    } else {
      idleFramesRef.current = 0;
    }
    lastLocalPosRef.current.copy(camera.position);

    // Broadcast local changes every frame
    const curPos = camera.position;
    const curTarget = controls.target;

    const posChanged = !curPos.equals(lastPosRef.current);
    const targetChanged = !curTarget.equals(lastTargetRef.current);

    if (posChanged || targetChanged) {
      lastPosRef.current.copy(curPos);
      lastTargetRef.current.copy(curTarget);

      onCameraChange?.({
        position: curPos.toArray() as [number, number, number],
        target: curTarget.toArray() as [number, number, number],
      });
    }

    // Apply synced state: skip during loading, during rotation, and until truly idle (5+ idle frames)
    if (syncedCameraState && !isLoading && !userInteractingRef.current && idleFramesRef.current >= 5 && frameCountRef.current % 2 === 0) {
      camera.position.set(...syncedCameraState.position);
      controls.target.set(...syncedCameraState.target);
      controls.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableZoom={true}
      enablePan={true}
      enableRotate={true}
      autoRotate={false}
    />
  );
}

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
}

const Viewer = forwardRef<ViewerHandle, ViewerProps>(function Viewer(
  { label, onGeometryLoaded, demoUrl, syncedCameraState, onCameraChange, isSyncEnabled = false },
  ref,
) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [displayGeometry, setDisplayGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [hasVertexColors, setHasVertexColors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [zoomSpeed, setZoomSpeed] = useState(1);
  const [rotateSpeed, setRotateSpeed] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const [gridFadeDistance, setGridFadeDistance] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orbitControlsRef = useRef<any>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  async function handleFile(file: File) {
    const result = await loadMeshGeometry(file);
    if (result.success) {
      setGeometry(result.data);
      setDisplayGeometry(result.data);
      setHasVertexColors(false);
      setError(null);
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
      if (box) {
        setGridFadeDistance(Math.max(box.getSize(new THREE.Vector3()).length() * 1.5, 50));
      }

      if (file.name.toLowerCase().endsWith(".3mf")) {
        const colored = await loadMeshForDisplay(file);
        if (colored.success && colored.data.hasColor) {
          setDisplayGeometry(colored.data.geometry);
          setHasVertexColors(true);
        }
      }
    } else {
      setError(result.error);
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
  }));

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-lg border bg-neutral-950 ${
        isDragOver ? "border-blue-500" : "border-neutral-800"
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
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setShowControls(!showControls)}
          className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:border-neutral-500 hover:text-white"
        >
          ⚙
        </button>
      </div>
      {showControls && geometry && (
        <div className="absolute left-3 top-8 z-20 rounded border border-neutral-700 bg-neutral-900 p-2 text-xs text-neutral-300">
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
              onClick={() => {
                if (orbitControlsRef.current) {
                  orbitControlsRef.current.reset();
                }
              }}
              className="mt-1 w-full rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:border-neutral-500 hover:text-white"
            >
              Reset view
            </button>
          </div>
        </div>
      )}
      {!geometry && (
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
                disabled={isLoadingDemo}
                className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 hover:text-white disabled:opacity-50"
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
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />
        <Grid infiniteGrid fadeDistance={gridFadeDistance} cellColor="#333" sectionColor="#555" />
        {/* The grid is drei's default Y-up floor; this app's model data is
            Z-up (see diffVoxels.ts's gravity vector), so the displayed
            content is rotated -90° around X to lay it flat on that floor.
            Purely a presentation transform — doesn't touch the geometry
            used for diffing/printability. */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <axesHelper args={[30]} />
          <AxisLabels />
          {displayGeometry && (
            <Bounds fit clip observe margin={1.2}>
              <mesh geometry={displayGeometry}>
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
        </group>
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
