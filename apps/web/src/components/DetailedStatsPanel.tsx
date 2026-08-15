import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import CollapsibleSection, { PropertyList, PropertyRow } from "./CollapsibleSection";

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

export default function DetailedStatsPanel({ stats, hasComparison, boundingBoxB }: DetailedStatsPanelProps) {
  // Total volume isn't stored directly on VoxelDiffStats (only deltas are) —
  // derive it from the voxel counts rather than plumb a separate prop that
  // could drift out of sync with the same computation.
  const volumeB = stats ? stats.voxelVolumeMm3 * (stats.unchangedCount + stats.addedCount) : 0;

  return (
    <div className="space-y-6 text-sm">
      {hasComparison && (
        <CollapsibleSection title="Geometric Delta">
          {!stats ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-center text-xs text-neutral-500">
              No comparison available
            </div>
          ) : (
            <>
              <PropertyList>
                <PropertyRow
                  label="Volume"
                  value={`${stats.approxVolumeDeltaMm3 < 0 ? "↓ " : "↑ "}${Math.abs(stats.approxVolumeDeltaMm3).toFixed(0)} mm³`}
                  valueClassName={stats.approxVolumeDeltaMm3 < 0 ? "text-red-400" : "text-emerald-400"}
                />
                <PropertyRow
                  label="Volume Change"
                  value={`${stats.approxVolumeDeltaPercent < 0 ? "↓ " : "↑ "}${Math.abs(stats.approxVolumeDeltaPercent).toFixed(1)}%`}
                  valueClassName={stats.approxVolumeDeltaPercent < 0 ? "text-red-400" : "text-emerald-400"}
                />
                <PropertyRow
                  label="Size Δ X"
                  value={`${stats.boundingBoxDeltaX >= 0 ? "→ " : "← "}${Math.abs(stats.boundingBoxDeltaX).toFixed(1)} mm`}
                  valueClassName={stats.boundingBoxDeltaX !== 0 ? "text-amber-400" : "text-neutral-500"}
                />
                <PropertyRow
                  label="Size Δ Y"
                  value={`${stats.boundingBoxDeltaY >= 0 ? "→ " : "← "}${Math.abs(stats.boundingBoxDeltaY).toFixed(1)} mm`}
                  valueClassName={stats.boundingBoxDeltaY !== 0 ? "text-amber-400" : "text-neutral-500"}
                />
                <PropertyRow
                  label="Size Δ Z"
                  value={`${stats.boundingBoxDeltaZ >= 0 ? "↑ " : "↓ "}${Math.abs(stats.boundingBoxDeltaZ).toFixed(1)} mm`}
                  valueClassName={stats.boundingBoxDeltaZ !== 0 ? "text-amber-400" : "text-neutral-500"}
                />
                <PropertyRow
                  label="Triangles"
                  value={`${stats.triangleDelta > 0 ? "↑ +" : stats.triangleDelta < 0 ? "↓ " : "→ "}${stats.triangleDelta}`}
                  valueClassName={
                    stats.triangleDelta > 0
                      ? "text-emerald-400"
                      : stats.triangleDelta < 0
                        ? "text-red-400"
                        : "text-neutral-500"
                  }
                />
                <PropertyRow
                  label="Surface Area"
                  value={`${stats.surfaceAreaDelta < 0 ? "↓ " : "↑ "}${Math.abs(stats.surfaceAreaDelta).toFixed(0)} mm²`}
                  valueClassName={stats.surfaceAreaDelta < 0 ? "text-red-400" : "text-emerald-400"}
                />
              </PropertyList>
              {stats.thinWallWarning && (
                <div className="rounded-lg bg-amber-950/50 px-3 py-2 text-xs text-amber-300">
                  ⚠ Thin walls detected (&lt; 0.8mm)
                </div>
              )}
              {stats.maxOverhangAngle > 45 && (
                <div className="rounded-lg bg-amber-950/50 px-3 py-2 text-xs text-amber-300">
                  ⚠ Overhangs detected ({stats.maxOverhangAngle.toFixed(1)}°)
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Version Stats">
        <PropertyList>
          <PropertyRow label="Volume" value={stats ? `${volumeB.toFixed(0)} mm³` : "—"} />
          <PropertyRow
            label="Bounding Box"
            value={`${boundingBoxB[0].toFixed(0)} × ${boundingBoxB[1].toFixed(0)} × ${boundingBoxB[2].toFixed(0)} mm`}
          />
          <PropertyRow label="Triangles" value={stats ? Math.round(stats.triangleDeltaB) : "—"} />
          <PropertyRow label="Surface Area" value={stats ? `${stats.surfaceAreaB.toFixed(0)} mm²` : "—"} />
          {stats?.fileFormatB && <PropertyRow label="File Format" value={stats.fileFormatB.toUpperCase()} />}
        </PropertyList>
      </CollapsibleSection>

      {stats && (
        <CollapsibleSection title="Printability Details">
          {stats.printabilityIssues.length > 0 && (
            <div className="space-y-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
              {stats.printabilityIssues.map((issue, i) => (
                <div key={i} className="text-xs text-amber-300">
                  • {issue}
                </div>
              ))}
            </div>
          )}
          <PropertyList>
            <PropertyRow label="Wall Thickness" value={`${stats.minWallThickness.toFixed(2)} – ${stats.maxWallThickness.toFixed(2)} mm`} />
            <PropertyRow label="Max Overhang" value={`${stats.maxOverhangAngle.toFixed(1)}°`} />
            <PropertyRow label="Unsupported Area" value={`${stats.overhangAreaPercent.toFixed(1)}%`} />
          </PropertyList>
        </CollapsibleSection>
      )}
    </div>
  );
}
