import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/requireAuth.js";
import { requireAdmin } from "../lib/requireAdmin.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { getAnalyticsSummary, type AnalyticsGranularity } from "../lib/analyticsStats.js";

interface AnalyticsQuery {
  from?: string;
  to?: string;
  granularity?: string;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function analyticsRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  // Self-hosted, cookie-less pageview tracking — see
  // netlify/functions/track.mts (the write side) and plan "Self-hosted
  // privacy-friendly analytics". Defaults to the last 30 days; pass
  // ?from=&to= (YYYY-MM-DD) for a wider range, e.g. 6 months back.
  app.get<{ Querystring: AnalyticsQuery }>(
    "/admin/analytics",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const from = request.query.from ?? isoDate(thirtyDaysAgo);
      const to = request.query.to ?? isoDate(now);
      const granularity: AnalyticsGranularity =
        request.query.granularity === "week" || request.query.granularity === "month"
          ? request.query.granularity
          : "day";

      try {
        const result = await getAnalyticsSummary(supabase, from, to, granularity);
        if (!result.success) {
          app.log.error("Failed to compute analytics summary: " + result.error);
          reply.code(502);
          return { success: false, error: "Failed to load analytics" };
        }
        return { success: true, data: result.data };
      } catch (err) {
        app.log.error(err, "Admin analytics threw");
        reply.code(502);
        return { success: false, error: "Failed to load analytics" };
      }
    },
  );
}
