import type { AnalyticsSummary } from "../lib/adminApi";
import { countryName } from "../lib/localeNames";

function StatCard({
  label,
  value,
  today,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  today?: number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-4" title={hint}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-ink-50">{value}</span>
        {!!today && (
          <span className="text-sm font-semibold text-accent-fg-400" title="From today">
            +{today.toLocaleString()}
          </span>
        )}
      </p>
    </div>
  );
}

/** Same card style as AdminStatsGrid.tsx (kept as a separate component,
 * not a shared one — that grid is documented as user/subscription stats
 * specifically). The visitor hash includes the calendar day, so
 * COUNT(DISTINCT ...) over a range counts one person once per day they
 * visited — visitor-days, not people. Labeled as such rather than
 * "Unique Visitors", which overstated reach. */
export default function AnalyticsStatsGrid({ summary }: { summary: AnalyticsSummary }) {
  const topCountry = summary.topCountries[0] ? countryName(summary.topCountries[0].value) : "—";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard label="Pageviews" value={summary.totalPageviews.toLocaleString()} today={summary.todayPageviews} />
      <StatCard
        label="Visitor-Days"
        value={summary.totalUniqueVisitors.toLocaleString()}
        today={summary.todayUniqueVisitors}
        hint="One person visiting on 3 different days counts as 3. Visitors are anonymized per day, so real unique people can't be counted."
      />
      <StatCard label="Top Country" value={topCountry} />
    </div>
  );
}
