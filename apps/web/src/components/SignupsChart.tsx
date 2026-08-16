import type { SignupBucket, SignupGranularity } from "../lib/adminApi";

const WIDTH = 640;
const HEIGHT = 160;
const PADDING_TOP = 16; // room for the count label above the tallest bar
const PADDING_BOTTOM = 20;

function formatPeriodLabel(iso: string, granularity: SignupGranularity): string {
  // periodStart is a UTC-midnight date string ("2026-08-01") — format it in
  // UTC too, or a browser in a behind-UTC timezone rolls it back a day
  // (Aug 1 00:00 UTC displays as Jul 31 local).
  const date = new Date(iso);
  return granularity === "week"
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
    : date.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Hand-rolled bar chart — the dataset is a handful of periods, not worth a
 * charting library dependency. */
export default function SignupsChart({
  buckets,
  granularity,
}: {
  buckets: SignupBucket[];
  granularity: SignupGranularity;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const top = PADDING_TOP;
  const bottom = HEIGHT - PADDING_BOTTOM;
  const barAreaHeight = bottom - top;
  const barWidth = WIDTH / buckets.length;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Signups over time">
      {buckets.map((bucket, i) => {
        const barHeight = (bucket.count / max) * barAreaHeight;
        const x = i * barWidth;
        const y = bottom - barHeight;
        return (
          <g key={bucket.periodStart}>
            <rect
              x={x + barWidth * 0.15}
              y={y}
              width={barWidth * 0.7}
              height={barHeight}
              rx={2}
              className="fill-emerald-500/70"
            />
            {bucket.count > 0 && (
              <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" className="fill-neutral-400 text-[9px]">
                {bucket.count}
              </text>
            )}
            <text x={x + barWidth / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-neutral-600 text-[9px]">
              {formatPeriodLabel(bucket.periodStart, granularity)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
