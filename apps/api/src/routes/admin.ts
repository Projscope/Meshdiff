import type { FastifyInstance } from "fastify";
import { getSupabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/requireAuth.js";
import { requireAdmin } from "../lib/requireAdmin.js";
import { INACTIVE_SUBSCRIPTION_STATUSES } from "../lib/subscription.js";

const PAGE_SIZE = 25;

interface AdminUsersQuery {
  page?: string;
}

interface SubscriptionRow {
  user_id: string;
  tier: "pro";
  status: string;
  current_period_end: string;
}

export default async function adminRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: AdminUsersQuery }>(
    "/admin/users",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = getSupabase();
      if (!supabase) {
        reply.code(500);
        return { success: false, error: "Admin is not configured" };
      }

      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);

      try {
        // listUsers()'s `total` is parsed from a Link response header that's
        // only present when there's more than one page for the requested
        // perPage — a perPage:1 probe reliably forces that header (as long
        // as ≥2 users exist system-wide) independent of the real page size
        // below. See apps/api/migrations/0007_get_user_id_by_email.sql's
        // comment for why there's no cheaper way to get this count.
        const [totalProbe, pageResult] = await Promise.all([
          supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
          supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE }),
        ]);

        if (pageResult.error) {
          app.log.error(pageResult.error, "Failed to list users");
          reply.code(502);
          return { success: false, error: "Failed to load users" };
        }

        // totalProbe.error's fallback shape ({ users: [] }) has no `total`
        // field — only take it when the probe actually succeeded.
        const totalUsers =
          (!totalProbe.error && "total" in totalProbe.data ? totalProbe.data.total : 0) ||
          pageResult.data.users.length;

        const userIds = pageResult.data.users.map((u) => u.id);
        const { data: subs, error: subsError } = await supabase
          .from("subscriptions")
          .select("user_id, tier, status, current_period_end")
          .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);
        if (subsError) {
          app.log.error(subsError, "Failed to load subscriptions for admin users list");
          reply.code(502);
          return { success: false, error: "Failed to load users" };
        }
        const subsByUser = new Map((subs as SubscriptionRow[]).map((s) => [s.user_id, s]));

        const users = pageResult.data.users.map((u) => {
          const sub = subsByUser.get(u.id);
          const isPro = !!sub && sub.tier === "pro" && !INACTIVE_SUBSCRIPTION_STATUSES.includes(sub.status);
          return {
            id: u.id,
            email: u.email ?? null,
            signupDate: u.created_at,
            tier: isPro ? "pro" : "free",
            status: sub?.status ?? null,
            currentPeriodEnd: isPro ? sub!.current_period_end : null,
          };
        });

        // Conversion rate needs the true global Pro count, not just this
        // page's — a direct count query on subscriptions rather than
        // paginating every auth.users page.
        const { count: proCount, error: proCountError } = await supabase
          .from("subscriptions")
          .select("*", { count: "exact", head: true })
          .eq("tier", "pro")
          .not("status", "in", `(${INACTIVE_SUBSCRIPTION_STATUSES.join(",")})`);
        if (proCountError) {
          app.log.error(proCountError, "Failed to count pro subscriptions");
          reply.code(502);
          return { success: false, error: "Failed to load users" };
        }

        // Share counts by who created them, using the tier snapshotted at
        // share time (share_stats.tier_at_share — see migration 0016), not
        // a live join: null = the anonymous public Live Diff tool
        // ("community"), 'free'/'pro' = a signed-in project comparison
        // share from an account at that tier when they shared.
        const [communityShares, freeShares, proShares] = await Promise.all([
          supabase.from("share_stats").select("*", { count: "exact", head: true }).is("tier_at_share", null),
          supabase.from("share_stats").select("*", { count: "exact", head: true }).eq("tier_at_share", "free"),
          supabase.from("share_stats").select("*", { count: "exact", head: true }).eq("tier_at_share", "pro"),
        ]);
        if (communityShares.error || freeShares.error || proShares.error) {
          app.log.error(
            { community: communityShares.error, free: freeShares.error, pro: proShares.error },
            "Failed to count shares",
          );
          reply.code(502);
          return { success: false, error: "Failed to load users" };
        }

        return {
          success: true,
          data: {
            users,
            total: totalUsers,
            stats: {
              totalUsers,
              proUsers: proCount ?? 0,
              conversionRate: totalUsers > 0 ? Math.round(((proCount ?? 0) / totalUsers) * 1000) / 10 : 0,
              communityShares: communityShares.count ?? 0,
              freeShares: freeShares.count ?? 0,
              proShares: proShares.count ?? 0,
            },
          },
        };
      } catch (err) {
        app.log.error(err, "Admin users list threw");
        reply.code(502);
        return { success: false, error: "Failed to load users" };
      }
    },
  );
}
