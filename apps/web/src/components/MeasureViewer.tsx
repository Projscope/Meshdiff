import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { loadMeshGeometry } from "../engine/loadMesh";
import { loadMeshForDisplay } from "../engine/load3mfDisplayExtras";
import AxisLegend from "./AxisLegend";
import AxisLabels from "./AxisLabels";
import MeasurementOverlay from "./MeasurementOverlay";

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
 * Single-model viewer with a vertex-snapping measure tool — the "View &
 * Measure" counterpart to the Live Diff tool's side-by-side compare. Kept
 * separate from Viewer.tsx (used for the compare tool's A/B panes) rather
 * than folding measurement into it: the two tools' toolbars don't overlap,
 * and this stays a self-contained, single-purpose component.
 */
const MeasureViewer = forwardRef<MeasureViewerHandle, MeasureViewerProps>(function MeasureViewer(
  { demoUrl },
  ref,
) {
  const [displayGeometry, setDisplayGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [hasVertexColors, setHasVertexColors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gridPosition, setGridPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [axisOrigin, setAxisOrigin] = useState<[number, number, number]>([0, 0, 0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureA, setMeasureA] = useState<[number, number, number] | null>(null);
  const [measureB, setMeasureB] = useState<[number, number, number] | null>(null);
  const [measureHover, setMeasureHover] = useState<[number, number, number] | null>(null);

  async function handleFile(file: File) {
    setIsLoading(true);
    setIsMeasuring(false);
    setMeasureA(null);
    setMeasureB(null);
    setMeasureHover(null);

    const result = await loadMeshGeometry(file);
    if (!result.success) {
      setError(result.error);
      setDisplayGeometry(null);
      setIsLoading(false);
      return;
    }

    let display = result.data;
    setHasVertexColors(false);
    if (file.name.toLowerCase().endsWith(".3mf")) {
      const colored = await loadMeshForDisplay(file);
      if (colored.success && colored.data.hasColor) {
        display = colored.data.geometry;
        setHasVertexColors(true);
      }
    }
    setDisplayGeometry(display);
    setError(null);

    display.computeBoundingBox();
    const box = display.boundingBox;
    if (box) {
      // Slicer-exported files often place the model at its print-bed
      // position rather than local origin — ground the grid/axes under the
      // model's actual footprint instead of leaving them at world origin.
      const center = box.getCenter(new THREE.Vector3());
      const floorCenterWorld = new THREE.Vector3(center.x, center.y, box.min.z).applyMatrix4(GROUP_ROTATION);
      setGridPosition([floorCenterWorld.x, floorCenterWorld.y, floorCenterWorld.z]);
      setAxisOrigin([box.min.x, box.min.y, box.min.z]);
    }
    setIsLoading(false);
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
    setMeasureHover(snapped ? [snapped.x, snapped.y, snapped.z] : null);
  }

  function handleMeshClick(event: ThreeEvent<MouseEvent>) {
    if (!isMeasuring) return;
    event.stopPropagation();
    const snapped = nearestTriangleVertex(event);
    if (!snapped) return;
    if (!measureA) {
      setMeasureA([snapped.x, snapped.y, snapped.z]);
    } else {
      setMeasureB([snapped.x, snapped.y, snapped.z]);
      setIsMeasuring(false);
      setMeasureHover(null);
    }
  }

  function toggleMeasuring() {
    setIsMeasuring((prev) => !prev);
    setMeasureA(null);
    setMeasureB(null);
    setMeasureHover(null);
  }

  const distance =
    measureA && measureB ? new THREE.Vector3(...measureA).distanceTo(new THREE.Vector3(...measureB)) : null;

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-lg border bg-neutral-950 ${
        isDragOver ? "border-blue-500" : isMeasuring ? "border-amber-500" : "border-neutral-800"
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
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Model</span>
        {displayGeometry && (
          <button
            type="button"
            onClick={toggleMeasuring}
            className={`rounded border px-2 py-0.5 text-[11px] ${
              isMeasuring
                ? "border-amber-500 bg-amber-500/10 text-amber-300"
                : "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
            }`}
          >
            {isMeasuring ? "Click two points…" : "📏 Measure"}
          </button>
        )}
        {(measureA || measureB) && (
          <button
            type="button"
            onClick={() => {
              setMeasureA(null);
              setMeasureB(null);
              setMeasureHover(null);
            }}
            className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-neutral-500 hover:text-white"
          >
            Clear
          </button>
        )}
        {distance !== null && (
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
            {distance.toFixed(2)} mm
          </span>
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
        <Grid infiniteGrid position={gridPosition} cellColor="#333" sectionColor="#555" />
        {/* The grid is drei's default Y-up floor; this app's model data is
            Z-up, so the displayed content is rotated -90° around X to lay
            it flat on that floor. Purely a presentation transform. */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <group position={axisOrigin}>
            <axesHelper args={[30]} />
            <AxisLabels />
          </group>
          {displayGeometry && (
            <Bounds fit clip observe margin={1.2}>
              <mesh
                geometry={displayGeometry}
                onClick={handleMeshClick}
                onPointerMove={handleMeasureHover}
                onPointerOut={() => setMeasureHover(null)}
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
          <MeasurementOverlay pointA={measureA} pointB={measureB} hoverPoint={measureHover} />
        </group>
        <OrbitControls makeDefault />
      </Canvas>
      <AxisLegend />

      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950/80">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-emerald-500" />
          <p className="text-xs text-neutral-400">Loading model…</p>
        </div>
      )}
    </div>
  );
});

export default MeasureViewer;
