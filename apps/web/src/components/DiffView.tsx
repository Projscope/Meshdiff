import {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Canvas } from "@react-three/fiber";
import { Bounds } from "@react-three/drei";
import {
  VOXEL_ADDED,
  VOXEL_REMOVED,
  VOXEL_UNCHANGED,
  type VoxelDiffResult,
  type VoxelDiffStats,
} from "@meshdiff/shared/engine/diffVoxels";
import type { HoleChange } from "@meshdiff/shared/types/diff";
import { computeVoxelDiffOffThread } from "../lib/voxelDiffWorkerClient";
import SurfaceHeatmap from "./SurfaceHeatmap";
import AxisLegend from "./AxisLegend";
import ModelScene from "./ModelScene";
import BoundsResetBridge from "./BoundsResetBridge";
import ZoomToFitBridge from "./ZoomToFitBridge";
import CameraSync from "./CameraSync";
import DiffPaletteSelect from "./DiffPaletteSelect";
import GridToggle from "./GridToggle";
import EdgeOverlay from "./EdgeOverlay";
import MeasureSceneOverlay from "./MeasureSceneOverlay";
import { useMeasureTool } from "../lib/useMeasureTool";
import { useDiffColors } from "../lib/diffPalette";

export type DiffMode = "voxel" | "surface" | "overlay";
export type DiffAlignment = "none" | "floor" | "center";

// Friendly quick-picks for the tolerance slider — "sensitivity" in the
// sense of how readily a deviation counts as a real change rather than
// print/mesh noise: Low tolerates more (higher mm, coarser), High catches
// smaller deviations (lower mm, finer). Medium matches the slider's own
// existing default, so picking it is a no-op if that's already the value.
const SENSITIVITY_PRESETS: Array<{ label: string; toleranceMm: number }> = [
  { label: "Low", toleranceMm: 0.5 },
  { label: "Medium", toleranceMm: 0.15 },
  { label: "High", toleranceMm: 0.05 },
];

// A coarse first pass on a new mesh pair — cheap enough to land almost
// immediately, giving the viewer something to show while the real
// (default ~32/axis, see diffVoxels.ts) resolution computes in the
// background. Coarse enough to visibly differ from the fine pass (so it
// reads as "still loading", not as the final answer) without being so
// coarse it's a meaningless blob.
const COARSE_TARGET_VOXELS_PER_AXIS = 12;

interface DiffViewProps {
  geometryA: THREE.BufferGeometry | null;
  geometryB: THREE.BufferGeometry | null;
  onStatsChange?: (stats: (VoxelDiffStats & { toleranceMm: number }) | null) => void;
  /** Top-left overlay label. Defaults to "Diff". */
  label?: string;
  mode: DiffMode;
  onModeChange: (mode: DiffMode) => void;
  toleranceMm: number;
  onToleranceChange: (toleranceMm: number) => void;
  alignment: DiffAlignment;
  onAlignmentChange: (alignment: DiffAlignment) => void;
  /** Shared camera state for synchronized rotation. */
  syncedCameraState?: { position: [number, number, number]; target: [number, number, number] };
  /** Callback when camera rotates (if sync is enabled). */
  onCameraChange?: (state: { position: [number, number, number]; target: [number, number, number] }) => void;
  /** Whether sync is currently enabled. */
  isSyncEnabled?: boolean;
  /** The same diff's per-hole added/removed/resized breakdown (see
   * DetailedStatsPanel's aggregate counts of this same data) — lets the
   * Radius tool show a hole's before/after diameter instead of just its
   * current one, in Overlay mode. */
  holeChanges?: HoleChange[];
}

export interface DiffViewHandle {
  /** PNG data URL of the current render, or null if nothing has rendered yet. */
  captureScreenshot: () => string | null;
  /** Re-frames the camera on the diff, undoing any pan/rotate/zoom. */
  resetView: () => void;
  /** Zooms/re-centers to fit the diff, keeping the current rotation/angle. */
  zoomToFit: () => void;
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
  {
    geometryA,
    geometryB,
    onStatsChange,
    label = "Diff",
    mode,
    onModeChange,
    toleranceMm,
    onToleranceChange,
    alignment,
    onAlignmentChange,
    syncedCameraState,
    onCameraChange,
    isSyncEnabled = false,
    holeChanges = [],
  },
  ref,
) {
  const { t } = useTranslation();
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const zoomToFitRef = useRef<(() => void) | null>(null);
  const diffColors = useDiffColors();
  const measure = useMeasureTool();
  const sensitivityPresets = [
    { label: t("diffView.low"), toleranceMm: SENSITIVITY_PRESETS[0].toleranceMm },
    { label: t("diffView.medium"), toleranceMm: SENSITIVITY_PRESETS[1].toleranceMm },
    { label: t("diffView.high"), toleranceMm: SENSITIVITY_PRESETS[2].toleranceMm },
  ];

  // Neither engine (diffVoxels.ts, surfaceDeviation.ts) aligns meshes on its
  // own — both assume a shared coordinate frame and say so in their own
  // SAFETY comments. Doing the alignment once here, upstream of both diff
  // modes (Voxels via computeVoxelDiffOffThread, Surface via
  // SurfaceHeatmap), keeps them consistent with each other automatically.
  // "none" returns geometryB by reference unchanged — zero behavior change
  // and zero extra render cost for anyone who never touches the control.
  const { alignedGeometryB, alignmentOffsetMm } = useMemo(() => {
    if (alignment === "none" || !geometryA || !geometryB) {
      return { alignedGeometryB: geometryB, alignmentOffsetMm: null as [number, number, number] | null };
    }
    geometryA.computeBoundingBox();
    geometryB.computeBoundingBox();
    const boxA = geometryA.boundingBox;
    const boxB = geometryB.boundingBox;
    if (!boxA || !boxB) {
      return { alignedGeometryB: geometryB, alignmentOffsetMm: null as [number, number, number] | null };
    }

    let offset: [number, number, number];
    if (alignment === "floor") {
      // Z is the print-bed/height axis throughout this codebase (see the
      // overhang analysis in diffVoxels.ts using v.z - minZ) — rest B's
      // lowest point at A's, leaving X/Y untouched.
      offset = [0, 0, boxA.min.z - boxB.min.z];
    } else {
      const centerA = boxA.getCenter(new THREE.Vector3());
      const centerB = boxB.getCenter(new THREE.Vector3());
      offset = [centerA.x - centerB.x, centerA.y - centerB.y, centerA.z - centerB.z];
    }

    const clone = geometryB.clone();
    clone.translate(...offset);
    return { alignedGeometryB: clone, alignmentOffsetMm: offset };
  }, [geometryA, geometryB, alignment]);

  // Radius-tool wiring for Overlay mode only — it's the mode with both
  // meshes rendered as plain <mesh> elements already (Voxels has no
  // continuous surface to raycast against; Surface's heatmap mesh doesn't
  // forward pointer events yet). Detecting rims off both meshes merged
  // together means either version's hole answers a hover, regardless of
  // which one the raycast actually hit.
  useEffect(() => {
    if (mode !== "overlay" || !geometryA || !alignedGeometryB) return;
    measure.clearMeasurement();
    const merged = mergeGeometries([geometryA, alignedGeometryB], false);
    const box = merged.boundingBox ?? (merged.computeBoundingBox(), merged.boundingBox);
    const size = box ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1);
    measure.setGeometry(merged, [size.x, size.y, size.z]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, geometryA, alignedGeometryB]);

  // Once a rim is detected, look up whether it's one the diff engine
  // already flagged (see DetailedStatsPanel's holesAdded/Removed/
  // DiameterChanged counts, computed from this same array) — matched by
  // proximity to its recorded location, same idea as matchHoles() itself
  // uses server/worker-side. A generous-ish radius since the loop centroid
  // and the recorded hole center come from independent computations
  // (this one from the raw mesh, that one from detectCylindricalHoles on
  // the pre-alignment geometry) rather than needing to agree to sub-mm.
  const HOLE_CHANGE_MATCH_RADIUS_MM = 2;
  const activeLoopPoints = measure.radiusCommittedLoopPoints ?? measure.radiusPreviewLoopPoints;
  const matchedHoleChange = useMemo<HoleChange | null>(() => {
    if (!activeLoopPoints || holeChanges.length === 0) return null;
    const centroid = activeLoopPoints
      .reduce((acc, [x, y, z]) => [acc[0] + x, acc[1] + y, acc[2] + z], [0, 0, 0])
      .map((v) => v / activeLoopPoints.length) as [number, number, number];
    let best: HoleChange | null = null;
    let bestDist = HOLE_CHANGE_MATCH_RADIUS_MM;
    for (const change of holeChanges) {
      const [hx, hy, hz] = change.locationMm;
      const d = Math.hypot(centroid[0] - hx, centroid[1] - hy, centroid[2] - hz);
      if (d < bestDist) {
        bestDist = d;
        best = change;
      }
    }
    return best;
  }, [activeLoopPoints, holeChanges]);

  useImperativeHandle(ref, () => ({
    captureScreenshot: () => canvasElRef.current?.toDataURL("image/png") ?? null,
    resetView: () => resetViewRef.current?.(),
    zoomToFit: () => zoomToFitRef.current?.(),
  }));

  // Voxelization, BVH building, and dilation are expensive — they run in a
  // Web Worker (see voxelDiffWorkerClient.ts) so this doesn't block the
  // render thread while a diff computes, per CLAUDE.md "3D Performance
  // Rules". `requestIdRef` guards against a stale response landing after a
  // newer request was already fired (e.g. dragging the tolerance slider).
  const [diff, setDiff] = useState<(VoxelDiffResult & { error?: undefined }) | { error: string } | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [gridFadeDistance, setGridFadeDistance] = useState(100);
  // Whether the currently-shown `diff` is the coarse preview or the final,
  // full-resolution result — drives the "Refining…" label below and gates
  // onStatsChange (the sidebar's numbers shouldn't flash the coarse grid's
  // less-accurate volume delta before settling on the real one).
  const [diffQuality, setDiffQuality] = useState<"coarse" | "fine" | null>(null);
  const requestIdRef = useRef(0);
  const lastGeometryPairRef = useRef<{ a: THREE.BufferGeometry | null; b: THREE.BufferGeometry | null }>({
    a: null,
    b: null,
  });

  useEffect(() => {
    // drei's Grid fades out with distance from the camera's projection onto
    // the grid plane (fixed 100-unit default) — scale it to the combined
    // pair's own diagonal so the visible patch always reaches past every
    // corner, with a floor so a small pair doesn't look cropped. Computed
    // separately from the diff itself so it updates immediately rather
    // than waiting on voxelization.
    if (!geometryA || !alignedGeometryB) return;
    geometryA.computeBoundingBox();
    alignedGeometryB.computeBoundingBox();
    const boxA = geometryA.boundingBox;
    const boxB = alignedGeometryB.boundingBox;
    if (boxA && boxB) {
      const union = boxA.clone().union(boxB);
      setGridFadeDistance(Math.max(union.getSize(new THREE.Vector3()).length() * 1.5, 50));
    }
  }, [geometryA, alignedGeometryB]);

  useEffect(() => {
    if (!geometryA || !geometryB) {
      lastGeometryPairRef.current = { a: null, b: null };
      setDiff(null);
      setDiffQuality(null);
      setIsComputing(false);
      return;
    }

    // A brand-new mesh pair gets a coarse pass first — CLAUDE.md's
    // "Implement progressive loading: coarse voxel diff first, refine"
    // — so there's something on screen almost immediately instead of a
    // blank viewer for however long the full-resolution grid takes on a
    // big mesh. A tolerance-only change on the *same* pair skips straight
    // to the fine pass: it's already cheap (see computeVoxelDiffBase/
    // classifyVoxelDiff's split in diffVoxels.ts) and re-showing a coarser
    // grid on every slider tick would be a downgrade, not a preview.
    // alignedGeometryB is a new object reference whenever alignment changes
    // (see the useMemo above), so an alignment change is correctly treated
    // as a new pair here too — it needs a real re-voxelize, not just a
    // cheap reclassify.
    const isNewGeometryPair =
      geometryA !== lastGeometryPairRef.current.a || alignedGeometryB !== lastGeometryPairRef.current.b;
    lastGeometryPairRef.current = { a: geometryA, b: alignedGeometryB };

    const requestId = ++requestIdRef.current;
    setIsComputing(true);

    async function run() {
      if (isNewGeometryPair) {
        const coarse = await computeVoxelDiffOffThread(geometryA!, alignedGeometryB!, {
          toleranceMm,
          targetVoxelsPerAxis: COARSE_TARGET_VOXELS_PER_AXIS,
        });
        if (requestIdRef.current !== requestId) return; // superseded before the coarse pass even landed
        setDiff(coarse.success ? coarse.data : { error: coarse.error });
        setDiffQuality("coarse");
        if (!coarse.success) {
          setIsComputing(false);
          return; // don't bother refining a failed coarse pass
        }
      }

      const fine = await computeVoxelDiffOffThread(geometryA!, alignedGeometryB!, { toleranceMm });
      if (requestIdRef.current !== requestId) return; // superseded by a newer request
      setDiff(fine.success ? fine.data : { error: fine.error });
      setDiffQuality("fine");
      setIsComputing(false);
    }
    void run();
  }, [geometryA, alignedGeometryB, toleranceMm]);

  const isPending = !geometryA || !geometryB;
  const hasError = diff && "error" in diff;

  useEffect(() => {
    // Only the fine/final pass's numbers are accurate enough to surface —
    // the coarse preview exists purely for the 3D view's early feedback.
    if (diffQuality === "fine" && diff && !("error" in diff)) {
      onStatsChange?.({ ...diff.stats, toleranceMm });
    } else if (!diff) {
      onStatsChange?.(null);
    }
  }, [diff, diffQuality, toleranceMm, onStatsChange]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-ink-800 bg-ink-950">
      <div data-tour="viewerControls" className="absolute inset-x-3 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
          {label}
        </span>
        {isComputing && !isPending && (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-500">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-ink-700 border-t-ink-400" />
            {diffQuality === "coarse" ? t("diffView.refining") : t("diffView.computing")}
          </span>
        )}
        {!isPending && !hasError && (
          <div className="flex overflow-hidden rounded border border-ink-700 text-[11px]">
            <button
              type="button"
              onClick={() => onModeChange("voxel")}
              className={`px-2 py-0.5 ${mode === "voxel" ? "bg-ink-700 text-ink-50" : "text-ink-400"}`}
            >
              {t("diffView.voxels")}
            </button>
            <button
              type="button"
              onClick={() => onModeChange("surface")}
              className={`px-2 py-0.5 ${mode === "surface" ? "bg-ink-700 text-ink-50" : "text-ink-400"}`}
            >
              {t("diffView.surface")}
            </button>
            <button
              type="button"
              onClick={() => onModeChange("overlay")}
              title={t("diffView.overlayTooltip")}
              className={`px-2 py-0.5 ${mode === "overlay" ? "bg-ink-700 text-ink-50" : "text-ink-400"}`}
            >
              {t("diffView.overlay")}
            </button>
          </div>
        )}
        {!isPending && !hasError && mode === "overlay" && (
          // Radius/distance measuring — Overlay only for now (see the
          // wiring effect above for why): it's the mode with both meshes
          // rendered as plain, raycastable <mesh> elements already.
          <div className="flex overflow-hidden rounded border border-ink-700 text-[11px]">
            <button
              type="button"
              onClick={() => measure.toggleMeasuring("distance")}
              title={
                measure.isToolActive("distance")
                  ? t("viewer.clearDistanceTooltip")
                  : t("viewer.measureDistanceTooltip")
              }
              className={`px-2 py-0.5 ${measure.isToolActive("distance") ? "bg-amber-500 text-chrome-950" : "text-ink-400 hover:text-ink-50"}`}
            >
              📏
            </button>
            <button
              type="button"
              onClick={() => measure.toggleMeasuring("radius")}
              title={
                measure.isToolActive("radius")
                  ? t("viewer.clearRadiusTooltip")
                  : t("viewer.measureRadiusOverlayTooltip")
              }
              className={`px-2 py-0.5 ${measure.isToolActive("radius") ? "bg-sky-500 text-chrome-950" : "text-ink-400 hover:text-ink-50"}`}
            >
              ⌀
            </button>
          </div>
        )}
        {!isPending && !hasError && (
          <button
            type="button"
            onClick={() => zoomToFitRef.current?.()}
            title={t("viewer.zoomToFit")}
            className="rounded border border-ink-700 px-2 py-0.5 text-[11px] text-ink-300 hover:border-ink-500 hover:text-ink-50"
          >
            {t("diffView.zoomToModel")}
          </button>
        )}
        {!isPending && !hasError && (
          <button
            type="button"
            onClick={() => resetViewRef.current?.()}
            title={t("viewer.resetViewTooltip")}
            className="rounded border border-ink-700 px-2 py-0.5 text-[11px] text-ink-300 hover:border-ink-500 hover:text-ink-50"
          >
            ⟲ {t("diffView.resetView")}
          </button>
        )}
        {!isPending && !hasError && <GridToggle />}
        {!isPending && !hasError && (
          <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
            {t("diffView.tolerance")}
            <input
              type="range"
              min={0}
              max={5}
              step={0.05}
              value={toleranceMm}
              onChange={(event) => onToleranceChange(Number(event.target.value))}
              className="w-20 accent-ink-400"
            />
            <input
              type="number"
              min={0}
              step={0.05}
              value={toleranceMm}
              onChange={(event) => onToleranceChange(Math.max(0, Number(event.target.value)))}
              className="w-12 rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-ink-200"
            />
            {t("diffView.mm")}
            <div className="flex overflow-hidden rounded border border-ink-700">
              {sensitivityPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onToleranceChange(preset.toleranceMm)}
                  title={t("diffView.sensitivityTooltip", { label: preset.label, value: preset.toleranceMm })}
                  className={`px-1.5 py-0.5 ${
                    toleranceMm === preset.toleranceMm
                      ? "bg-ink-700 text-ink-50"
                      : "text-ink-400 hover:text-ink-50"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {!isPending && !hasError && (
          <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
            {t("diffView.align")}
            <select
              value={alignment}
              onChange={(event) => onAlignmentChange(event.target.value as DiffAlignment)}
              title={t("diffView.alignTooltip")}
              className="rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-ink-200"
            >
              <option value="none">{t("diffView.alignNone")}</option>
              <option value="floor">{t("diffView.alignFloor")}</option>
              <option value="center">{t("diffView.alignCenter")}</option>
            </select>
            {alignmentOffsetMm && (
              <span className="text-ink-500">
                Δ{alignment === "floor" ? "z" : "xyz"}{" "}
                {alignment === "floor"
                  ? `${alignmentOffsetMm[2] >= 0 ? "+" : ""}${alignmentOffsetMm[2].toFixed(2)}mm`
                  : `${alignmentOffsetMm.map((v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`).join("/")}mm`}
              </span>
            )}
          </div>
        )}
        {!isPending && !hasError && <DiffPaletteSelect />}
        {diff && !("error" in diff) && (
          // w-full forces its own line below the controls (rather than
          // trailing far to the right with a big gap after them, which is
          // what ml-auto on a mostly-empty first line produced).
          <div className="flex w-full gap-3 text-xs text-ink-300">
            <span className={diffColors.addedTextClass}>+{diff.stats.addedCount}</span>
            <span className={diffColors.removedTextClass}>-{diff.stats.removedCount}</span>
            <span className="text-ink-500">
              {diff.stats.approxVolumeDeltaPercent >= 0 ? "+" : ""}
              {diff.stats.approxVolumeDeltaPercent.toFixed(1)}% {t("diffView.volumeSuffix")}
            </span>
          </div>
        )}
      </div>

      {isPending && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center text-sm text-ink-500">
          {t("diffView.waitingForBoth")}
        </div>
      )}
      {hasError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center text-sm text-red-400">
          {diff.error}
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
          {diff && !("error" in diff) && mode === "voxel" && (
            // Keyed by the mesh pair so a new comparison remounts Bounds
            // (and BoundsResetBridge's captured pose) instead of reusing
            // whatever pose the previous pair had settled on.
            <Bounds key={`voxel-${geometryA?.uuid}-${geometryB?.uuid}`} fit clip observe margin={1.2}>
              <BoundsResetBridge resetRef={resetViewRef} />
              <ZoomToFitBridge zoomRef={zoomToFitRef} />
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
                color={diffColors.addedHex}
                opacity={0.9}
              />
              <VoxelLayer
                grid={diff.grid}
                voxelClass={VOXEL_REMOVED}
                count={diff.stats.removedCount}
                color={diffColors.removedHex}
                opacity={0.9}
              />
            </Bounds>
          )}
          {diff && !("error" in diff) && mode === "surface" && geometryA && geometryB && (
            <Bounds key={`surface-${geometryA.uuid}-${geometryB.uuid}`} fit clip observe margin={1.2}>
              <BoundsResetBridge resetRef={resetViewRef} />
              <ZoomToFitBridge zoomRef={zoomToFitRef} />
              <SurfaceHeatmap geometry={alignedGeometryB!} baseGeometry={geometryA} toleranceMm={toleranceMm} />
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
                color={diffColors.removedHex}
                opacity={0.5}
              />
            </Bounds>
          )}
          {diff && !("error" in diff) && mode === "overlay" && geometryA && alignedGeometryB && (
            // Both versions rendered at once, semi-transparent with dashed
            // edges — reuses the exact transparent-material treatment and
            // EdgeOverlay component already built for the single-model
            // viewers' shading-mode toggle, just applied to both meshes at
            // once here instead of one at a time.
            <Bounds key={`overlay-${geometryA.uuid}-${alignedGeometryB.uuid}`} fit clip observe margin={1.2}>
              <BoundsResetBridge resetRef={resetViewRef} />
              <ZoomToFitBridge zoomRef={zoomToFitRef} />
              <mesh
                geometry={geometryA}
                onPointerMove={measure.onPointerMove}
                onClick={(event) => measure.onClick(event)}
                onPointerOut={measure.onPointerOut}
              >
                <meshStandardMaterial
                  color={diffColors.removedHex}
                  transparent
                  opacity={0.35}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <EdgeOverlay geometry={geometryA} />
              <mesh
                geometry={alignedGeometryB}
                onPointerMove={measure.onPointerMove}
                onClick={(event) => measure.onClick(event)}
                onPointerOut={measure.onPointerOut}
              >
                <meshStandardMaterial
                  color={diffColors.addedHex}
                  transparent
                  opacity={0.35}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <EdgeOverlay geometry={alignedGeometryB} />
              <MeasureSceneOverlay measure={measure} holeChange={matchedHoleChange} />
            </Bounds>
          )}
        </ModelScene>
        <CameraSync syncedCameraState={syncedCameraState} onCameraChange={onCameraChange} isSyncEnabled={isSyncEnabled} />
      </Canvas>
      <AxisLegend />
    </div>
  );
});

export default DiffView;
