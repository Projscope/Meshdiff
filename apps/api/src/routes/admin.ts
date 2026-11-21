import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/requireAuth.js";
import { requireAdmin } from "../lib/requireAdmin.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { INACTIVE_SUBSCRIPTION_STATUSES, computeTrialStatus, trialEndsAtMs } from "../lib/subscription.js";
import { getFirstUploadAt, getFirstUploadsByUser } from "../lib/firstUpload.js";
import { getLastSeenByUser } from "../lib/productEvents.js";
import { isAdminEmail } from "../lib/requireAdmin.js";
import { getAdminStats, getSignupBuckets, type SignupGranularity } from "../lib/adminStats.js";
import { getDemoUserIds, setDemoAccount } from "../lib/demoAccounts.js";
import { getAdminGrantsByUser, setAdminGrant, type GrantedTier } from "../lib/adminGrants.js";
import { getTrialExtensionsByUser, getTrialExtension, setTrialExtension } from "../lib/trialExtensions.js";

const PAGE_SIZE = 25;

interface AdminUsersQuery {
  page?: string;
}

interface AdminStatsQuery {
  granularity?: string;
}

interface AdminUserDemoParams {
  userId: string;
}

interface AdminUserDemoBody {
  demo?: boolean;
}

interface AdminUserGrantParams {
  userId: string;
}

interface AdminUserGrantBody {
  tier?: string;
}

interface AdminUserTrialParams {
  userId: string;
}

interface AdminUserTrialBody {
  /** Extends the trial by this many days from whichever is later, now or
   * the account's current effective trial end — never shortens it. `null`
   * clears any existing extension, reverting to the default created_at +
   * 14 days computation. */
  days?: number | null;
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
        const [totalProbe, pageResult, statsResult, demoIdsResult] = await Promise.all([
          supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
          supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE }),
          getAdminStats(supabase),
          getDemoUserIds(supabase),
        ]);
        const grantsResult = await getAdminGrantsByUser(
          supabase,
          pageResult.error ? [] : pageResult.data.users.map((u) => u.id),
        );
        const trialExtensionsResult = await getTrialExtensionsByUser(
          supabase,
          pageResult.error ? [] : pageResult.data.users.map((u) => u.id),
        );
        const firstUploadsResult = await getFirstUploadsByUser(
          supabase,
          pageResult.error ? [] : pageResult.data.users.map((u) => u.id),
        );
        const lastSeenByUser = await getLastSeenByUser(
          supabase,
          pageResult.error ? [] : pageResult.data.users.map((u) => u.id),
        );

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
        if (!demoIdsResult.success) {
          app.log.error("Failed to load demo accounts: " + demoIdsResult.error);
          reply.code(502);
          return { success: false, error: "Failed to load users" };
        }
        if (!grantsResult.success) {
          app.log.error("Failed to load admin-granted tiers: " + grantsResult.error);
          reply.code(502);
          return { success: false, error: "Failed to load users" };
        }
        if (!trialExtensionsResult.success) {
          app.log.error("Failed to load trial extensions: " + trialExtensionsResult.error);
          reply.code(502);
          return { success: false, error: "Failed to load users" };
        }
        if (!firstUploadsResult.success) {
          app.log.error("Failed to load first uploads: " + firstUploadsResult.error);
          reply.code(502);
          return { success: false, error: "Failed to load users" };
        }
        const demoIds = demoIdsResult.data;
        const grantsByUser = grantsResult.data;
        const trialExtensionsByUser = trialExtensionsResult.data;
        const firstUploadsByUser = firstUploadsResult.data;

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
          const isDemo = demoIds.has(u.id);
          const isAdmin = isAdminEmail(u.email);
          const adminGrantedTier = grantsByUser.get(u.id) ?? null;
          const trialExtendedTo = trialExtensionsByUser.get(u.id) ?? null;

          if (isAdmin) {
            return {
              id: u.id,
              email: u.email ?? null,
              signupDate: u.created_at,
              lastSignInAt: u.last_sign_in_at ?? null,
              lastSeenAt: lastSeenByUser.get(u.id) ?? null,
              tier: "team" as const,
              status: null,
              currentPeriodEnd: null,
              isTrialing: false,
              trialDaysRemaining: null,
              trialClockStarted: false,
              isDemo,
              isAdmin,
              adminGrantedTier,
              trialExtendedTo,
            };
          }

          // An admin grant (see adminGrants.ts) takes priority over a real
          // subscription — same precedence getUserTier() applies on the
          // actual access-gating path, so this list never disagrees with
          // what the account can really do.
          if (adminGrantedTier) {
            return {
              id: u.id,
              email: u.email ?? null,
              signupDate: u.created_at,
              lastSignInAt: u.last_sign_in_at ?? null,
              lastSeenAt: lastSeenByUser.get(u.id) ?? null,
              tier: adminGrantedTier,
              status: null,
              currentPeriodEnd: null,
              isTrialing: false,
              trialDaysRemaining: null,
              trialClockStarted: false,
              isDemo,
              isAdmin,
              adminGrantedTier,
              trialExtendedTo,
            };
          }

          const sub = subsByUser.get(u.id);
          const isActive = !!sub && !INACTIVE_SUBSCRIPTION_STATUSES.includes(sub.status);
          // Trial status only applies to a free-tier user — listUsers()
          // already returns created_at per row, so this is pure day-math,
          // no extra lookup (see getAccountAccess() for the same helper
          // used on the actual access-gating path). trialExtendedTo (see
          // trialExtensions.ts) overrides the default end date when set.
          const trial = isActive
            ? { isTrialing: false, trialDaysRemaining: null, trialClockStarted: false }
            : computeTrialStatus(u.created_at, trialExtendedTo, firstUploadsByUser.get(u.id) ?? null);
          return {
            id: u.id,
            email: u.email ?? null,
            signupDate: u.created_at,
            lastSignInAt: u.last_sign_in_at ?? null,
            lastSeenAt: lastSeenByUser.get(u.id) ?? null,
            tier: isActive ? sub!.tier : "free",
            status: sub?.status ?? null,
            currentPeriodEnd: isActive ? sub!.current_period_end : null,
            isTrialing: trial.isTrialing,
            trialDaysRemaining: trial.trialDaysRemaining,
            trialClockStarted: trial.trialClockStarted,
            isDemo,
            isAdmin,
            adminGrantedTier,
            trialExtendedTo,
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

  // Flags/unflags a user as a demo account (see 20260101000025_demo_accounts.sql)
  // — excluded from the user-count widgets above and the signups trend
  // chart, with no effect on the account's own access or billing.
  app.patch<{ Params: AdminUserDemoParams; Body: AdminUserDemoBody }>(
    "/admin/users/:userId/demo",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const { userId } = request.params;
      const demo = request.body?.demo;
      if (typeof demo !== "boolean") {
        reply.code(400);
        return { success: false, error: "Body must include a boolean 'demo' field" };
      }

      const result = await setDemoAccount(supabase, userId, demo);
      if (!result.success) {
        app.log.error("Failed to set demo account: " + result.error);
        reply.code(502);
        return { success: false, error: "Failed to update demo status" };
      }
      return { success: true, data: { userId, isDemo: demo } };
    },
  );

  // Manually grants (tier: "pro"|"team") or clears (tier: "free") a tier for
  // any account, independent of Stripe — see adminGrants.ts/
  // 0037_admin_granted_tier.sql. Never touches that user's real
  // subscription row, if they happen to have one; "free" only removes the
  // override floor.
  app.patch<{ Params: AdminUserGrantParams; Body: AdminUserGrantBody }>(
    "/admin/users/:userId/subscription",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const { userId } = request.params;
      const tier = request.body?.tier;
      if (tier !== "free" && tier !== "pro" && tier !== "team") {
        reply.code(400);
        return { success: false, error: "Body must include tier: 'free', 'pro', or 'team'" };
      }

      const result = await setAdminGrant(
        supabase,
        userId,
        tier === "free" ? null : (tier as GrantedTier),
        request.userId!,
      );
      if (!result.success) {
        app.log.error("Failed to set admin-granted tier: " + result.error);
        reply.code(502);
        return { success: false, error: "Failed to update subscription" };
      }
      return { success: true, data: { userId, tier } };
    },
  );

  // Extends (days: a positive number) or clears (days: null) a free-tier
  // user's trial window — see trialExtensions.ts/0038_trial_extensions.sql.
  // Stacks on whichever is later, now or the account's current effective
  // trial end (including any prior extension), so repeated "+7 days"
  // clicks never shorten what's already been granted.
  app.patch<{ Params: AdminUserTrialParams; Body: AdminUserTrialBody }>(
    "/admin/users/:userId/trial",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const { userId } = request.params;
      const days = request.body?.days;

      if (days === null) {
        const result = await setTrialExtension(supabase, userId, null, request.userId!);
        if (!result.success) {
          app.log.error("Failed to clear trial extension: " + result.error);
          reply.code(502);
          return { success: false, error: "Failed to update trial" };
        }
        return { success: true, data: { userId, trialEndsAt: null } };
      }

      if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) {
        reply.code(400);
        return { success: false, error: "Body must include a positive number of 'days', or null to clear" };
      }

      const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (userError || !userResult?.user) {
        reply.code(404);
        return { success: false, error: "User not found" };
      }

      const [currentExtension, firstUploadAt] = await Promise.all([
        getTrialExtension(supabase, userId),
        getFirstUploadAt(supabase, userId),
      ]);
      const currentEndsAtMs = trialEndsAtMs(userResult.user.created_at, currentExtension, firstUploadAt);
      const baseMs = Math.max(Date.now(), currentEndsAtMs);
      const newEndsAt = new Date(baseMs + days * 86_400_000).toISOString();

      const result = await setTrialExtension(supabase, userId, newEndsAt, request.userId!);
      if (!result.success) {
        app.log.error("Failed to extend trial: " + result.error);
        reply.code(502);
        return { success: false, error: "Failed to update trial" };
      }
      return { success: true, data: { userId, trialEndsAt: newEndsAt } };
    },
  );
}
