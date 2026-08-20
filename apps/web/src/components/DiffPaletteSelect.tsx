import { useDiffPalette } from "../lib/diffPalette";

/**
 * A single global preference (see diffPalette.ts) — controls only the
 * diff added/removed color scheme (voxels, surface heatmap, delta stats),
 * not workflow-status color like Approve/Reject or Stable badges.
 */
export default function DiffPaletteSelect() {
  const [palette, setPalette] = useDiffPalette();
  return (
    <select
      value={palette}
      onChange={(event) => setPalette(event.target.value as "classic" | "colorblind" | "contrast")}
      title="Diff color scheme — pick a colorblind-safe pairing if red/green is hard to tell apart"
      className="rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-[11px] text-ink-200"
    >
      <option value="classic">Colors: Classic</option>
      <option value="colorblind">Colors: Colorblind</option>
      <option value="contrast">Colors: Contrast</option>
    </select>
  );
}
