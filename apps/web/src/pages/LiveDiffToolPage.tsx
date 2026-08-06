import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as THREE from "three";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import Viewer, { type ViewerHandle } from "../components/Viewer";
import DiffView, { type DiffViewHandle, type DiffMode } from "../components/DiffView";
import ReportGateModal from "../components/ReportGateModal";
import ShareModal, { type ExpiresInDays } from "../components/ShareModal";
import ShareErrorModal from "../components/ShareErrorModal";
import DetailedStatsPanel from "../components/DetailedStatsPanel";
import { WAITLIST_ENDPOINT, SHARE_CREATE_ENDPOINT, shareGetEndpoint } from "../lib/api";

type DiffStats = VoxelDiffStats & { toleranceMm: number };

function downloadReport(stats: DiffStats) {
  const report = {
    generatedAt: new Date().toISOString(),
    tool: "Meshdiff",
    note:
      "Partial report — reflects the voxel diff engine only. Wall thickness, " +
      "overhang, and hole checks are not implemented yet (see CLAUDE.md).",
    toleranceMm: stats.toleranceMm,
    addedVoxelCount: stats.addedCount,
    removedVoxelCount: stats.removedCount,
    unchangedVoxelCount: stats.unchangedCount,
    voxelVolumeMm3: stats.voxelVolumeMm3,
    approxVolumeDeltaMm3: stats.approxVolumeDeltaMm3,
    approxVolumeDeltaPercent: stats.approxVolumeDeltaPercent,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meshdiff-report-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export default function LiveDiffToolPage() {
  const [geometryA, setGeometryA] = useState<THREE.BufferGeometry | null>(null);
  const [geometryB, setGeometryB] = useState<THREE.BufferGeometry | null>(null);
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [mode, setMode] = useState<DiffMode>("voxel");
  const [toleranceMm, setToleranceMm] = useState(0.15);
  const [stats, setStats] = useState<DiffStats | null>(null);
  const viewerARef = useRef<ViewerHandle>(null);
  const viewerBRef = useRef<ViewerHandle>(null);
  const diffViewRef = useRef<DiffViewHandle>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isReportSubmitting, setIsReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isShareSubmitting, setIsShareSubmitting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoringShare, setIsRestoringShare] = useState(false);
  const [syncedCameraState, setSyncedCameraState] = useState<{ position: [number, number, number]; target: [number, number, number] } | null>(null);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  const [selectedDemo, setSelectedDemo] = useState<"simple" | "bracket" | "gear">("simple");
  const [sameFileWarning, setSameFileWarning] = useState<string | null>(null);
  const [showDetailedStats, setShowDetailedStats] = useState(false);
  const [boundingBoxB, setBoundingBoxB] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    if (fileA && fileB && fileA.name === fileB.name && fileA.size === fileB.size) {
      setSameFileWarning(`File ${fileA.name} is being compared to itself.`);
    } else {
      setSameFileWarning(null);
    }
  }, [fileA, fileB]);

  const handleCameraChange = (state: { position: [number, number, number]; target: [number, number, number] }) => {
    setSyncedCameraState(state);
  };

  const demoConfigs = {
    simple: { a: "/demo/version-a.stl", b: "/demo/version-b.stl", label: "Simple Bracket" },
    bracket: { a: "/demo/bracket-v1.stl", b: "/demo/bracket-v2.stl", label: "Complex Bracket" },
    gear: { a: "/demo/gear-v1.stl", b: "/demo/gear-v2.stl", label: "Gear Assembly" },
  };

  const currentDemo = demoConfigs[selectedDemo];

  useEffect(() => {
    const shareId = new URLSearchParams(window.location.search).get("share");
    if (!shareId) {
      viewerARef.current?.loadDemo();
      viewerBRef.current?.loadDemo();
      return;
    }

    setIsRestoringShare(true);
    fetch(shareGetEndpoint(shareId))
      .then(async (response) => {
        const data = (await response.json()) as {
          success: boolean;
          error?: string;
          data?: {
            mode: DiffMode;
            toleranceMm: number;
            fileA: { filename: string; downloadUrl: string };
            fileB: { filename: string; downloadUrl: string };
          };
        };
        if (!data.success || !data.data) {
          throw new Error(data.error ?? "This share link is no longer available");
        }
        const [blobA, blobB] = await Promise.all([
          fetch(data.data.fileA.downloadUrl).then((r) => r.blob()),
          fetch(data.data.fileB.downloadUrl).then((r) => r.blob()),
        ]);
        viewerARef.current?.loadFromBytes(blobA, data.data.fileA.filename);
        viewerBRef.current?.loadFromBytes(blobB, data.data.fileB.filename);
        setMode(data.data.mode);
        setToleranceMm(data.data.toleranceMm);
      })
      .catch((err: unknown) => {
        setRestoreError(err instanceof Error ? err.message : "Failed to load shared diff");
      })
      .finally(() => setIsRestoringShare(false));
  }, []);

  function dismissShareError() {
    setRestoreError(null);
    window.history.replaceState(null, "", window.location.pathname);
    viewerARef.current?.loadDemo();
    viewerBRef.current?.loadDemo();
  }

  async function handleShareSubmit(expiresInDays: ExpiresInDays) {
    if (!fileA || !fileB) return;
    setIsShareSubmitting(true);
    setShareError(null);

    try {
      const response = await fetch(SHARE_CREATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          toleranceMm,
          expiresInDays,
          fileA: { name: fileA.name, size: fileA.size },
          fileB: { name: fileB.name, size: fileB.size },
        }),
      });
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
        data?: { url: string; uploadUrlA: string; uploadUrlB: string };
      };
      if (!data.success || !data.data) {
        setShareError(data.error ?? "Something went wrong");
        return;
      }

      const uploads = await Promise.all([
        fetch(data.data.uploadUrlA, { method: "PUT", body: fileA }),
        fetch(data.data.uploadUrlB, { method: "PUT", body: fileB }),
      ]);
      if (uploads.some((r) => !r.ok)) {
        setShareError("Upload failed, please try again");
        return;
      }

      setShareUrl(data.data.url);
    } catch {
      setShareError("Couldn't reach the server — try again in a moment");
    } finally {
      setIsShareSubmitting(false);
    }
  }

  async function handleReportEmailSubmit(email: string) {
    if (!stats) return;
    setIsReportSubmitting(true);
    setReportError(null);

    try {
      const response = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { success: boolean; error?: string };
      if (!data.success) {
        setReportError(data.error ?? "Something went wrong");
        setIsReportSubmitting(false);
        return;
      }
    } catch {
      setReportError("Couldn't reach the server — try again in a moment");
      setIsReportSubmitting(false);
      return;
    }

    downloadReport(stats);
    const screenshot = diffViewRef.current?.captureScreenshot();
    if (screenshot) {
      downloadDataUrl(screenshot, `meshdiff-diff-${Date.now()}.png`);
    }

    setIsReportSubmitting(false);
    setIsReportModalOpen(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs">
        <Link to="/" className="flex items-center gap-1.5 text-neutral-400 hover:text-white">
          ← Meshdiff
        </Link>
        <span className="text-neutral-600">Community diff tool — free, runs in your browser</span>
      </header>

      {isRestoringShare && (
        <div className="border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-center text-xs text-neutral-400">
          Loading shared diff…
        </div>
      )}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold uppercase tracking-wide text-neutral-300">
            Live Diff
          </span>
          <button
            type="button"
            onClick={() => viewerARef.current?.openFileDialog()}
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:border-neutral-500 hover:text-white"
          >
            + Version A
          </button>
          <button
            type="button"
            onClick={() => viewerBRef.current?.openFileDialog()}
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:border-neutral-500 hover:text-white"
          >
            + Version B
          </button>
          <select
            value={selectedDemo}
            onChange={(e) => setSelectedDemo(e.target.value as "simple" | "bracket" | "gear")}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-300"
          >
            <option value="simple">Simple Bracket</option>
            <option value="bracket">Complex Bracket</option>
            <option value="gear">Gear Assembly</option>
          </select>
          <button
            type="button"
            onClick={() => {
              viewerARef.current?.loadDemo();
              viewerBRef.current?.loadDemo();
            }}
            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-300 hover:border-emerald-400"
          >
            Load Demo
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isSyncEnabled}
              onChange={(e) => setIsSyncEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 accent-emerald-500"
            />
            <span className="text-xs text-neutral-300">Locked views</span>
          </label>
          <span className="text-neutral-500">
            STL · 3MF · OBJ — parsed locally, in-browser
          </span>
        </div>
      </div>

      <section className="flex flex-1 flex-col gap-2 p-2">
        {sameFileWarning && (
          <div className="rounded border border-amber-800 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
            ⚠ {sameFileWarning}
          </div>
        )}
        <div className="grid h-1/2 grid-cols-2 gap-2">
          <Viewer
            ref={viewerARef}
            label="Version A"
            onGeometryLoaded={(geometry, file) => {
              setGeometryA(geometry);
              setFileA(file);
            }}
            demoUrl={currentDemo.a}
            syncedCameraState={isSyncEnabled ? syncedCameraState ?? undefined : undefined}
            onCameraChange={handleCameraChange}
            isSyncEnabled={isSyncEnabled}
          />
          <Viewer
            ref={viewerBRef}
            label="Version B"
            onGeometryLoaded={(geometry, file) => {
              setGeometryB(geometry);
              setFileB(file);
              geometry.computeBoundingBox();
              const box = geometry.boundingBox;
              if (box) {
                const size = box.getSize(new THREE.Vector3());
                setBoundingBoxB([size.x, size.y, size.z]);
              }
            }}
            demoUrl={currentDemo.b}
            syncedCameraState={isSyncEnabled ? syncedCameraState ?? undefined : undefined}
            onCameraChange={handleCameraChange}
            isSyncEnabled={isSyncEnabled}
          />
        </div>
        <div className="h-1/2 min-h-0">
          <DiffView
            ref={diffViewRef}
            geometryA={geometryA}
            geometryB={geometryB}
            onStatsChange={setStats}
            mode={mode}
            onModeChange={setMode}
            toleranceMm={toleranceMm}
            onToleranceChange={setToleranceMm}
            syncedCameraState={isSyncEnabled ? syncedCameraState ?? undefined : undefined}
            onCameraChange={handleCameraChange}
            isSyncEnabled={isSyncEnabled}
          />
        </div>

        {stats ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                  Added voxels
                </div>
                <div className="mt-0.5 text-lg font-semibold text-emerald-400">
                  +{stats.addedCount.toLocaleString()}
                </div>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                  Removed voxels
                </div>
                <div className="mt-0.5 text-lg font-semibold text-red-400">
                  -{stats.removedCount.toLocaleString()}
                </div>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                  Volume delta
                </div>
                <div className="mt-0.5 text-lg font-semibold text-neutral-100">
                  {stats.approxVolumeDeltaPercent >= 0 ? "+" : ""}
                  {stats.approxVolumeDeltaPercent.toFixed(1)}%
                </div>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                  Tolerance
                </div>
                <div className="mt-0.5 text-lg font-semibold text-emerald-400">
                  {stats.toleranceMm.toFixed(2)} mm
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDetailedStats(!showDetailedStats)}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-center text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
            >
              {showDetailedStats ? "Hide" : "Show"} Detailed Stats
            </button>
          </>
        ) : (
          <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-center text-xs text-neutral-500">
            Load both versions to see diff stats
          </div>
        )}

        {showDetailedStats && stats && (
          <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
            <DetailedStatsPanel stats={stats} hasComparison boundingBoxB={boundingBoxB} />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            disabled={!fileA || !fileB}
            onClick={() => {
              setShareUrl(null);
              setShareError(null);
              setIsShareModalOpen(true);
            }}
            className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:text-neutral-600"
          >
            Share This Diff
          </button>
          <button
            type="button"
            disabled={!stats}
            onClick={() => setIsReportModalOpen(true)}
            className="rounded bg-emerald-500 px-3 py-1.5 font-medium text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
          >
            Download Report
          </button>
        </div>
      </section>

      {isReportModalOpen && (
        <ReportGateModal
          onClose={() => {
            setIsReportModalOpen(false);
            setReportError(null);
          }}
          onSubmit={handleReportEmailSubmit}
          isSubmitting={isReportSubmitting}
          error={reportError}
        />
      )}

      {restoreError && (
        <ShareErrorModal message={restoreError} onDismiss={dismissShareError} />
      )}

      {isShareModalOpen && (
        <ShareModal
          onClose={() => {
            setIsShareModalOpen(false);
            setShareError(null);
          }}
          onSubmit={handleShareSubmit}
          isSubmitting={isShareSubmitting}
          error={shareError}
          shareUrl={shareUrl}
        />
      )}
    </div>
  );
}
