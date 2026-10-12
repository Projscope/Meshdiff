import { useTranslation } from "react-i18next";
import ControlSchemeSelect from "./ControlSchemeSelect";
import ShadingModeToggle from "./ShadingModeToggle";
import GridToggle from "./GridToggle";
import type { MeasureTool } from "../lib/useMeasureTool";

interface MeasureToolbarProps {
  measure: MeasureTool;
  onZoomToFit: () => void;
  onResetView: () => void;
}

/** Compact icon toolbar for a single viewer: measure tools, zoom/reset,
 * and camera controls with an info tooltip — the DOM half of a measure
 * tool, paired with MeasureSceneOverlay for the in-scene rendering. */
export default function MeasureToolbar({ measure, onZoomToFit, onResetView }: MeasureToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-950/70 p-1">
      <button
        type="button"
        onClick={() => measure.toggleMeasuring("distance")}
        title={
          measure.isToolActive("distance")
            ? t("viewer.clearDistanceTooltip")
            : t("viewer.measureDistanceTooltip")
        }
        className={`flex h-7 w-7 items-center justify-center rounded text-sm ${
          measure.isToolActive("distance")
            ? "bg-amber-500/20 text-amber-fg-400"
            : "text-ink-300 hover:bg-ink-800 hover:text-ink-50"
        }`}
      >
        📏
      </button>
      <button
        type="button"
        onClick={() => measure.toggleMeasuring("radius")}
        title={
          measure.isToolActive("radius") ? t("viewer.clearRadiusTooltip") : t("viewer.measureRadiusTooltip")
        }
        className={`flex h-7 w-7 items-center justify-center rounded text-sm ${
          measure.isToolActive("radius")
            ? "bg-sky-500/20 text-sky-400"
            : "text-ink-300 hover:bg-ink-800 hover:text-ink-50"
        }`}
      >
        ⌀
      </button>
      <div className="mx-0.5 h-5 w-px bg-ink-800" />
      <button
        type="button"
        onClick={onZoomToFit}
        title={t("viewer.zoomToFit")}
        className="flex h-7 w-7 items-center justify-center rounded-sm text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-50"
      >
        ⛶
      </button>
      <button
        type="button"
        onClick={onResetView}
        title={t("viewer.resetViewTooltip")}
        className="flex h-7 w-7 items-center justify-center rounded-sm text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-50"
      >
        ⟲
      </button>
      <div className="mx-0.5 h-5 w-px bg-ink-800" />
      <ShadingModeToggle />
      <GridToggle />
      <div className="mx-0.5 h-5 w-px bg-ink-800" />
      <ControlSchemeSelect showLegend={false} />
    </div>
  );
}
