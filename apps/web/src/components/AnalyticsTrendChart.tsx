import type { AnalyticsTrendPoint } from "../lib/adminApi";

const WIDTH = 640;
const HEIGHT = 160;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 20;

function formatDateLabel(iso: string): string {
  // "day" is a UTC-midnight date string ("2026-08-01") — format in UTC too,
  // same reasoning as SignupsChart.tsx's formatPeriodLabel (a behind-UTC
  // timezone would otherwise roll it back a day).
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Trailing moving average — smooths day-to-day noise so the overall
 * tendency (growing/flat/declining) reads clearly against the raw bars.
 * Uses a shrinking window at the start of the series rather than padding
 * with zeros, so the first few points aren't artificially dragged down. */
function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
}

/** Hand-rolled inline SVG bar chart, same approach as SignupsChart.tsx —
 * not worth a charting library dependency for a handful of daily points.
 * A day with no visits at all won't have a row in the data at all (see
 * analyticsStats.ts), so gaps are filled with zero-height bars here rather
 * than skipped, keeping the x-axis evenly spaced by calendar day. */
export default function AnalyticsTrendChart({ trend }: { trend: AnalyticsTrendPoint[] }) {
  const max = Math.max(1, ...trend.map((point) => point.pageviews));
  const top = PADDING_TOP;
  const bottom = HEIGHT - PADDING_BOTTOM;
  const barAreaHeight = bottom - top;
  const barWidth = WIDTH / Math.max(1, trend.length);
  // Skip every Nth label once there are too many days to fit legibly.
  const labelStride = Math.max(1, Math.ceil(trend.length / 12));

  // Longer ranges are noisier day-to-day, so widen the smoothing window —
  // 7 days once there's enough history for it to mean something, otherwise
  // fall back to a shorter window rather than over-smoothing a sparse range.
  const window = trend.length >= 14 ? 7 : Math.max(1, Math.min(3, trend.length));
  const smoothed = movingAverage(
    trend.map((p) => p.pageviews),
    window,
  );
  const showTrendLine = trend.length >= 2;
  const linePoints = smoothed
    .map((v, i) => {
      const x = i * barWidth + barWidth / 2;
      const y = bottom - (v / max) * barAreaHeight;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Pageviews over time">
      {trend.map((point, i) => {
        const barHeight = (point.pageviews / max) * barAreaHeight;
        const x = i * barWidth;
        const y = bottom - barHeight;
        return (
          <g key={point.date}>
            <title>{`${formatDateLabel(point.date)}: ${point.pageviews.toLocaleString()} pageviews`}</title>
            <rect
              x={x + barWidth * 0.15}
              y={y}
              width={barWidth * 0.7}
              height={barHeight}
              rx={2}
              className="fill-accent-500/70"
            />
            {i % labelStride === 0 && (
              <>
                <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" className="fill-ink-300 text-[9px] font-semibold">
                  {point.pageviews.toLocaleString()}
                </text>
                <text x={x + barWidth / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-ink-600 text-[9px]">
                  {formatDateLabel(point.date)}
                </text>
              </>
            )}
          </g>
        );
      })}

      {showTrendLine && (
        <polyline
          points={linePoints}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-white/80"
        />
      )}
      {showTrendLine &&
        smoothed.map((v, i) => (
          <circle
            key={trend[i].date}
            cx={i * barWidth + barWidth / 2}
            cy={bottom - (v / max) * barAreaHeight}
            r={2}
            className="fill-white/80"
          />
        ))}
    </svg>
  );
}
