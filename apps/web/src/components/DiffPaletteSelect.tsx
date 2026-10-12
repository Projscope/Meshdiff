import { useTranslation } from "react-i18next";
import { useDiffPalette } from "../lib/diffPalette";

/**
 * A single global preference (see diffPalette.ts) — controls only the
 * diff added/removed color scheme (voxels, surface heatmap, delta stats),
 * not workflow-status color like Approve/Reject or Stable badges.
 */
export default function DiffPaletteSelect() {
  const { t } = useTranslation();
  const [palette, setPalette] = useDiffPalette();
  return (
    <select
      value={palette}
      onChange={(event) => setPalette(event.target.value as "classic" | "colorblind" | "contrast")}
      title={t("viewer.diffPaletteTooltip")}
      className="rounded-sm border border-ink-700 bg-ink-900 px-1 py-0.5 text-[11px] text-ink-200"
    >
      <option value="classic">{t("viewer.colorsClassic")}</option>
      <option value="colorblind">{t("viewer.colorsColorblind")}</option>
      <option value="contrast">{t("viewer.colorsContrast")}</option>
    </select>
  );
}
