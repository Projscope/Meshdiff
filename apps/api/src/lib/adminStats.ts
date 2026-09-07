import type { SupabaseClient } from "@supabase/supabase-js";
import { INACTIVE_SUBSCRIPTION_STATUSES, computeTrialStatus } from "./subscription.js";
import { isAdminEmail } from "./requireAdmin.js";
import { getDemoUserIds } from "./demoAccounts.js";
import { getTrialExtensionsByUser } from "./trialExtensions.js";

export interface AdminStats {
  totalUsers: number;
  proUsers: number;
  conversionRate: number;
  communityShares: number;
  freeShares: number;
  proShares: number;
  /** Subscriber-type breakdown — freeUsers + trialingUsers + proSubscribers
   * + teamSubscribers always sums to totalUsers. Free/trialing are split by
   * computeTrialStatus() (the same day-math used by getAccountAccess() and
   * the admin users list), not just "no subscription row". */
  freeUsers: number;
  trialingUsers: number;
  proSubscribers: number;
  teamSubscribers: number;
}

export type SignupGranularity = "week" | "month";

export interface SignupBucket {
  periodStart: string; // ISO date — Monday for "week", the 1st for "month"
  count: number;
}

/**
 * Shared by GET /admin/users and GET /admin/stats so the two endpoints
 * can't drift on how "Pro" or the share breakdown is computed.
 */
export async function getAdminStats(
  supabase: SupabaseClient,
): Promise<{ success: true; data: AdminStats } | { success: false; error: string }> {
  const demoIdsResult = await getDemoUserIds(supabase);
  if (!demoIdsResult.success) {
    return { success: false, error: "Failed to load demo accounts" };
  }
  const demoIds = demoIdsResult.data;

  // listUsers()'s `total` is parsed from a Link response header that's only
  // present when there's more than one page for the requested perPage — a
  // perPage:1 probe reliably forces that header (as long as ≥2 users exist
  // system-wide). See apps/api/migrations/0007_get_user_id_by_email.sql's
  // comment for why there's no cheaper way to get this count. Demo accounts
  // are real auth users, so they're counted here and then subtracted —
  // demo_accounts is the only place that knows which ids to exclude.
  const totalProbe = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  const rawTotalUsers = !totalProbe.error && "total" in totalProbe.data ? totalProbe.data.total : 0;
  const totalUsers = Math.max(0, rawTotalUsers - demoIds.size);

  // Subscriber-type breakdown (Free/Trialing/Pro/Team) — needs each
  // free-tier user's created_at, which a count-only query can't give.
  // Fetches every user in one listUsers() call, same pattern (and same
  // "fine at this scale" reasoning) as getSignupBuckets() below. Also folds
  // in admin_granted_tier (see adminGrants.ts) with the same priority
  // getUserTier() applies on the real access-gating path, so this
  // breakdown — and the "pro" count derived from it below — can't drift
  // from what an account can actually do.
  const [usersResult, activeSubsResult, grantsResult] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from("subscriptions")
      .select("user_id, tier")
      .not("status", "in", `(${INACTIVE_SUBSCRIPTION_STATUSES.join(",")})`),
    supabase.from("admin_granted_tier").select("user_id, tier"),
  ]);
  if (usersResult.error) {
    return { success: false, error: "Failed to load users" };
  }
  if (activeSubsResult.error) {
    return { success: false, error: "Failed to load subscriptions" };
  }
  if (grantsResult.error) {
    return { success: false, error: "Failed to load admin-granted tiers" };
  }
  const tierByUserId = new Map(activeSubsResult.data.map((s) => [s.user_id as string, s.tier as string]));
  const grantByUserId = new Map(grantsResult.data.map((g) => [g.user_id as string, g.tier as string]));

  const trialExtensionsResult = await getTrialExtensionsByUser(
    supabase,
    usersResult.data.users.map((u) => u.id),
  );
  if (!trialExtensionsResult.success) {
    return { success: false, error: "Failed to load trial extensions" };
  }
  const trialExtensionByUserId = trialExtensionsResult.data;

  let freeUsers = 0;
  let trialingUsers = 0;
  let proSubscribers = 0;
  let teamSubscribers = 0;
  for (const u of usersResult.data.users) {
    if (demoIds.has(u.id)) continue;
    const activeTier = grantByUserId.get(u.id) ?? tierByUserId.get(u.id);
    if (isAdminEmail(u.email)) teamSubscribers++;
    else if (activeTier === "pro") proSubscribers++;
    else if (activeTier === "team") teamSubscribers++;
    else if (computeTrialStatus(u.created_at, trialExtensionByUserId.get(u.id) ?? null).isTrialing) trialingUsers++;
    else freeUsers++;
  }
  // "pro" here means "paying" for the stat card — includes Team
  // subscribers (real or admin-granted), not just tier==='pro' rows,
  // otherwise Team revenue would silently disappear from the
  // conversion-rate stat. Derived from the same breakdown above rather
  // than a second, separately-filtered count query, so the two can't
  // disagree.
  const proCount = proSubscribers + teamSubscribers;

  // Share counts by who created them, using the tier snapshotted at share
  // time (share_stats.tier_at_share — see migration 0016), not a live join:
  // null = the anonymous public Live Diff tool ("community"), 'free'/'pro'
  // = a signed-in project comparison share from an account at that tier
  // when they shared.
  const [communityShares, freeShares, proShares] = await Promise.all([
    supabase.from("share_stats").select("*", { count: "exact", head: true }).is("tier_at_share", null),
    supabase.from("share_stats").select("*", { count: "exact", head: true }).eq("tier_at_share", "free"),
    supabase.from("share_stats").select("*", { count: "exact", head: true }).eq("tier_at_share", "pro"),
  ]);
  if (communityShares.error || freeShares.error || proShares.error) {
    return { success: false, error: "Failed to count shares" };
  }

  return {
    success: true,
    data: {
      totalUsers,
      proUsers: proCount,
      conversionRate: totalUsers > 0 ? Math.round((proCount / totalUsers) * 1000) / 10 : 0,
      freeUsers,
      trialingUsers,
      proSubscribers,
      teamSubscribers,
      communityShares: communityShares.count ?? 0,
      freeShares: freeShares.count ?? 0,
      proShares: proShares.count ?? 0,
    },
  };
}

function startOfWeekUTC(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DEFAULT_PERIODS: Record<SignupGranularity, number> = { week: 8, month: 6 };

/**
 * Signups bucketed by week or month for the Dashboard's trend chart, oldest
 * first. Fetches every user in one listUsers() call rather than paginating
 * — fine at this product's current scale (dozens of users); revisit with a
 * real query if that changes.
 */
export async function getSignupBuckets(
  supabase: SupabaseClient,
  granularity: SignupGranularity,
  periods = DEFAULT_PERIODS[granularity],
): Promise<{ success: true; data: SignupBucket[] } | { success: false; error: string }> {
  const [{ data, error }, demoIdsResult] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    getDemoUserIds(supabase),
  ]);
  if (error) {
    return { success: false, error: "Failed to load users" };
  }
  if (!demoIdsResult.success) {
    return { success: false, error: "Failed to load demo accounts" };
  }
  const demoIds = demoIdsResult.data;

  const startOfPeriod = granularity === "week" ? startOfWeekUTC : startOfMonthUTC;
  const currentPeriodStart = startOfPeriod(new Date());

  const buckets: SignupBucket[] = [];
  const indexByPeriodStart = new Map<string, number>();
  for (let i = periods - 1; i >= 0; i--) {
    const periodStart = new Date(currentPeriodStart);
    if (granularity === "week") {
      periodStart.setUTCDate(periodStart.getUTCDate() - i * 7);
    } else {
      periodStart.setUTCMonth(periodStart.getUTCMonth() - i);
    }
    const key = toISODate(periodStart);
    indexByPeriodStart.set(key, buckets.length);
    buckets.push({ periodStart: key, count: 0 });
  }

  for (const u of data.users) {
    if (demoIds.has(u.id)) continue;
    const key = toISODate(startOfPeriod(new Date(u.created_at)));
    const index = indexByPeriodStart.get(key);
    if (index !== undefined) buckets[index].count += 1;
  }

  return { success: true, data: buckets };
}
