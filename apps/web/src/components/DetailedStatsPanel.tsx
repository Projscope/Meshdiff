import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";

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
      {/* GEOMETRIC DELTA */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Geometric Delta
        </h3>
        {!stats || !hasComparison ? (
          <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-center text-xs text-neutral-500">
            Single version — no diff available
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-neutral-400">Volume</span>
              <span className={stats.approxVolumeDeltaMm3 < 0 ? "text-red-400" : "text-emerald-400"}>
                {stats.approxVolumeDeltaMm3 < 0 ? "↓ " : "↑ "}
                {Math.abs(stats.approxVolumeDeltaMm3).toFixed(0)} mm³
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Volume Change</span>
              <span className={stats.approxVolumeDeltaPercent < 0 ? "text-red-400" : "text-emerald-400"}>
                {stats.approxVolumeDeltaPercent < 0 ? "↓ " : "↑ "}
                {Math.abs(stats.approxVolumeDeltaPercent).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Size Δ X</span>
              <span className={stats.boundingBoxDeltaX !== 0 ? "text-amber-400" : "text-neutral-500"}>
                {stats.boundingBoxDeltaX >= 0 ? "→ " : "← "}
                {Math.abs(stats.boundingBoxDeltaX).toFixed(1)} mm
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Size Δ Y</span>
              <span className={stats.boundingBoxDeltaY !== 0 ? "text-amber-400" : "text-neutral-500"}>
                {stats.boundingBoxDeltaY >= 0 ? "→ " : "← "}
                {Math.abs(stats.boundingBoxDeltaY).toFixed(1)} mm
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Size Δ Z</span>
              <span className={stats.boundingBoxDeltaZ !== 0 ? "text-amber-400" : "text-neutral-500"}>
                {stats.boundingBoxDeltaZ >= 0 ? "↑ " : "↓ "}
                {Math.abs(stats.boundingBoxDeltaZ).toFixed(1)} mm
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Triangles</span>
              <span
                className={
                  stats.triangleDelta > 0
                    ? "text-emerald-400"
                    : stats.triangleDelta < 0
                      ? "text-red-400"
                      : "text-neutral-500"
                }
              >
                {stats.triangleDelta > 0 ? "↑ +" : stats.triangleDelta < 0 ? "↓ " : "→ "}
                {stats.triangleDelta}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Surface Area</span>
              <span className={stats.surfaceAreaDelta < 0 ? "text-red-400" : "text-emerald-400"}>
                {stats.surfaceAreaDelta < 0 ? "↓ " : "↑ "}
                {Math.abs(stats.surfaceAreaDelta).toFixed(0)} mm²
              </span>
            </div>
            {stats.thinWallWarning && (
              <div className="mt-2 rounded bg-amber-950/50 px-2 py-1 text-xs text-amber-300">
                ⚠ Thin walls detected (&lt; 0.8mm)
              </div>
            )}
            {stats.maxOverhangAngle > 45 && (
              <div className="mt-2 rounded bg-amber-950/50 px-2 py-1 text-xs text-amber-300">
                ⚠ Overhangs detected ({stats.maxOverhangAngle.toFixed(1)}°)
              </div>
            )}
          </div>
        )}
      </div>

      {/* VERSION STATS */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Version Stats
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-neutral-400">Volume</span>
            <span className="text-neutral-200">{stats ? `${volumeB.toFixed(0)} mm³` : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Bounding Box</span>
            <span className="text-neutral-200">
              {boundingBoxB[0].toFixed(0)} × {boundingBoxB[1].toFixed(0)} × {boundingBoxB[2].toFixed(0)} mm
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Triangles</span>
            <span className="text-neutral-200">{stats ? Math.round(stats.triangleDeltaB) : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Surface Area</span>
            <span className="text-neutral-200">{stats ? `${stats.surfaceAreaB.toFixed(0)} mm²` : "—"}</span>
          </div>
          {stats?.fileFormatB && (
            <div className="flex justify-between">
              <span className="text-neutral-400">File Format</span>
              <span className="text-neutral-200">{stats.fileFormatB.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* PRINTABILITY */}
      {stats && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Printability Details
          </h3>
          <div className="space-y-2">
            {stats.printabilityIssues.length > 0 && (
              <div className="space-y-1 rounded bg-neutral-900 px-2 py-1">
                {stats.printabilityIssues.map((issue, i) => (
                  <div key={i} className="text-xs text-amber-300">
                    • {issue}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-neutral-400">Wall Thickness</span>
              <span className="text-neutral-200">
                {stats.minWallThickness.toFixed(2)} – {stats.maxWallThickness.toFixed(2)} mm
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Max Overhang</span>
              <span className="text-neutral-200">{stats.maxOverhangAngle.toFixed(1)}°</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Unsupported Area</span>
              <span className="text-neutral-200">{stats.overhangAreaPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
