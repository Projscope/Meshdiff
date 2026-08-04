import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useLayoutEffect,
  useEffect,
} from "react";
import * as THREE from "three";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import {
  computeVoxelDiff,
  VOXEL_ADDED,
  VOXEL_REMOVED,
  VOXEL_UNCHANGED,
  type VoxelDiffResult,
  type VoxelDiffStats,
} from "../engine/diffVoxels";
import SurfaceHeatmap from "./SurfaceHeatmap";

export type DiffMode = "voxel" | "surface";

interface DiffViewProps {
  geometryA: THREE.BufferGeometry | null;
  geometryB: THREE.BufferGeometry | null;
  onStatsChange?: (stats: (VoxelDiffStats & { toleranceMm: number }) | null) => void;
  mode: DiffMode;
  onModeChange: (mode: DiffMode) => void;
  toleranceMm: number;
  onToleranceChange: (toleranceMm: number) => void;
  /** Shared camera state for synchronized rotation. */
  syncedCameraState?: { position: [number, number, number]; target: [number, number, number] };
  /** Callback when camera rotates (if sync is enabled). */
  onCameraChange?: (state: { position: [number, number, number]; target: [number, number, number] }) => void;
  /** Whether sync is currently enabled. */
  isSyncEnabled?: boolean;
}

export interface DiffViewHandle {
  /** PNG data URL of the current render, or null if nothing has rendered yet. */
  captureScreenshot: () => string | null;
}

interface CameraSyncProps {
  syncedCameraState: { position: [number, number, number]; target: [number, number, number] } | undefined;
  onCameraChange: ((state: { position: [number, number, number]; target: [number, number, number] }) => void) | undefined;
  isSyncEnabled: boolean;
}

function CameraSync({ syncedCameraState, onCameraChange, isSyncEnabled }: CameraSyncProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
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

    // Only do sync logic if sync is enabled
    if (!isSyncEnabled) return;

    frameCountRef.current++;

    // Initialize on first frame
    if (frameCountRef.current === 1) {
      lastPosRef.current.copy(camera.position);
      lastTargetRef.current.copy(controls.target);
      lastLocalPosRef.current.copy(camera.position);
    }

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

interface VoxelLayerProps {
  grid: VoxelDiffResult["grid"];
  voxelClass: number;
  count: number;
  color: string;
  opacity: number;
}

function voxelCenter(
  grid: VoxelDiffResult["grid"],
  i: number,
  j: number,
  k: number,
): [number, number, number] {
  const half = grid.resolutionMm / 2;
  return [
    grid.originMm[0] + i * grid.resolutionMm + half,
    grid.originMm[1] + j * grid.resolutionMm + half,
    grid.originMm[2] + k * grid.resolutionMm + half,
  ];
}

function VoxelLayer({ grid, voxelClass, count, color, opacity }: VoxelLayerProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    const matrix = new THREE.Matrix4();
    const [dx, dy, dz] = grid.dims;
    let instanceIndex = 0;

    for (let k = 0; k < dz; k++) {
      for (let j = 0; j < dy; j++) {
        for (let i = 0; i < dx; i++) {
          const index = i + j * dx + k * dx * dy;
          if (grid.classification[index] !== voxelClass) continue;
          const [x, y, z] = voxelCenter(grid, i, j, k);
          matrix.setPosition(x, y, z);
          mesh.setMatrixAt(instanceIndex, matrix);
          instanceIndex++;
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [grid, voxelClass, count]);

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[grid.resolutionMm, grid.resolutionMm, grid.resolutionMm]} />
      <meshStandardMaterial color={color} transparent opacity={opacity} />
    </instancedMesh>
  );
}

const DiffView = forwardRef<DiffViewHandle, DiffViewProps>(function DiffView(
  { geometryA, geometryB, onStatsChange, mode, onModeChange, toleranceMm, onToleranceChange, syncedCameraState, onCameraChange, isSyncEnabled = false },
  ref,
) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  useImperativeHandle(ref, () => ({
    captureScreenshot: () => canvasElRef.current?.toDataURL("image/png") ?? null,
  }));

  // TODO: Move this to a Web Worker to avoid blocking the render thread during diff computation
  // The voxelization, BVH building, and dilation are expensive operations that should run off-thread
  // See CLAUDE.md "3D Performance Rules": "All heavy computation runs in Web Workers"
  const diff = useMemo(() => {
    if (!geometryA || !geometryB) return null;
    const result = computeVoxelDiff(geometryA, geometryB, { toleranceMm });
    return result.success ? result.data : { error: result.error };
  }, [geometryA, geometryB, toleranceMm]);

  const isPending = !geometryA || !geometryB;
  const hasError = diff && "error" in diff;

  useEffect(() => {
    if (diff && !("error" in diff)) {
      onStatsChange?.({ ...diff.stats, toleranceMm });
    } else {
      onStatsChange?.(null);
    }
  }, [diff, toleranceMm, onStatsChange]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
      <div className="absolute left-3 top-2 z-10 flex items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Diff
        </span>
        {!isPending && !hasError && (
          <div className="flex overflow-hidden rounded border border-neutral-700 text-[11px]">
            <button
              type="button"
              onClick={() => onModeChange("voxel")}
              className={`px-2 py-0.5 ${mode === "voxel" ? "bg-neutral-700 text-white" : "text-neutral-400"}`}
            >
              Voxels
            </button>
            <button
              type="button"
              onClick={() => onModeChange("surface")}
              className={`px-2 py-0.5 ${mode === "surface" ? "bg-neutral-700 text-white" : "text-neutral-400"}`}
            >
              Surface
            </button>
          </div>
        )}
        {!isPending && !hasError && (
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            Tolerance
            <input
              type="range"
              min={0}
              max={5}
              step={0.05}
              value={toleranceMm}
              onChange={(event) => onToleranceChange(Number(event.target.value))}
              className="w-20 accent-neutral-400"
            />
            <input
              type="number"
              min={0}
              step={0.05}
              value={toleranceMm}
              onChange={(event) => onToleranceChange(Math.max(0, Number(event.target.value)))}
              className="w-12 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-neutral-200"
            />
            mm
          </div>
        )}
      </div>

      {isPending && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center text-sm text-neutral-500">
          Load Version A and Version B to compute a diff
        </div>
      )}
      {hasError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center text-sm text-red-400">
          {diff.error}
        </div>
      )}
      {diff && !("error" in diff) && (
        <div className="absolute right-3 top-2 z-10 flex gap-3 text-xs text-neutral-300">
          <span className="text-emerald-400">+{diff.stats.addedCount}</span>
          <span className="text-red-400">-{diff.stats.removedCount}</span>
          <span className="text-neutral-500">
            {diff.stats.approxVolumeDeltaPercent >= 0 ? "+" : ""}
            {diff.stats.approxVolumeDeltaPercent.toFixed(1)}% volume
          </span>
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
        <Grid infiniteGrid cellColor="#333" sectionColor="#555" />
        {diff && !("error" in diff) && mode === "voxel" && (
          <Bounds fit clip observe margin={1.2}>
            <VoxelLayer
              grid={diff.grid}
              voxelClass={VOXEL_UNCHANGED}
              count={diff.stats.unchangedCount}
              color="#6b7280"
              opacity={0.15}
            />
            <VoxelLayer
              grid={diff.grid}
              voxelClass={VOXEL_ADDED}
              count={diff.stats.addedCount}
              color="#22c55e"
              opacity={0.9}
            />
            <VoxelLayer
              grid={diff.grid}
              voxelClass={VOXEL_REMOVED}
              count={diff.stats.removedCount}
              color="#ef4444"
              opacity={0.9}
            />
          </Bounds>
        )}
        {diff && !("error" in diff) && mode === "surface" && geometryA && geometryB && (
          <Bounds fit clip observe margin={1.2}>
            <SurfaceHeatmap geometry={geometryB} baseGeometry={geometryA} toleranceMm={toleranceMm} />
            {/*
              The vertex-based ghost in SurfaceHeatmap only catches removed
              material that used to be part of A's own surface (a trimmed
              boss, a shortened feature). It can't see an interior hollow-out
              where A was solid and B's outer silhouette didn't change — A
              simply has no vertex sitting in that interior volume to test.
              The voxel grid samples actual 3D space instead of existing
              vertices, so it catches that case too; overlay its removed
              cells here as the general-case fallback.
            */}
            <VoxelLayer
              grid={diff.grid}
              voxelClass={VOXEL_REMOVED}
              count={diff.stats.removedCount}
              color="#ef4444"
              opacity={0.5}
            />
          </Bounds>
        )}
        <CameraSync syncedCameraState={syncedCameraState} onCameraChange={onCameraChange} isSyncEnabled={isSyncEnabled} />
      </Canvas>
    </div>
  );
});

export default DiffView;
