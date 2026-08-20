import { useShadingMode, type ShadingMode } from "../lib/shadingMode";

const NEXT: Record<ShadingMode, ShadingMode> = {
  smooth: "flat",
  flat: "transparent",
  transparent: "smooth",
};

const ICON: Record<ShadingMode, string> = {
  smooth: "●",
  flat: "◆",
  transparent: "◐",
};

const LABEL: Record<ShadingMode, string> = {
  smooth: "Smooth shading",
  flat: "Flat (per-face) shading",
  transparent: "Semi-transparent",
};

/**
 * A single global preference (see shadingMode.ts) — rendering this in
 * multiple viewers at once is fine, they all read/write the same shared
 * value and stay in sync immediately, same as ControlSchemeSelect. One
 * button cycles through all three modes rather than a dropdown, since
 * there are only three and a click-to-advance icon is more compact.
 */
export default function ShadingModeToggle() {
  const [mode, setMode] = useShadingMode();

  return (
    <button
      type="button"
      onClick={() => setMode(NEXT[mode])}
      title={`${LABEL[mode]} — click for ${LABEL[NEXT[mode]].toLowerCase()}`}
      className={`flex h-7 w-7 items-center justify-center rounded text-sm ${
        mode === "smooth" ? "text-ink-300 hover:bg-ink-800 hover:text-ink-50" : "bg-sky-500/20 text-sky-400"
      }`}
    >
      {ICON[mode]}
    </button>
  );
}
