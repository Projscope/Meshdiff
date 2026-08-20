import { useEffect, useState } from "react";

export type ShadingMode = "smooth" | "flat" | "transparent";

const STORAGE_KEY = "meshdiff_shading_mode";
// Same "localStorage + custom event" pattern as controlScheme.ts — a single
// global preference, kept in sync across every viewer on the page without
// needing localStorage's own cross-tab-only "storage" event.
const CHANGE_EVENT = "meshdiff:shading-mode-change";

function readStored(): ShadingMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "flat" || stored === "transparent" ? stored : "smooth";
}

export function setShadingMode(mode: ShadingMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * The active shading style, shared across every viewer (and persisted
 * across visits). "smooth" averages normals across shared vertices —
 * required for repairMeshGeometry's manifold check to mean anything, but it
 * can blend two very different face directions into one at a sharp corner.
 * "flat" gives every triangle its own independent normal (three.js's
 * `flatShading` material flag) — the crisper, per-face look the app always
 * had before the repair pass started welding vertices. "transparent" keeps
 * smooth shading but renders the solid semi-transparent, so internal
 * features (e.g. a hole/bore that doesn't reach the near surface) are
 * visible without switching tools.
 */
export function useShadingMode(): [ShadingMode, (mode: ShadingMode) => void] {
  const [mode, setMode] = useState<ShadingMode>(() => readStored());

  useEffect(() => {
    const onChange = () => setMode(readStored());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [mode, setShadingMode];
}
