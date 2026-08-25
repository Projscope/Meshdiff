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

/** Hand-rolled inline SVG combo chart, same approach as SignupsChart.tsx —
 * not worth a charting library dependency for a handful of daily points.
 * Bars are pageviews; the two overlaid lines split that same total into
 * unique visitors (blue) and "returning" views (red) — see the note below
 * on what "returning" actually means here. A day with no visits at all
 * won't have a row in the data at all (see analyticsStats.ts), so gaps are
 * filled with zero-height bars/points here rather than skipped, keeping
 * the x-axis evenly spaced by calendar day. */
export default function AnalyticsTrendChart({ trend }: { trend: AnalyticsTrendPoint[] }) {
  const max = Math.max(1, ...trend.map((point) => point.pageviews));
  const top = PADDING_TOP;
  const bottom = HEIGHT - PADDING_BOTTOM;
  const barAreaHeight = bottom - top;
  const barWidth = WIDTH / Math.max(1, trend.length);
  // Skip every Nth label once there are too many days to fit legibly.
  const labelStride = Math.max(1, Math.ceil(trend.length / 12));
  const showLines = trend.length >= 2;

  const xFor = (i: number) => i * barWidth + barWidth / 2;
  const yFor = (value: number) => bottom - (value / max) * barAreaHeight;

  // "Returning" is repeat pageviews within the SAME day, beyond each
  // visitor's first hit that day — not a multi-day return visit. The
  // visitor hash intentionally rotates every calendar day (see
  // netlify/functions/track.mts and analytics.md) so the same real person
  // is unrecognizable across days by design; there's no way to tell "back
  // again this week" from "brand new" without weakening that privacy
  // guarantee, so this chart doesn't claim to.
  const returningFor = (point: AnalyticsTrendPoint) => Math.max(0, point.pageviews - point.visitors);

  const uniquePoints = trend.map((point, i) => `${xFor(i)},${yFor(point.visitors)}`).join(" ");
  const returningPoints = trend.map((point, i) => `${xFor(i)},${yFor(returningFor(point))}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      role="img"
      aria-label="Pageviews, unique visitors, and same-day returning views over time"
    >
      {trend.map((point, i) => {
        const barHeight = (point.pageviews / max) * barAreaHeight;
        const x = i * barWidth;
        const y = bottom - barHeight;
        return (
          <g key={point.date}>
            <title>{`${formatDateLabel(point.date)}: ${point.pageviews.toLocaleString()} pageviews, ${point.visitors.toLocaleString()} unique visitors`}</title>
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
                <text x={xFor(i)} y={y - 4} textAnchor="middle" className="fill-ink-300 text-[9px] font-semibold">
                  {point.pageviews.toLocaleString()}
                </text>
                <text x={xFor(i)} y={HEIGHT - 4} textAnchor="middle" className="fill-ink-600 text-[9px]">
                  {formatDateLabel(point.date)}
                </text>
              </>
            )}
          </g>
        );
      })}

      {showLines && (
        <>
          <polyline
            points={returningPoints}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-red-400"
          />
          <polyline
            points={uniquePoints}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-sky-400"
          />
          {trend.map((point, i) => (
            <g key={`markers-${point.date}`}>
              <circle cx={xFor(i)} cy={yFor(returningFor(point))} r={2} className="fill-red-400" />
              <circle cx={xFor(i)} cy={yFor(point.visitors)} r={2} className="fill-sky-400" />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}
