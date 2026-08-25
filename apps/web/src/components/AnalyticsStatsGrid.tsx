import type { AnalyticsSummary } from "../lib/adminApi";
import { countryName } from "../lib/localeNames";

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink-50">{value}</p>
    </div>
  );
}

/** Same card style as AdminStatsGrid.tsx (kept as a separate component,
 * not a shared one — that grid is documented as user/subscription stats
 * specifically). Unique Visitors is a true COUNT(DISTINCT ...) over the
 * selected range (see analyticsStats.ts) — not a sum of daily uniques,
 * which would double-count a returning visitor. */
export default function AnalyticsStatsGrid({ summary }: { summary: AnalyticsSummary }) {
  const topCountry = summary.topCountries[0] ? countryName(summary.topCountries[0].value) : "—";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard label="Pageviews" value={summary.totalPageviews.toLocaleString()} />
      <StatCard label="Unique Visitors" value={summary.totalUniqueVisitors.toLocaleString()} />
      <StatCard label="Top Country" value={topCountry} />
    </div>
  );
}
