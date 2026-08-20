import { useEffect, useState } from "react";

export type DiffPalette = "classic" | "colorblind" | "contrast";

const STORAGE_KEY = "meshdiff_diff_palette";
// Same "localStorage + custom event" pattern as shadingMode.ts/
// controlScheme.ts — a single global preference, kept in sync across every
// diff-color consumer on the page.
const CHANGE_EVENT = "meshdiff:diff-palette-change";

function readStored(): DiffPalette {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "colorblind" || stored === "contrast" ? stored : "classic";
}

export function setDiffPalette(palette: DiffPalette): void {
  localStorage.setItem(STORAGE_KEY, palette);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** The active diff added/removed color scheme, shared across every viewer
 * (and persisted across visits). Scoped to diff-semantic color only — not
 * workflow-status color (approve/reject, stable badges), which keeps its
 * own hardcoded green/red regardless of this setting. */
export function useDiffPalette(): [DiffPalette, (palette: DiffPalette) => void] {
  const [palette, setPalette] = useState<DiffPalette>(() => readStored());

  useEffect(() => {
    const onChange = () => setPalette(readStored());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [palette, setDiffPalette];
}

export interface DiffColors {
  addedHex: string;
  removedHex: string;
  addedTextClass: string;
  removedTextClass: string;
  addedBgClass: string;
  removedBgClass: string;
}

// "classic" is byte-identical to the values every diff surface already
// hardcoded before this palette existed, so the default appearance doesn't
// change for anyone who never touches the setting. "colorblind" is the
// orange/blue pairing safe for deuteranopia/protanopia (the most common
// color-vision deficiencies); "contrast" is a cyan/pink alternative for
// anyone who finds orange/blue too close to their own display's calibration.
const PALETTES: Record<DiffPalette, DiffColors> = {
  classic: {
    addedHex: "#22c55e",
    removedHex: "#ef4444",
    addedTextClass: "text-green-400",
    removedTextClass: "text-red-400",
    addedBgClass: "bg-green-500",
    removedBgClass: "bg-red-500",
  },
  colorblind: {
    addedHex: "#fb923c",
    removedHex: "#60a5fa",
    addedTextClass: "text-orange-400",
    removedTextClass: "text-blue-400",
    addedBgClass: "bg-orange-500",
    removedBgClass: "bg-blue-500",
  },
  contrast: {
    addedHex: "#22d3ee",
    removedHex: "#f472b6",
    addedTextClass: "text-cyan-400",
    removedTextClass: "text-pink-400",
    addedBgClass: "bg-cyan-500",
    removedBgClass: "bg-pink-500",
  },
};

export function useDiffColors(): DiffColors {
  const [palette] = useDiffPalette();
  return PALETTES[palette];
}
