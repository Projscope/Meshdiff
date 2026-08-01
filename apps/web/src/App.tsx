import { useRef, useState } from "react";
import type * as THREE from "three";
import type { VoxelDiffStats } from "./engine/diffVoxels";
import Viewer, { type ViewerHandle } from "./components/Viewer";
import DiffView from "./components/DiffView";
import WaitlistForm from "./components/WaitlistForm";

const APP_VERSION = "0.0.1";

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

function LogoMark() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
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
  ],
  beta: ["Surface-mode heatmap diff", "Removed-material ghost overlay"],
  next: [
    "Auto-align (PCA/ICP)",
    "Cross-section view",
    "Shareable diff URLs",
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
  const [stats, setStats] = useState<DiffStats | null>(null);
  const viewerARef = useRef<ViewerHandle>(null);
  const viewerBRef = useRef<ViewerHandle>(null);

  function scrollToEarlyAccess() {
    document.getElementById("early-access")?.scrollIntoView({ behavior: "smooth" });
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
            onGeometryLoaded={setGeometryA}
            demoUrl="/demo/version-a.stl"
          />
          <Viewer
            ref={viewerBRef}
            label="Version B"
            onGeometryLoaded={setGeometryB}
            demoUrl="/demo/version-b.stl"
          />
        </div>
        <div className="h-1/2 min-h-0">
          <DiffView geometryA={geometryA} geometryB={geometryB} onStatsChange={setStats} />
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
            <div className="group relative">
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded border border-neutral-700 px-3 py-1.5 text-neutral-500"
              >
                Share This Diff
              </button>
              <div className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden w-56 rounded border border-neutral-700 bg-neutral-800 p-2 text-left text-[11px] font-normal text-neutral-300 shadow-lg group-hover:block">
                Coming soon — sharing a link requires persisting uploaded
                meshes server-side, which isn&apos;t built yet.
              </div>
            </div>
            <button
              type="button"
              disabled={!stats}
              onClick={() => stats && downloadReport(stats)}
              className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              Download Report
            </button>
          </div>
        </div>
      </section>

      <section id="early-access" className="border-t border-neutral-800 px-6 py-16">
        <div className="mx-auto max-w-5xl rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-center">
          <p className="text-base font-semibold text-emerald-300">
            🔒 Static-first — your files never leave the browser.
          </p>
          <p className="mt-1 text-xs text-emerald-300/70">
            Diffing runs entirely client-side. Nothing you drop into Version A
            or B is uploaded anywhere.
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

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-6">
            <p className="text-sm text-neutral-400">
              Get notified when we launch project workspaces, comment threads,
              and print traceability.
            </p>
            <div className="mt-4">
              <WaitlistForm />
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              No spam. Unsubscribe anytime.
            </p>
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

      <footer className="border-t border-neutral-800 px-6 py-6 text-center text-xs text-neutral-600">
        Meshdiff © 2026 — free diff tool
      </footer>
    </div>
  );
}
