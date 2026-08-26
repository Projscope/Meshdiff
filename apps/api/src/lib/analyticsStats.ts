import type { SupabaseClient } from "@supabase/supabase-js";

export interface AnalyticsTrendPoint {
  date: string;
  pageviews: number;
  visitors: number;
}

export interface AnalyticsBreakdownEntry {
  value: string;
  count: number;
  /** This value's contribution to `count` from today (UTC) alone — powers
   * the "+N" badge in the UI. 0, not omitted, when nothing happened today. */
  todayCount: number;
}

export interface AnalyticsSummary {
  totalPageviews: number;
  totalUniqueVisitors: number;
  /** Today's (UTC) slice of the two totals above — always within range,
   * since both UI presets (last 30 days / last 6 months) end at "now". */
  todayPageviews: number;
  todayUniqueVisitors: number;
  dailyTrend: AnalyticsTrendPoint[];
  topPages: AnalyticsBreakdownEntry[];
  topCountries: AnalyticsBreakdownEntry[];
  topLanguages: AnalyticsBreakdownEntry[];
  topReferrers: AnalyticsBreakdownEntry[];
}

type Result<T> = { success: true; data: T } | { success: false; error: string };

// High enough that the ranked lists rarely truncate real data — the
// frontend paginates client-side in pages of 15 (see AnalyticsRankedList.tsx)
// rather than re-fetching, so this just needs to cover a generous number of
// distinct values per dimension over the range, not match the page size.
const TOP_N = 50;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function topBreakdown(
  supabase: SupabaseClient,
  dimensionType: string,
  from: string,
  to: string,
  today: string,
): Promise<Result<AnalyticsBreakdownEntry[]>> {
  const { data, error } = await supabase
    .from("analytics_daily_rollup")
    .select("dimension_value, pageview_count, day")
    .eq("dimension_type", dimensionType)
    .gte("day", from)
    .lte("day", to);
  if (error) return { success: false, error: error.message };

  const totals = new Map<string, number>();
  const todayTotals = new Map<string, number>();
  for (const row of data as Array<{ dimension_value: string; pageview_count: number; day: string }>) {
    totals.set(row.dimension_value, (totals.get(row.dimension_value) ?? 0) + row.pageview_count);
    if (row.day === today) {
      todayTotals.set(row.dimension_value, (todayTotals.get(row.dimension_value) ?? 0) + row.pageview_count);
    }
  }
  const sorted = [...totals.entries()]
    .map(([value, count]) => ({ value, count, todayCount: todayTotals.get(value) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
  return { success: true, data: sorted };
}

/**
 * Reads from the pre-aggregated analytics_daily_rollup /
 * analytics_visitor_daily tables (see migration 0024_analytics.sql and
 * netlify/functions/track.mts, which write them) — no raw event log to
 * scan, so a 6-month range is just as cheap as a 1-month one.
 *
 * totalUniqueVisitors is deliberately a COUNT(DISTINCT visitor_hash) over
 * the dedupe table, not a sum of the rollup's daily visitor_count column —
 * summing per-day uniques across a range double-counts a visitor active on
 * multiple days. The rollup's visitor_count is only a correct metric per
 * individual day (used for dailyTrend), never summed across days.
 */
/**
 * All-time (not date-range-limited) pageview count per page path, keyed by
 * the path with any trailing slash stripped. A page can get recorded with
 * or without a trailing slash depending on how it was linked/typed (see
 * analytics.md's note on `/roadmap` vs `/roadmap/` showing up as separate
 * Top Pages rows) — this sums both variants together so a caller matching
 * against a known path (e.g. a blog post's `/blog/:slug`) gets the true
 * total rather than half of it. Used by blog.ts's admin post list to show
 * a view count per post; not date-range-scoped since a post's lifetime
 * total is more useful there than a 30-day window.
 */
export async function getPageviewCountsByPath(supabase: SupabaseClient): Promise<Result<Map<string, number>>> {
  const { data, error } = await supabase
    .from("analytics_daily_rollup")
    .select("dimension_value, pageview_count")
    .eq("dimension_type", "page");
  if (error) return { success: false, error: error.message };

  const totals = new Map<string, number>();
  for (const row of data as Array<{ dimension_value: string; pageview_count: number }>) {
    const normalized = row.dimension_value.replace(/\/$/, "") || "/";
    totals.set(normalized, (totals.get(normalized) ?? 0) + row.pageview_count);
  }
  return { success: true, data: totals };
}

export async function getAnalyticsSummary(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<Result<AnalyticsSummary>> {
  const today = todayUTC();
  const [totalRow, uniqueResult, pagesResult, countriesResult, languagesResult, referrersResult] = await Promise.all([
    supabase
      .from("analytics_daily_rollup")
      .select("day, pageview_count, visitor_count")
      .eq("dimension_type", "total")
      .eq("dimension_value", "total")
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: true }),
    supabase.rpc("count_distinct_visitors", { p_from: from, p_to: to }),
    topBreakdown(supabase, "page", from, to, today),
    topBreakdown(supabase, "country", from, to, today),
    topBreakdown(supabase, "language", from, to, today),
    topBreakdown(supabase, "referrer", from, to, today),
  ]);

  if (totalRow.error) return { success: false, error: totalRow.error.message };
  if (uniqueResult.error) return { success: false, error: uniqueResult.error.message };
  if (!pagesResult.success) return pagesResult;
  if (!countriesResult.success) return countriesResult;
  if (!languagesResult.success) return languagesResult;
  if (!referrersResult.success) return referrersResult;

  const dailyTrend: AnalyticsTrendPoint[] = (
    totalRow.data as Array<{ day: string; pageview_count: number; visitor_count: number }>
  ).map((row) => ({ date: row.day, pageviews: row.pageview_count, visitors: row.visitor_count }));

  const totalPageviews = dailyTrend.reduce((sum, point) => sum + point.pageviews, 0);
  const todayPoint = dailyTrend.find((point) => point.date === today);

  return {
    success: true,
    data: {
      totalPageviews,
      totalUniqueVisitors: Number(uniqueResult.data ?? 0),
      todayPageviews: todayPoint?.pageviews ?? 0,
      todayUniqueVisitors: todayPoint?.visitors ?? 0,
      dailyTrend,
      topPages: pagesResult.data,
      topCountries: countriesResult.data,
      topLanguages: languagesResult.data,
      topReferrers: referrersResult.data,
    },
  };
}
