import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as THREE from "three";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import DetailedStatsPanel from "../../components/DetailedStatsPanel";
import DiffView, { type DiffAlignment, type DiffMode } from "../../components/DiffView";
import ReadOnlyMeshViewer from "../../components/ReadOnlyMeshViewer";
import { useDiffColors } from "../../lib/diffPalette";
import { loadVersionGeometry } from "../lib/analyzeVersion";
import { errorMessage } from "../lib/library";
import { useProject } from "../lib/useProject";

/** Any two versions of a project, side by side and combined, diffed live. */
export default function ComparePage() {
  const { projectId = "", aId = "", bId = "" } = useParams();
  const { detail, loadError } = useProject(projectId);
  const diffColors = useDiffColors();
  const [geometryA, setGeometryA] = useState<THREE.BufferGeometry | null>(null);
  const [geometryB, setGeometryB] = useState<THREE.BufferGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DiffMode>("voxel");
  const [toleranceMm, setToleranceMm] = useState(0.15);
  const [alignment, setAlignment] = useState<DiffAlignment>("none");
  const [stats, setStats] = useState<(VoxelDiffStats & { toleranceMm: number }) | null>(null);

  const versionA = detail?.versions.find((v) => v.id === aId) ?? null;
  const versionB = detail?.versions.find((v) => v.id === bId) ?? null;

  useEffect(() => {
    if (!versionA || !versionB) return;
    let cancelled = false;
    setGeometryA(null);
    setGeometryB(null);
    setStats(null);
    setError(null);
    Promise.all([loadVersionGeometry(projectId, versionA), loadVersionGeometry(projectId, versionB)])
      .then(([a, b]) => {
        if (cancelled) return;
        setGeometryA(a);
        setGeometryB(b);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // Reload only when one of the two files changes.
  }, [projectId, versionA?.id, versionA?.sha256, versionB?.id, versionB?.sha256]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <p role="alert" className="p-6 text-sm text-red-300">{loadError}</p>;
  if (detail === undefined) return <p className="p-6 text-sm text-ink-500">Loading…</p>;
  if (detail === null || !versionA || !versionB) {
    return (
      <div className="p-6 text-sm text-ink-400">
        One of these versions no longer exists. <Link to={`/p/${projectId}`} className="text-accent-fg-400 underline">Back to the project</Link>
      </div>
    );
  }

  let boundingBoxB: [number, number, number] = [0, 0, 0];
  if (geometryB) {
    geometryB.computeBoundingBox();
    const size = geometryB.boundingBox?.getSize(new THREE.Vector3());
    if (size) boundingBoxB = [size.x, size.y, size.z];
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-ink-500">
          <Link to={`/p/${projectId}`} className="hover:text-ink-300">← {detail.project.name}</Link>
          <span data-testid="compare-title">
            v{versionA.number} {versionA.fileName} → v{versionB.number} {versionB.fileName}
          </span>
        </div>
        {error && <div role="alert" className="rounded-sm border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="grid h-[240px] shrink-0 grid-cols-2 gap-2">
          <ReadOnlyMeshViewer label={`v${versionA.number}`} fallbackLabel="Version A" geometry={geometryA} />
          <ReadOnlyMeshViewer label={`v${versionB.number}`} fallbackLabel="Version B" geometry={geometryB} />
        </div>
        <div className="min-h-[300px] flex-1">
          <DiffView
            geometryA={geometryA}
            geometryB={geometryB}
            label="Combined"
            mode={mode}
            onModeChange={setMode}
            toleranceMm={toleranceMm}
            onToleranceChange={setToleranceMm}
            alignment={alignment}
            onAlignmentChange={setAlignment}
            onStatsChange={setStats}
            holeChanges={stats?.holeChanges}
          />
        </div>
      </div>

      <aside className="w-full shrink-0 overflow-y-auto rounded-lg border border-ink-800 bg-ink-900 p-3 text-sm lg:w-80">
        {stats ? (
          <>
            <div data-testid="compare-stats" className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-500">Added</div>
                <div className={`text-lg font-semibold ${diffColors.addedTextClass}`}>+{stats.addedCount.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-500">Removed</div>
                <div className={`text-lg font-semibold ${diffColors.removedTextClass}`}>-{stats.removedCount.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-500">Volume</div>
                <div className="text-lg font-semibold text-ink-100">
                  {stats.approxVolumeDeltaPercent >= 0 ? "+" : ""}
                  {stats.approxVolumeDeltaPercent.toFixed(1)}%
                </div>
              </div>
            </div>
            <div className="mt-4">
              <DetailedStatsPanel stats={stats} hasComparison boundingBoxB={boundingBoxB} />
            </div>
          </>
        ) : (
          <p className="text-xs text-ink-500">Computing the comparison…</p>
        )}
      </aside>
    </div>
  );
}
