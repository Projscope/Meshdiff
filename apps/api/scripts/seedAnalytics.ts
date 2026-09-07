// One-off local dev seeder: fills analytics_daily_rollup and
// analytics_visitor_daily with ~6 months of plausible-looking traffic so
// /admin/analytics has something to render without waiting on real hits.
// Run with: npx tsx scripts/seedAnalytics.ts   (from apps/api)
//
// Local-only by construction — refuses to run against anything but a
// 127.0.0.1/localhost SUPABASE_URL (see the guard below), since this writes
// fabricated numbers that must never touch a real analytics table.
//
// Writes final aggregated rows directly via upsert rather than looping
// increment_analytics_rollup once per pageview (see 0024_analytics.sql) —
// that RPC exists for the real tracker's one-event-at-a-time writes;
// seeding already has the day's final totals, so a straight upsert of
// ~40 rows/day is equivalent and orders of magnitude faster.

import "dotenv/config";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  console.error(
    `Refusing to run: SUPABASE_URL (${SUPABASE_URL}) is not a local instance. ` +
      `This script fabricates analytics numbers — it must only ever run against local Supabase.`,
  );
  process.exit(1);
}

const DAYS = 182; // covers both the "Last 30 days" and "Last 6 months" admin views
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type Weighted = [string, number];

const PAGES: Weighted[] = [
  ["/", 0.22],
  ["/live", 0.18],
  ["/features", 0.1],
  ["/pricing", 0.09],
  ["/docs", 0.07],
  ["/roadmap", 0.05],
  ["/blog", 0.06],
  ["/compare-stl-files", 0.05],
  ["/stl-diff-tool", 0.04],
  ["/compare-3mf-files", 0.03],
  ["/obj-diff", 0.03],
  ["/3d-print-version-control", 0.03],
  ["/vs-manual-comparison", 0.02],
  ["/projects", 0.02],
  ["/embed", 0.01],
];

const COUNTRIES: Weighted[] = [
  ["US", 0.38],
  ["GB", 0.12],
  ["DE", 0.09],
  ["IN", 0.08],
  ["CA", 0.06],
  ["FR", 0.05],
  ["AU", 0.04],
  ["NL", 0.03],
  ["BR", 0.03],
  ["JP", 0.02],
  ["unknown", 0.1],
];

const LANGUAGES: Weighted[] = [
  ["en-US", 0.42],
  ["en-GB", 0.1],
  ["en", 0.08],
  ["de-DE", 0.08],
  ["fr-FR", 0.05],
  ["es-ES", 0.05],
  ["pt-BR", 0.04],
  ["nl-NL", 0.03],
  ["ja-JP", 0.02],
  ["unknown", 0.13],
];

const REFERRERS: Weighted[] = [
  ["(direct)", 0.45],
  ["google.com", 0.22],
  ["twitter.com", 0.06],
  ["github.com", 0.06],
  ["news.ycombinator.com", 0.05],
  ["producthunt.com", 0.04],
  ["linkedin.com", 0.04],
  ["reddit.com", 0.04],
  ["bing.com", 0.04],
];

const DEVICES: Weighted[] = [
  ["desktop", 0.68],
  ["mobile", 0.26],
  ["tablet", 0.06],
];

const BROWSERS: Weighted[] = [
  ["Chrome", 0.62],
  ["Safari", 0.19],
  ["Firefox", 0.09],
  ["Edge", 0.06],
  ["Opera", 0.02],
  ["Samsung Internet", 0.02],
];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Splits `total` across weighted buckets so the parts sum to exactly
 * `total` (largest-remainder method), after jittering each weight by
 * ±30% so the same dimension doesn't look identically proportioned every
 * day. */
function splitCount(total: number, weights: Weighted[]): Array<{ value: string; count: number }> {
  const jittered = weights.map(([value, weight]) => [value, weight * randomBetween(0.7, 1.3)] as const);
  const weightSum = jittered.reduce((sum, [, w]) => sum + w, 0);

  const raw = jittered.map(([value, w]) => ({ value, exact: (w / weightSum) * total }));
  const floored = raw.map((r) => ({ value: r.value, count: Math.floor(r.exact), remainder: r.exact - Math.floor(r.exact) }));
  let distributed = floored.reduce((sum, r) => sum + r.count, 0);
  let remaining = total - distributed;

  floored.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < floored.length && remaining > 0; i++, remaining--) {
    floored[i]!.count += 1;
  }
  return floored.filter((r) => r.count > 0).map((r) => ({ value: r.value, count: r.count }));
}

function dayString(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

interface RollupRow {
  day: string;
  dimension_type: string;
  dimension_value: string;
  pageview_count: number;
  visitor_count: number;
}

async function upsertChunked(table: string, rows: unknown[], conflictKeys: string): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflictKeys });
    if (error) throw error;
  }
}

async function main() {
  console.log(`Seeding ${DAYS} days of analytics into ${SUPABASE_URL}...`);

  console.log("Clearing existing local analytics rows...");
  await supabase.from("analytics_daily_rollup").delete().neq("day", "1900-01-01");
  await supabase.from("analytics_visitor_daily").delete().neq("day", "1900-01-01");

  const rollupRows: RollupRow[] = [];
  const visitorRows: Array<{ visitor_hash: string; day: string }> = [];

  for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
    const day = dayString(daysAgo);
    const date = new Date(`${day}T00:00:00Z`);
    const dow = date.getUTCDay(); // 0=Sun..6=Sat
    const weekdayFactor = dow === 0 || dow === 6 ? randomBetween(0.55, 0.8) : randomBetween(0.95, 1.3);
    // Gentle organic-growth curve: ~3x from the oldest day to today.
    const growthFactor = 1 + 2 * ((DAYS - 1 - daysAgo) / (DAYS - 1));
    const basePageviews = 24 * weekdayFactor * growthFactor * randomBetween(0.75, 1.25);
    const totalPageviews = Math.max(1, Math.round(basePageviews));
    const totalVisitors = Math.max(1, Math.round(totalPageviews * randomBetween(0.45, 0.72)));

    rollupRows.push({
      day,
      dimension_type: "total",
      dimension_value: "total",
      pageview_count: totalPageviews,
      visitor_count: totalVisitors,
    });

    const dimensionBuckets: Array<[string, Weighted[]]> = [
      ["page", PAGES],
      ["country", COUNTRIES],
      ["language", LANGUAGES],
      ["referrer", REFERRERS],
      ["device", DEVICES],
      ["browser", BROWSERS],
    ];
    for (const [dimensionType, weights] of dimensionBuckets) {
      for (const { value, count } of splitCount(totalPageviews, weights)) {
        rollupRows.push({
          day,
          dimension_type: dimensionType,
          dimension_value: value,
          pageview_count: count,
          // Proportional estimate — only the "total" dimension's
          // visitor_count is ever read (see analyticsStats.ts), this just
          // keeps the column non-nonsensical for the other dimensions.
          visitor_count: Math.max(1, Math.round((count / totalPageviews) * totalVisitors)),
        });
      }
    }

    for (let i = 0; i < totalVisitors; i++) {
      visitorRows.push({ visitor_hash: randomUUID(), day });
    }
  }

  console.log(`Writing ${rollupRows.length} rollup rows...`);
  await upsertChunked("analytics_daily_rollup", rollupRows, "day,dimension_type,dimension_value");

  console.log(`Writing ${visitorRows.length} visitor-dedupe rows...`);
  await upsertChunked("analytics_visitor_daily", visitorRows, "day,visitor_hash");

  console.log("Done. Reload /admin/analytics to see it.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
