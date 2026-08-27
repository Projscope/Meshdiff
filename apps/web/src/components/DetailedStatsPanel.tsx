import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import CollapsibleSection, { PropertyList, PropertyRow } from "./CollapsibleSection";
import { useDiffColors } from "../lib/diffPalette";

interface DetailedStatsPanelProps {
  /**
   * Version Stats/Printability always render from stats when present (even a
   * self-diff against the same version yields real per-mesh values for the
   * "B" side). hasComparison distinguishes an actual A-vs-B diff from that
   * self-diff case, so Geometric Delta shows real deltas only when they mean
   * something — otherwise a "no diff" placeholder, per the v1 case where
   * there's no previous version to compare against.
   */
  stats: (VoxelDiffStats & { toleranceMm?: number }) | null;
  hasComparison: boolean;
  boundingBoxB: [number, number, number];
}

/** Bordered card wrapper for one grid cell — gives each section a visible
 * boundary when several sit side by side (see the grid comment below),
 * without changing CollapsibleSection itself (shared with narrow-sidebar
 * consumers elsewhere that don't need this). */
function SectionCard({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">{children}</div>;
}

export default function DetailedStatsPanel({ stats, hasComparison, boundingBoxB }: DetailedStatsPanelProps) {
  const { t } = useTranslation();
  // Total volume isn't stored directly on VoxelDiffStats (only deltas are) —
  // derive it from the voxel counts rather than plumb a separate prop that
  // could drift out of sync with the same computation.
  const volumeB = stats ? stats.voxelVolumeMm3 * (stats.unchangedCount + stats.addedCount) : 0;
  const diffColors = useDiffColors();

  // grid-cols via auto-fit rather than a fixed responsive breakpoint: this
  // panel is reused in both a ~300-400px sidebar (MeasureViewer,
  // CompareVersionsPage, VersionDetailPage) and a full-width block
  // (LiveDiffToolPage's "Show Detailed Stats" panel, with no side rail to
  // compete with) — auto-fit naturally collapses to one column in the
  // former and lays sections out side by side in the latter, without a
  // viewport-width breakpoint that can't tell those two cases apart.
  return (
    <div className="grid items-start gap-4 text-sm [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {hasComparison && (
        <SectionCard>
          <CollapsibleSection title={t("statsPanel.geometricDelta")}>
            {!stats ? (
              <div className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-center text-xs text-ink-500">
                {t("statsPanel.noComparison")}
              </div>
            ) : (
              <>
                <PropertyList>
                  <PropertyRow
                    label={t("statsPanel.volume")}
                    value={`${stats.approxVolumeDeltaMm3 < 0 ? "↓ " : "↑ "}${Math.abs(stats.approxVolumeDeltaMm3).toFixed(0)} mm³`}
                    valueClassName={stats.approxVolumeDeltaMm3 < 0 ? diffColors.removedTextClass : diffColors.addedTextClass}
                  />
                  <PropertyRow
                    label={t("statsPanel.volumeChange")}
                    value={`${stats.approxVolumeDeltaPercent < 0 ? "↓ " : "↑ "}${Math.abs(stats.approxVolumeDeltaPercent).toFixed(1)}%`}
                    valueClassName={stats.approxVolumeDeltaPercent < 0 ? diffColors.removedTextClass : diffColors.addedTextClass}
                  />
                  <PropertyRow
                    label={t("statsPanel.sizeDeltaX")}
                    value={`${stats.boundingBoxDeltaX >= 0 ? "→ " : "← "}${Math.abs(stats.boundingBoxDeltaX).toFixed(1)} mm`}
                    valueClassName={stats.boundingBoxDeltaX !== 0 ? "text-amber-400" : "text-ink-500"}
                  />
                  <PropertyRow
                    label={t("statsPanel.sizeDeltaY")}
                    value={`${stats.boundingBoxDeltaY >= 0 ? "→ " : "← "}${Math.abs(stats.boundingBoxDeltaY).toFixed(1)} mm`}
                    valueClassName={stats.boundingBoxDeltaY !== 0 ? "text-amber-400" : "text-ink-500"}
                  />
                  <PropertyRow
                    label={t("statsPanel.sizeDeltaZ")}
                    value={`${stats.boundingBoxDeltaZ >= 0 ? "↑ " : "↓ "}${Math.abs(stats.boundingBoxDeltaZ).toFixed(1)} mm`}
                    valueClassName={stats.boundingBoxDeltaZ !== 0 ? "text-amber-400" : "text-ink-500"}
                  />
                  <PropertyRow
                    label={t("statsPanel.triangles")}
                    value={`${stats.triangleDelta > 0 ? "↑ +" : stats.triangleDelta < 0 ? "↓ " : "→ "}${stats.triangleDelta}`}
                    valueClassName={
                      stats.triangleDelta > 0
                        ? diffColors.addedTextClass
                        : stats.triangleDelta < 0
                          ? diffColors.removedTextClass
                          : "text-ink-500"
                    }
                  />
                  <PropertyRow
                    label={t("statsPanel.surfaceArea")}
                    value={`${stats.surfaceAreaDelta < 0 ? "↓ " : "↑ "}${Math.abs(stats.surfaceAreaDelta).toFixed(0)} mm²`}
                    valueClassName={stats.surfaceAreaDelta < 0 ? diffColors.removedTextClass : diffColors.addedTextClass}
                  />
                </PropertyList>
                {stats.thinWallWarning && (
                  <div className="rounded-lg bg-amber-950/50 px-3 py-2 text-xs text-amber-300">
                    {t("statsPanel.thinWallWarning")}
                  </div>
                )}
                {stats.maxOverhangAngle > 45 && (
                  <div className="rounded-lg bg-amber-950/50 px-3 py-2 text-xs text-amber-300">
                    {t("statsPanel.overhangsDetected", { angle: stats.maxOverhangAngle.toFixed(1) })}
                  </div>
                )}
              </>
            )}
          </CollapsibleSection>
        </SectionCard>
      )}

      <SectionCard>
        <CollapsibleSection title={t("statsPanel.modelSize")}>
          <PropertyList>
            <PropertyRow label={t("statsPanel.sizeX")} value={`${boundingBoxB[0].toFixed(1)} mm`} />
            <PropertyRow label={t("statsPanel.sizeY")} value={`${boundingBoxB[1].toFixed(1)} mm`} />
            <PropertyRow label={t("statsPanel.sizeZ")} value={`${boundingBoxB[2].toFixed(1)} mm`} />
          </PropertyList>
        </CollapsibleSection>
      </SectionCard>

      <SectionCard>
        <CollapsibleSection title={t("statsPanel.versionStats")}>
          <PropertyList>
            <PropertyRow label={t("statsPanel.volume")} value={stats ? `${volumeB.toFixed(0)} mm³` : "—"} />
            <PropertyRow
              label={t("statsPanel.boundingBox")}
              value={`${boundingBoxB[0].toFixed(0)} × ${boundingBoxB[1].toFixed(0)} × ${boundingBoxB[2].toFixed(0)} mm`}
            />
            <PropertyRow label={t("statsPanel.triangles")} value={stats ? Math.round(stats.triangleDeltaB) : "—"} />
            <PropertyRow label={t("statsPanel.surfaceArea")} value={stats ? `${stats.surfaceAreaB.toFixed(0)} mm²` : "—"} />
            {stats?.fileFormatB && <PropertyRow label={t("statsPanel.fileFormat")} value={stats.fileFormatB.toUpperCase()} />}
          </PropertyList>
        </CollapsibleSection>
      </SectionCard>

      {stats && (
        <SectionCard>
          <CollapsibleSection title={t("statsPanel.printabilityDetails")}>
            {stats.printabilityIssues.length > 0 && (
              <div className="space-y-1 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2">
                {stats.printabilityIssues.map((issue, i) => (
                  <div key={i} className="text-xs text-amber-300">
                    • {issue}
                  </div>
                ))}
              </div>
            )}
            <PropertyList>
              <PropertyRow label={t("statsPanel.wallThickness")} value={`${stats.minWallThickness.toFixed(2)} – ${stats.maxWallThickness.toFixed(2)} mm`} />
              <PropertyRow label={t("statsPanel.maxOverhang")} value={`${stats.maxOverhangAngle.toFixed(1)}°`} />
              <PropertyRow label={t("statsPanel.unsupportedArea")} value={`${stats.overhangAreaPercent.toFixed(1)}%`} />
            </PropertyList>
          </CollapsibleSection>
        </SectionCard>
      )}

      {stats && (
        <SectionCard>
          <CollapsibleSection title={t("statsPanel.holeInventory")}>
            {stats.holeCountB > 0 && stats.minHoleDiameterMm < 2 && (
              <div className="rounded-lg bg-amber-950/50 px-3 py-2 text-xs text-amber-300">
                {t("statsPanel.smallHoleWarning", { diameter: stats.minHoleDiameterMm.toFixed(2) })}
              </div>
            )}
            <PropertyList>
              <PropertyRow label={t("statsPanel.holesDetected")} value={stats.holeCountB} />
              {hasComparison && (
                <>
                  <PropertyRow
                    label={t("statsPanel.added")}
                    value={stats.holesAdded > 0 ? `+${stats.holesAdded}` : "0"}
                    valueClassName={stats.holesAdded > 0 ? diffColors.addedTextClass : "text-ink-500"}
                  />
                  <PropertyRow
                    label={t("statsPanel.removed")}
                    value={stats.holesRemoved > 0 ? `-${stats.holesRemoved}` : "0"}
                    valueClassName={stats.holesRemoved > 0 ? diffColors.removedTextClass : "text-ink-500"}
                  />
                  <PropertyRow
                    label={t("statsPanel.diameterChanged")}
                    value={stats.holesDiameterChanged}
                    valueClassName={stats.holesDiameterChanged > 0 ? "text-amber-400" : "text-ink-500"}
                  />
                </>
              )}
              {stats.holeCountB > 0 && (
                <PropertyRow label={t("statsPanel.smallestDiameter")} value={`${stats.minHoleDiameterMm.toFixed(2)} mm`} />
              )}
            </PropertyList>
          </CollapsibleSection>
        </SectionCard>
      )}
    </div>
  );
}
