import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { getVersion, listVersions, getProject, getSubscription, createComparisonShare, type VersionDetail, type VersionSummary } from "../lib/projectsApi";
import SampleCompareTour from "../components/SampleCompareTour";
import { loadMeshGeometry } from "../engine/loadMesh";
import DiffView, { type DiffMode, type DiffViewHandle, type DiffAlignment } from "../components/DiffView";
import DetailedStatsPanel from "../components/DetailedStatsPanel";
import ReadOnlyMeshViewer, { type ReadOnlyMeshViewerHandle } from "../components/ReadOnlyMeshViewer";
import ShareModal, { type ExpiresInDays } from "../components/ShareModal";
import LoadingModal from "../components/LoadingModal";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import { downloadDiffReportPdf } from "../lib/diffReportPdf";
import { useDiffColors } from "../lib/diffPalette";

export default function CompareVersionsPage() {
  const { projectId, versionAId, versionBId } = useParams<{
    projectId: string;
    versionAId: string;
    versionBId: string;
  }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const diffColors = useDiffColors();
  const [versionA, setVersionA] = useState<VersionDetail | null>(null);
  const [versionB, setVersionB] = useState<VersionDetail | null>(null);
  const [geometryA, setGeometryA] = useState<THREE.BufferGeometry | null>(null);
  const [geometryB, setGeometryB] = useState<THREE.BufferGeometry | null>(null);
  const [mode, setMode] = useState<DiffMode>("voxel");
  const [toleranceMm, setToleranceMm] = useState(0.15);
  const [alignment, setAlignment] = useState<DiffAlignment>("none");
  const [stats, setStats] = useState<(VoxelDiffStats & { toleranceMm: number }) | null>(null);
  const [boundingBoxB, setBoundingBoxB] = useState<[number, number, number]>([0, 0, 0]);
  const [error, setError] = useState<string | null>(null);
  const [allVersions, setAllVersions] = useState<VersionSummary[]>([]);
  const [isSampleProject, setIsSampleProject] = useState(false);
  const [isProOrTeam, setIsProOrTeam] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isShareSubmitting, setIsShareSubmitting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const viewerARef = useRef<ReadOnlyMeshViewerHandle>(null);
  const viewerBRef = useRef<ReadOnlyMeshViewerHandle>(null);
  const diffViewRef = useRef<DiffViewHandle>(null);

  useEffect(() => {
    // accountStatus (not a raw tier === 'pro' check) mirrors the backend's
    // getAccountAccess() — true for Pro, a Team subscription's owner, and a
    // team member riding the owner's seats (whose own tier is 'free').
    getSubscription().then((result) => {
      setIsProOrTeam(result.success && result.data.accountStatus === "pro");
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    listVersions(projectId).then((result) => {
      if (result.success) {
        setAllVersions([...result.data].sort((a, b) => a.versionNumber - b.versionNumber));
      }
    });
    // Only fetched to gate SampleCompareTour — the walkthrough's second leg,
    // handed off from ProjectDetailPage's SampleProjectTour.
    getProject(projectId).then((result) => {
      if (result.success) setIsSampleProject(result.data.isSample);
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
    setStats(null);
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

  function handleShareClick() {
    setIsShareModalOpen(true);
    setShareError(null);
    setShareUrl(null);
  }

  async function handleShareSubmit(expiresInDays: ExpiresInDays) {
    if (!projectId || !versionAId || !versionBId || !stats) return;
    setIsShareSubmitting(true);
    setShareError(null);

    const result = await createComparisonShare(
      projectId,
      versionAId,
      versionBId,
      // Shared links only persist voxel/surface today (see migration
      // 0011_shares.sql's check constraint) — Overlay is a live-viewing
      // mode, not (yet) a shareable one, so it falls back to Voxels rather
      // than failing the share.
      mode === "overlay" ? "voxel" : mode,
      stats.toleranceMm,
      expiresInDays,
    );

    if (result.success) {
      setShareUrl(result.data.url);
    } else {
      setShareError(result.error);
    }
    setIsShareSubmitting(false);
  }

  // "Fully loaded" means both meshes have been fetched/parsed AND DiffView
  // has finished computing the diff between them (stats only lands once
  // that's done) — not just the two side viewers, so the combined view
  // isn't left half-rendered under the modal.
  const isFullyLoaded = geometryA !== null && geometryB !== null && stats !== null;

  return (
    // Stacks in DOM order on narrow screens (V1, V2, Combined, then the
    // stats sidebar) instead of squeezing the desktop's fixed-height
    // side-by-side layout down to unusable slivers — each viewer needs an
    // explicit height at these breakpoints since h-full alone (see
    // ReadOnlyMeshViewer/DiffView) has nothing to inherit from once the
    // page is allowed to grow/scroll naturally instead of being pinned to
    // one viewport-height row.
    <div className="flex w-full flex-col gap-4 px-4 py-4 lg:h-[calc(100vh-2rem)] lg:flex-row">
      <div className="flex flex-1 flex-col gap-2 lg:overflow-hidden">
        <div className="grid h-[520px] grid-cols-1 gap-2 sm:h-[260px] sm:grid-cols-2 lg:h-auto lg:min-h-0 lg:flex-1">
          <ReadOnlyMeshViewer
            ref={viewerARef}
            label={versionA ? `v${versionA.versionNumber}` : t("compare.viewA")}
            fallbackLabel={t("compare.viewA")}
            geometry={geometryA}
            color="#4f8ff7"
          />
          <ReadOnlyMeshViewer
            ref={viewerBRef}
            label={versionB ? `v${versionB.versionNumber}` : t("compare.viewB")}
            fallbackLabel={t("compare.viewB")}
            geometry={geometryB}
            color="#4f8ff7"
          />
        </div>
        <div data-tour="diffViewer" className="h-[420px] lg:h-auto lg:min-h-0 lg:flex-1">
          <DiffView
            ref={diffViewRef}
            geometryA={geometryA}
            geometryB={geometryB}
            label={t("compare.combined")}
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

        {stats && (
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded border border-ink-800 bg-ink-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-ink-500">{t("compare.addedVoxels")}</div>
              <div className={`mt-0.5 text-lg font-semibold ${diffColors.addedTextClass}`}>
                +{stats.addedCount.toLocaleString()}
              </div>
            </div>
            <div className="rounded border border-ink-800 bg-ink-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-ink-500">{t("compare.removedVoxels")}</div>
              <div className={`mt-0.5 text-lg font-semibold ${diffColors.removedTextClass}`}>
                -{stats.removedCount.toLocaleString()}
              </div>
            </div>
            <div className="rounded border border-ink-800 bg-ink-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-ink-500">{t("compare.volumeDelta")}</div>
              <div className="mt-0.5 text-lg font-semibold text-ink-100">
                {stats.approxVolumeDeltaPercent >= 0 ? "+" : ""}
                {stats.approxVolumeDeltaPercent.toFixed(1)}%
              </div>
            </div>
            <div className="rounded border border-ink-800 bg-ink-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-ink-500">{t("compare.tolerance")}</div>
              <div className="mt-0.5 text-lg font-semibold text-ink-100">
                {stats.toleranceMm.toFixed(2)} mm
              </div>
            </div>
          </div>
        )}
      </div>

      {/* w-96 (not w-80) so the widest rows (e.g. "Bounding Box") never
          bump into the scrollbar; overflow-x-hidden also guards against the
          CSS quirk where overflow-y: auto alone makes overflow-x compute to
          auto too, popping a horizontal scrollbar over a single stray pixel. */}
      <div className="w-full shrink-0 lg:w-96 lg:overflow-y-auto lg:overflow-x-hidden">
        <Link
          to={`/projects/${projectId}`}
          className="text-xs text-ink-500 hover:text-ink-300"
        >
          ← {t("compare.backToProject")}
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleShareClick}
            className="flex flex-1 items-center justify-center gap-1.5 rounded bg-accent-500 px-2.5 py-1.5 text-xs font-medium text-chrome-950 hover:bg-accent-400"
          >
            🔗 {t("compare.share")}
          </button>
          {stats && (
            <button
              type="button"
              onClick={() =>
                downloadDiffReportPdf(stats, isProOrTeam, boundingBoxB, {
                  viewA: viewerARef.current?.captureScreenshot(),
                  viewB: viewerBRef.current?.captureScreenshot(),
                  combined: diffViewRef.current?.captureScreenshot(),
                })
              }
              className="flex-1 rounded bg-accent-500 px-2.5 py-1.5 text-xs font-medium text-chrome-950 hover:bg-accent-400"
            >
              {t("compare.downloadReport")}
            </button>
          )}
        </div>

        {allVersions.length > 1 && (
          <div className="mt-3 flex flex-col gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2.5 text-xs">
            <span className="font-semibold uppercase tracking-widest text-ink-500">{t("compare.compareLabel")}</span>
            <div className="flex items-center gap-2">
              <select
                value={versionAId ?? ""}
                onChange={(event) => handleChangeA(event.target.value)}
                className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-950 px-2 py-1.5 text-ink-200"
              >
                {allVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber} — {v.fileName}
                  </option>
                ))}
              </select>
              <span className="shrink-0 text-ink-600">→</span>
              <select
                value={versionBId ?? ""}
                onChange={(event) => handleChangeB(event.target.value)}
                className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-950 px-2 py-1.5 text-ink-200"
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
            <h1 className="mt-2 text-sm font-semibold text-ink-50">
              v{versionA.versionNumber} → v{versionB.versionNumber}
            </h1>
            <p className="mt-0.5 truncate text-xs text-ink-500">
              {versionA.fileName} vs {versionB.fileName}
            </p>

            <div data-tour="deltaPanel" className="mt-5">
              <DetailedStatsPanel stats={stats} hasComparison boundingBoxB={boundingBoxB} />
            </div>
          </>
        )}

        {isShareModalOpen && (
          <ShareModal
            onClose={() => {
              setIsShareModalOpen(false);
              setShareUrl(null);
              setShareError(null);
            }}
            onSubmit={handleShareSubmit}
            isSubmitting={isShareSubmitting}
            error={shareError}
            shareUrl={shareUrl}
          />
        )}
      </div>

      {!isFullyLoaded && !error && (
        <LoadingModal title={t("compare.loadingTitle")} subtitle={t("compare.loadingSubtitle")} />
      )}

      {isSampleProject && isFullyLoaded && <SampleCompareTour />}
    </div>
  );
}
