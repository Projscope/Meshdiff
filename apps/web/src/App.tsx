import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import type { VoxelDiffStats } from "./engine/diffVoxels";
import Viewer, { type ViewerHandle } from "./components/Viewer";
import DiffView, { type DiffViewHandle, type DiffMode } from "./components/DiffView";
import WaitlistForm from "./components/WaitlistForm";
import ReportGateModal from "./components/ReportGateModal";
import ShareModal, { type ExpiresInDays } from "./components/ShareModal";
import ShareErrorModal from "./components/ShareErrorModal";
import { WAITLIST_ENDPOINT, SHARE_CREATE_ENDPOINT, shareGetEndpoint } from "./lib/api";

const APP_VERSION = "0.1.1";

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

function LogoMark() {
  return (
    <div aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
      <div className="h-3 w-3 rotate-45 rounded-[2px] bg-white" />
    </div>
  );
}

const ROADMAP = {
  live: [
    "Voxel diff (STL/3MF/OBJ)",
    "Adjustable tolerance",
    "Volume delta metrics",
    "JSON diff report",
    "Shareable diff URLs",
  ],
  beta: [
    "Surface-mode heatmap diff",
    "Removed-material ghost overlay",
  ],
  next: [
    "Auto-align (PCA/ICP)",
    "Cross-section view",
    "Web-worker voxelizer",
    "Multi-file drag & drop",
    "Project workspaces",
    "Comment pins on models",
    "Version history",
    "Slicer profile snapshots",
    "Team approvals + PDF export",
  ],
};
const PLANNED_FEATURES = [
  "Version history — every save, restorable",
  "Comment pins anchored on 3D models",
  "Slicer profile snapshots per version",
  "Team approvals & report export",
];

export default function App() {
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

  function scrollToEarlyAccess() {
    document.getElementById("early-access")?.scrollIntoView({ behavior: "smooth" });
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoMark />
            <div className="leading-tight">
              <h1 className="text-sm font-semibold text-white">Meshdiff</h1>
              <span className="text-[10px] text-white/70">v{APP_VERSION} · free</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={scrollToEarlyAccess}
              className="rounded bg-white px-3 py-1.5 font-medium text-indigo-700 hover:bg-white/90"
            >
              Get Early Access
            </button>
          </div>
        </div>
      </header>

      <main>
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
          <button
            type="button"
            onClick={() => {
              viewerARef.current?.loadDemo();
              viewerBRef.current?.loadDemo();
            }}
            className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-blue-300 hover:border-blue-400"
          >
            Demo
          </button>
          <span className="text-neutral-500">
            STL · 3MF · OBJ — parsed locally, in-browser
          </span>
        </div>
      </div>

      <section className="flex h-[calc(100vh-98px)] flex-col gap-2 p-2">
        <div className="grid h-1/2 grid-cols-2 gap-2">
          <Viewer
            ref={viewerARef}
            label="Version A"
            onGeometryLoaded={(geometry, file) => {
              setGeometryA(geometry);
              setFileA(file);
            }}
            demoUrl="/demo/version-a.stl"
          />
          <Viewer
            ref={viewerBRef}
            label="Version B"
            onGeometryLoaded={(geometry, file) => {
              setGeometryB(geometry);
              setFileB(file);
            }}
            demoUrl="/demo/version-b.stl"
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
          />
        </div>

        <div className="flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-3">
            {stats ? (
              <>
                <span>
                  Voxels: <span className="text-emerald-400">+{stats.addedCount}</span>{" "}
                  <span className="text-red-400">-{stats.removedCount}</span>
                </span>
                <span>
                  Volume: {stats.approxVolumeDeltaPercent >= 0 ? "+" : ""}
                  {stats.approxVolumeDeltaPercent.toFixed(1)}%
                </span>
              </>
            ) : (
              <span>Load both versions to see diff stats</span>
            )}
          </div>
          <div className="flex items-center gap-2">
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
              className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              Get the JSON diff report
            </button>
          </div>
        </div>
      </section>

      <section id="early-access" className="border-t border-neutral-800 px-6 py-16">
        <div className="mx-auto max-w-5xl rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-center">
          <p className="text-base font-semibold text-emerald-300">
            🔒 Diffing runs entirely client-side.
          </p>
          <p className="mt-1 text-xs text-emerald-300/70">
            Nothing you drop into Version A or B is uploaded unless you
            explicitly create a share link — that's the only action that
            sends your files anywhere.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-10 md:grid-cols-2">
          <div>
            <span className="inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-300">
              Roadmap
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-white">
              Save projects, track versions, and review with your team
            </h2>
            <p className="mt-2 text-sm text-neutral-400">
              None of the items below exist in the tool today — this is the
              roadmap, not a feature list. Sign up and we&apos;ll email you
              when any of it actually ships.
            </p>
            <ul className="mt-6 flex flex-col gap-2 text-sm text-neutral-300">
              {PLANNED_FEATURES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-400">○</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="relative overflow-hidden rounded-lg border border-neutral-800 bg-cover bg-center p-6"
            style={{ backgroundImage: "url(/notify-bg.jpg)" }}
          >
            <div className="absolute inset-0 bg-neutral-950/80" />
            <div className="relative">
              <p className="text-sm text-neutral-300">
                Get notified when we launch project workspaces, comment
                threads, and print traceability.
              </p>
              <div className="mt-4">
                <WaitlistForm />
              </div>
              <p className="mt-3 text-xs text-neutral-400">
                No spam. Unsubscribe anytime. We&apos;ll email you from{" "}
                <span className="text-neutral-300">support@projscope.com</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <h3 className="text-center text-xs uppercase tracking-wide text-neutral-500">
            Status
          </h3>
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-2 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
              </div>
              <ul className="mt-2 flex flex-col gap-2 text-xs text-neutral-300">
                {ROADMAP.live.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-2 text-xs font-medium text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> In beta
              </div>
              <ul className="mt-2 flex flex-col gap-2 text-xs text-neutral-300">
                {ROADMAP.beta.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-2 text-xs font-medium text-blue-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Coming next
              </div>
              <ul className="mt-2 flex flex-col gap-2 text-xs text-neutral-300">
                {ROADMAP.next.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
      </main>

      <footer className="border-t border-neutral-800 px-6 py-6 text-center text-xs text-neutral-600">
        Meshdiff © 2026 — free diff tool · Developed by{" "}
        <a
          href="https://projscope.com"
          target="_blank"
          rel="noreferrer"
          className="hover:text-neutral-400"
        >
          Projscope
        </a>
      </footer>

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
