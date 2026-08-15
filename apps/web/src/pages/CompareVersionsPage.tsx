import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as THREE from "three";
import { getVersion, listVersions, getSubscription, type VersionDetail, type VersionSummary } from "../lib/projectsApi";
import { loadMeshGeometry } from "../engine/loadMesh";
import DiffView, { type DiffMode, type DiffViewHandle } from "../components/DiffView";
import DetailedStatsPanel from "../components/DetailedStatsPanel";
import ReadOnlyMeshViewer, { type ReadOnlyMeshViewerHandle } from "../components/ReadOnlyMeshViewer";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import { downloadDiffReportPdf } from "../lib/diffReportPdf";

export default function CompareVersionsPage() {
  const { projectId, versionAId, versionBId } = useParams<{
    projectId: string;
    versionAId: string;
    versionBId: string;
  }>();
  const navigate = useNavigate();
  const [versionA, setVersionA] = useState<VersionDetail | null>(null);
  const [versionB, setVersionB] = useState<VersionDetail | null>(null);
  const [geometryA, setGeometryA] = useState<THREE.BufferGeometry | null>(null);
  const [geometryB, setGeometryB] = useState<THREE.BufferGeometry | null>(null);
  const [mode, setMode] = useState<DiffMode>("voxel");
  const [toleranceMm, setToleranceMm] = useState(0.15);
  const [stats, setStats] = useState<(VoxelDiffStats & { toleranceMm: number }) | null>(null);
  const [boundingBoxB, setBoundingBoxB] = useState<[number, number, number]>([0, 0, 0]);
  const [error, setError] = useState<string | null>(null);
  const [allVersions, setAllVersions] = useState<VersionSummary[]>([]);
  const [isProOrTeam, setIsProOrTeam] = useState(false);
  const viewerARef = useRef<ReadOnlyMeshViewerHandle>(null);
  const viewerBRef = useRef<ReadOnlyMeshViewerHandle>(null);
  const diffViewRef = useRef<DiffViewHandle>(null);

  useEffect(() => {
    // Team billing isn't wired up yet (see CLAUDE.md) — "pro" is the only
    // paid tier the backend can actually return today.
    getSubscription().then((result) => {
      setIsProOrTeam(result.success && result.data.tier === "pro");
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    listVersions(projectId).then((result) => {
      if (result.success) {
        setAllVersions([...result.data].sort((a, b) => a.versionNumber - b.versionNumber));
      }
    });
  }, [projectId]);

  function handleSwitch(nextAId: string, nextBId: string) {
    if (!projectId || !nextAId || !nextBId) return;
    navigate(`/projects/${projectId}/compare/${nextAId}/${nextBId}`);
  }

  // Picking the version already on the other side swaps the two sides
  // instead of comparing a version against itself.
  function handleChangeA(nextAId: string) {
    handleSwitch(nextAId, nextAId === versionBId ? (versionAId ?? "") : (versionBId ?? ""));
  }
  function handleChangeB(nextBId: string) {
    handleSwitch(nextBId === versionAId ? (versionBId ?? "") : (versionAId ?? ""), nextBId);
  }

  useEffect(() => {
    if (!projectId || !versionAId || !versionBId) return;
    let cancelled = false;
    setVersionA(null);
    setVersionB(null);
    setGeometryA(null);
    setGeometryB(null);
    setError(null);

    async function loadVersion(id: string): Promise<{ detail: VersionDetail; geometry: THREE.BufferGeometry } | null> {
      const result = await getVersion(projectId!, id);
      if (!result.success) {
        if (!cancelled) setError(result.error);
        return null;
      }
      const response = await fetch(result.data.downloadUrl);
      const blob = await response.blob();
      const meshResult = await loadMeshGeometry(new File([blob], result.data.fileName));
      if (!meshResult.success) {
        if (!cancelled) setError(meshResult.error);
        return null;
      }
      return { detail: result.data, geometry: meshResult.data };
    }

    Promise.all([loadVersion(versionAId), loadVersion(versionBId)]).then(([a, b]) => {
      if (cancelled) return;
      if (a) {
        setVersionA(a.detail);
        setGeometryA(a.geometry);
      }
      if (b) {
        setVersionB(b.detail);
        setGeometryB(b.geometry);
        b.geometry.computeBoundingBox();
        const box = b.geometry.boundingBox;
        if (box) {
          const size = box.getSize(new THREE.Vector3());
          setBoundingBoxB([size.x, size.y, size.z]);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, versionAId, versionBId]);

  return (
    <div className="flex h-[calc(100vh-2rem)] w-full gap-4 px-4 py-4">
      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
          <ReadOnlyMeshViewer
            ref={viewerARef}
            label={versionA ? `v${versionA.versionNumber}` : "View A"}
            fallbackLabel="View A"
            geometry={geometryA}
            color="#4f8ff7"
          />
          <ReadOnlyMeshViewer
            ref={viewerBRef}
            label={versionB ? `v${versionB.versionNumber}` : "View B"}
            fallbackLabel="View B"
            geometry={geometryB}
            color="#4f8ff7"
          />
        </div>
        <div className="min-h-0 flex-1">
          <DiffView
            ref={diffViewRef}
            geometryA={geometryA}
            geometryB={geometryB}
            label="Combined"
            mode={mode}
            onModeChange={setMode}
            toleranceMm={toleranceMm}
            onToleranceChange={setToleranceMm}
            onStatsChange={setStats}
          />
        </div>

        {stats && (
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">Added voxels</div>
              <div className="mt-0.5 text-lg font-semibold text-emerald-400">
                +{stats.addedCount.toLocaleString()}
              </div>
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">Removed voxels</div>
              <div className="mt-0.5 text-lg font-semibold text-red-400">
                -{stats.removedCount.toLocaleString()}
              </div>
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">Volume delta</div>
              <div className="mt-0.5 text-lg font-semibold text-neutral-100">
                {stats.approxVolumeDeltaPercent >= 0 ? "+" : ""}
                {stats.approxVolumeDeltaPercent.toFixed(1)}%
              </div>
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">Tolerance</div>
              <div className="mt-0.5 text-lg font-semibold text-emerald-400">
                {stats.toleranceMm.toFixed(2)} mm
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-80 shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/projects/${projectId}`}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            ← Back to project
          </Link>
          {stats && (
            <button
              type="button"
              onClick={() =>
                downloadDiffReportPdf(stats, isProOrTeam, {
                  viewA: viewerARef.current?.captureScreenshot(),
                  viewB: viewerBRef.current?.captureScreenshot(),
                  combined: diffViewRef.current?.captureScreenshot(),
                })
              }
              className="rounded bg-emerald-500 px-2.5 py-1 text-xs font-medium text-neutral-950 hover:bg-emerald-400"
            >
              Download Report
            </button>
          )}
        </div>

        {allVersions.length > 1 && (
          <div className="mt-3 flex flex-col gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-xs">
            <span className="font-semibold uppercase tracking-widest text-neutral-500">Compare</span>
            <div className="flex items-center gap-2">
              <select
                value={versionAId ?? ""}
                onChange={(event) => handleChangeA(event.target.value)}
                className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-200"
              >
                {allVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber} — {v.fileName}
                  </option>
                ))}
              </select>
              <span className="shrink-0 text-neutral-600">→</span>
              <select
                value={versionBId ?? ""}
                onChange={(event) => handleChangeB(event.target.value)}
                className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-200"
              >
                {allVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber} — {v.fileName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {versionA && versionB && (
          <>
            <h1 className="mt-2 text-sm font-semibold text-white">
              v{versionA.versionNumber} → v{versionB.versionNumber}
            </h1>
            <p className="mt-0.5 truncate text-xs text-neutral-500">
              {versionA.fileName} vs {versionB.fileName}
            </p>

            <div className="mt-5">
              <DetailedStatsPanel stats={stats} hasComparison boundingBoxB={boundingBoxB} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
