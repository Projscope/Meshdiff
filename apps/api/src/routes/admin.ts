import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/requireAuth.js";
import { requireAdmin } from "../lib/requireAdmin.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { INACTIVE_SUBSCRIPTION_STATUSES, computeTrialStatus } from "../lib/subscription.js";
import { isAdminEmail } from "../lib/requireAdmin.js";
import { getAdminStats, getSignupBuckets, type SignupGranularity } from "../lib/adminStats.js";

const PAGE_SIZE = 25;

interface AdminUsersQuery {
  page?: string;
}

interface AdminStatsQuery {
  granularity?: string;
}

interface SubscriptionRow {
  user_id: string;
  tier: "pro" | "team";
  status: string;
  current_period_end: string;
}

export default async function adminRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  // Lightweight stats-only endpoint for the Dashboard page — no paginated
  // user list, just the stat cards plus the signups trend chart.
  app.get<{ Querystring: AdminStatsQuery }>(
    "/admin/stats",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const granularity: SignupGranularity = request.query.granularity === "month" ? "month" : "week";

      try {
        const [statsResult, signupsResult] = await Promise.all([
          getAdminStats(supabase),
          getSignupBuckets(supabase, granularity),
        ]);
        if (!statsResult.success) {
          app.log.error("Failed to compute admin stats: " + statsResult.error);
          reply.code(502);
          return { success: false, error: "Failed to load stats" };
        }
        if (!signupsResult.success) {
          app.log.error("Failed to compute signup buckets: " + signupsResult.error);
          reply.code(502);
          return { success: false, error: "Failed to load stats" };
        }

        return {
          success: true,
          data: { stats: statsResult.data, signups: signupsResult.data },
        };
      } catch (err) {
        app.log.error(err, "Admin stats threw");
        reply.code(502);
        return { success: false, error: "Failed to load stats" };
      }
    },
  );

  app.get<{ Querystring: AdminUsersQuery }>(
    "/admin/users",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);

      try {
        // listUsers()'s `total` is parsed from a Link response header that's
        // only present when there's more than one page for the requested
        // perPage — a perPage:1 probe reliably forces that header (as long
        // as ≥2 users exist system-wide) independent of the real page size
        // below. See apps/api/migrations/0007_get_user_id_by_email.sql's
        // comment for why there's no cheaper way to get this count.
        const [totalProbe, pageResult, statsResult] = await Promise.all([
          supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
          supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE }),
          getAdminStats(supabase),
        ]);

        if (pageResult.error) {
          app.log.error(pageResult.error, "Failed to list users");
          reply.code(502);
          return { success: false, error: "Failed to load users" };
        }
        if (!statsResult.success) {
          app.log.error("Failed to compute admin stats: " + statsResult.error);
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
          // Admin accounts (ADMIN_EMAILS) have permanent, never-restricted
          // access via getAccountAccess() regardless of subscription state
          // — reflect that here too so this list doesn't show them as an
          // expired free user.
          if (isAdminEmail(u.email)) {
            return {
              id: u.id,
              email: u.email ?? null,
              signupDate: u.created_at,
              lastSignInAt: u.last_sign_in_at ?? null,
              tier: "team" as const,
              status: null,
              currentPeriodEnd: null,
              isTrialing: false,
              trialDaysRemaining: null,
            };
          }

          const sub = subsByUser.get(u.id);
          const isActive = !!sub && !INACTIVE_SUBSCRIPTION_STATUSES.includes(sub.status);
          // Trial status only applies to a free-tier user — listUsers()
          // already returns created_at per row, so this is pure day-math,
          // no extra lookup (see getAccountAccess() for the same helper
          // used on the actual access-gating path).
          const trial = isActive ? { isTrialing: false, trialDaysRemaining: null } : computeTrialStatus(u.created_at);
          return {
            id: u.id,
            email: u.email ?? null,
            signupDate: u.created_at,
            lastSignInAt: u.last_sign_in_at ?? null,
            tier: isActive ? sub!.tier : "free",
            status: sub?.status ?? null,
            currentPeriodEnd: isActive ? sub!.current_period_end : null,
            isTrialing: trial.isTrialing,
            trialDaysRemaining: trial.trialDaysRemaining,
          };
        });

        return {
          success: true,
          data: {
            users,
            total: totalUsers,
            stats: statsResult.data,
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
