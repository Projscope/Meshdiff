import type { SupabaseClient } from "@supabase/supabase-js";

export interface AnalyticsTrendPoint {
  date: string;
  pageviews: number;
  visitors: number;
}

export interface AnalyticsBreakdownEntry {
  value: string;
  count: number;
}

export interface AnalyticsSummary {
  totalPageviews: number;
  totalUniqueVisitors: number;
  dailyTrend: AnalyticsTrendPoint[];
  topPages: AnalyticsBreakdownEntry[];
  topCountries: AnalyticsBreakdownEntry[];
  topLanguages: AnalyticsBreakdownEntry[];
  topReferrers: AnalyticsBreakdownEntry[];
}

type Result<T> = { success: true; data: T } | { success: false; error: string };

const TOP_N = 10;

async function topBreakdown(
  supabase: SupabaseClient,
  dimensionType: string,
  from: string,
  to: string,
): Promise<Result<AnalyticsBreakdownEntry[]>> {
  const { data, error } = await supabase
    .from("analytics_daily_rollup")
    .select("dimension_value, pageview_count")
    .eq("dimension_type", dimensionType)
    .gte("day", from)
    .lte("day", to);
  if (error) return { success: false, error: error.message };

  const totals = new Map<string, number>();
  for (const row of data as Array<{ dimension_value: string; pageview_count: number }>) {
    totals.set(row.dimension_value, (totals.get(row.dimension_value) ?? 0) + row.pageview_count);
  }
  const sorted = [...totals.entries()]
    .map(([value, count]) => ({ value, count }))
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
export async function getAnalyticsSummary(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<Result<AnalyticsSummary>> {
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
    topBreakdown(supabase, "page", from, to),
    topBreakdown(supabase, "country", from, to),
    topBreakdown(supabase, "language", from, to),
    topBreakdown(supabase, "referrer", from, to),
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

  return {
    success: true,
    data: {
      totalPageviews,
      totalUniqueVisitors: Number(uniqueResult.data ?? 0),
      dailyTrend,
      topPages: pagesResult.data,
      topCountries: countriesResult.data,
      topLanguages: languagesResult.data,
      topReferrers: referrersResult.data,
    },
  };
}
