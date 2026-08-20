import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as THREE from "three";
import Viewer, { type ViewerHandle } from "./Viewer";
import DiffView, { type DiffMode, type DiffAlignment } from "./DiffView";

const DEMO_A = "/demo/version-a.stl";
const DEMO_B = "/demo/version-b.stl";

/**
 * The real Compare tool, embedded inline in the landing-page hero, pre-
 * loaded with the bundled demo pair. This is its own lazy-loaded chunk
 * (see LandingPage.tsx's dynamic import) — the whole point is that R3F/
 * Three.js/the voxel-diff worker never download on page load, only once a
 * visitor actually clicks to try it. The original always-embedded version
 * got pulled for exactly that cost (see git history), so this stays a
 * separate component rather than getting inlined into LandingPage.tsx.
 */
export default function LandingLiveDemo() {
  const viewerARef = useRef<ViewerHandle>(null);
  const viewerBRef = useRef<ViewerHandle>(null);
  const [geometryA, setGeometryA] = useState<THREE.BufferGeometry | null>(null);
  const [geometryB, setGeometryB] = useState<THREE.BufferGeometry | null>(null);
  const [mode, setMode] = useState<DiffMode>("voxel");
  const [toleranceMm, setToleranceMm] = useState(0.15);
  const [alignment, setAlignment] = useState<DiffAlignment>("none");

  useEffect(() => {
    viewerARef.current?.loadDemo();
    viewerBRef.current?.loadDemo();
  }, []);

  return (
    <div className="mx-auto mt-12 max-w-6xl overflow-hidden rounded-xl border border-ink-800 shadow-2xl">
      <div className="grid h-[320px] grid-cols-2 gap-2 bg-ink-950 p-2 sm:h-[380px]">
        <Viewer ref={viewerARef} label="Version A" demoUrl={DEMO_A} onGeometryLoaded={(geometry) => setGeometryA(geometry)} />
        <Viewer ref={viewerBRef} label="Version B" demoUrl={DEMO_B} onGeometryLoaded={(geometry) => setGeometryB(geometry)} />
      </div>
      <div className="h-[280px] border-t border-ink-800 p-2 sm:h-[320px]">
        <DiffView
          geometryA={geometryA}
          geometryB={geometryB}
          mode={mode}
          onModeChange={setMode}
          toleranceMm={toleranceMm}
          onToleranceChange={setToleranceMm}
          alignment={alignment}
          onAlignmentChange={setAlignment}
        />
      </div>
      <div className="flex items-center justify-center border-t border-ink-800 bg-ink-900/60 px-4 py-3">
        <Link
          to="/live"
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-chrome-950 transition hover:bg-accent-400 active:scale-[0.98]"
        >
          Drop your own files →
        </Link>
      </div>
    </div>
  );
}
