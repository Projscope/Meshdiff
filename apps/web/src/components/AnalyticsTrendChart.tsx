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
    </svg>
  );
}
