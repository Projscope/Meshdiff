import { useState } from "react";
import type * as THREE from "three";
import type { PrintabilityStatus } from "@meshdiff/shared/types/diff";
import type { VoxelDiffStats } from "./engine/diffVoxels";
import Viewer from "./components/Viewer";
import DiffView from "./components/DiffView";
import WaitlistForm from "./components/WaitlistForm";

const gateColor: Record<PrintabilityStatus, string> = {
  pass: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
};

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

export default function App() {
  const printability: PrintabilityStatus = "warn";
  const [geometryA, setGeometryA] = useState<THREE.BufferGeometry | null>(null);
  const [geometryB, setGeometryB] = useState<THREE.BufferGeometry | null>(null);
  const [stats, setStats] = useState<DiffStats | null>(null);

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h1 className="text-sm font-semibold tracking-wide">Meshdiff</h1>
        <div className="flex items-center gap-4">
          <div className="group relative flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${gateColor[printability]}`} />
            <span className="uppercase text-neutral-400">{printability}</span>
            <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-64 rounded border border-neutral-700 bg-neutral-800 p-2 text-left text-[11px] font-normal normal-case text-neutral-300 shadow-lg group-hover:block">
              Printability gate not implemented yet — wall thickness, overhang,
              and hole checks (see CLAUDE.md) aren&apos;t computed. This status
              is a fixed placeholder, not a real result.
            </div>
          </div>
        </div>
      </header>

      <section className="flex h-[calc(100vh-49px)] flex-col gap-2 p-2">
        <div className="grid h-1/2 grid-cols-2 gap-2">
          <Viewer
            label="Version A"
            onGeometryLoaded={setGeometryA}
            demoUrl="/demo/version-a.stl"
          />
          <Viewer
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

      <section className="border-t border-neutral-800 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold">Track versions, not filenames</h2>
          <ul className="mx-auto mt-6 flex max-w-md flex-col gap-3 text-left text-sm text-neutral-300">
            <li>• Compare any two STL/3MF/OBJ files visually</li>
            <li>
              • See exactly what changed: added material, removed material,
              dimensional drift
            </li>
            <li>• Share diff links with your team or clients</li>
          </ul>
          <div className="mt-8 flex flex-col items-center gap-2">
            <p className="text-sm text-neutral-400">
              Get notified when we launch project workspaces, comment threads,
              and print traceability.
            </p>
            <WaitlistForm />
          </div>
        </div>
      </section>
    </div>
  );
}
