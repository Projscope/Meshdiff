import { useEffect, useState } from "react";
import { getAdminAnalytics, type AnalyticsSummary } from "../lib/adminApi";
import AnalyticsStatsGrid from "../components/AnalyticsStatsGrid";
import AnalyticsTrendChart from "../components/AnalyticsTrendChart";
import AnalyticsRankedList from "../components/AnalyticsRankedList";
import { countryName, languageName } from "../lib/localeNames";

type RangePreset = "30d" | "6m";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rangeFor(preset: RangePreset): { from: string; to: string } {
  const now = new Date();
  const days = preset === "30d" ? 30 : 183;
  return { from: isoDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000)), to: isoDate(now) };
}

/** Self-hosted, cookie-less pageview analytics — runs alongside Google
 * Analytics for now (see apps/web/src/lib/analytics.ts), not a replacement
 * yet. A separate page from AdminDashboardPage.tsx on purpose, to keep
 * that one focused on user/subscription stats. */
export default function AdminAnalyticsPage() {
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    const { from, to } = rangeFor(preset);
    getAdminAnalytics(from, to).then((result) => {
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    });
  }, [preset]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-50">Analytics</h1>
          <p className="mt-1 text-sm text-ink-400">Visitors, pages, countries, languages, and referrers</p>
        </div>
        <div className="flex overflow-hidden rounded border border-ink-700 text-xs">
          <button
            type="button"
            onClick={() => setPreset("30d")}
            className={`px-2.5 py-1 ${preset === "30d" ? "bg-accent-500 text-chrome-950" : "text-ink-400 hover:bg-ink-800"}`}
          >
            Last 30 days
          </button>
          <button
            type="button"
            onClick={() => setPreset("6m")}
            className={`px-2.5 py-1 ${preset === "6m" ? "bg-accent-500 text-chrome-950" : "text-ink-400 hover:bg-ink-800"}`}
          >
            Last 6 months
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {data === null && !error && <div className="mt-6 text-sm text-ink-500">Loading…</div>}

      {data && (
        <>
          <div className="mt-6">
            <AnalyticsStatsGrid summary={data} />
          </div>

          <div className="mt-6 rounded-lg border border-ink-800 bg-ink-900 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Pageviews</p>
              <div className="flex items-center gap-1.5 text-[10px] text-ink-500">
                <span className="inline-block h-0.5 w-3 rounded-full bg-white/80" />
                Trend
              </div>
            </div>
            <div className="mt-3">
              <AnalyticsTrendChart trend={data.dailyTrend} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AnalyticsRankedList title="Top Pages" entries={data.topPages} />
            <AnalyticsRankedList title="Top Countries" entries={data.topCountries} formatValue={countryName} />
            <AnalyticsRankedList title="Top Languages" entries={data.topLanguages} formatValue={languageName} />
            <AnalyticsRankedList title="Top Referrers" entries={data.topReferrers} />
          </div>
        </>
      )}
    </div>
  );
}
