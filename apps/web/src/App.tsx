import { useState } from "react";
import type * as THREE from "three";
import type { PrintabilityStatus } from "@meshdiff/shared/types/diff";
import Viewer from "./components/Viewer";
import DiffView from "./components/DiffView";

const gateColor: Record<PrintabilityStatus, string> = {
  pass: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
};

export default function App() {
  const printability: PrintabilityStatus = "warn";
  const [geometryA, setGeometryA] = useState<THREE.BufferGeometry | null>(null);
  const [geometryB, setGeometryB] = useState<THREE.BufferGeometry | null>(null);

  return (
    <div className="flex h-screen flex-col bg-neutral-900 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h1 className="text-sm font-semibold tracking-wide">Meshdiff</h1>
        <div className="group relative flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${gateColor[printability]}`} />
          <span className="uppercase text-neutral-400">{printability}</span>
          <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-64 rounded border border-neutral-700 bg-neutral-800 p-2 text-left text-[11px] font-normal normal-case text-neutral-300 shadow-lg group-hover:block">
            Printability gate not implemented yet — wall thickness, overhang,
            and hole checks (see CLAUDE.md) aren&apos;t computed. This status
            is a fixed placeholder, not a real result.
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-2 p-2">
        <div className="grid h-1/2 grid-cols-2 gap-2">
          <Viewer label="Version A" onGeometryLoaded={setGeometryA} />
          <Viewer label="Version B" onGeometryLoaded={setGeometryB} />
        </div>
        <div className="h-1/2">
          <DiffView geometryA={geometryA} geometryB={geometryB} />
        </div>
      </main>
    </div>
  );
}
