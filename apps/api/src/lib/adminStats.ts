import type { SupabaseClient } from "@supabase/supabase-js";
import { INACTIVE_SUBSCRIPTION_STATUSES, computeTrialStatus } from "./subscription.js";
import { isAdminEmail } from "./requireAdmin.js";

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
  // listUsers()'s `total` is parsed from a Link response header that's only
  // present when there's more than one page for the requested perPage — a
  // perPage:1 probe reliably forces that header (as long as ≥2 users exist
  // system-wide). See apps/api/migrations/0007_get_user_id_by_email.sql's
  // comment for why there's no cheaper way to get this count.
  const totalProbe = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  const totalUsers = !totalProbe.error && "total" in totalProbe.data ? totalProbe.data.total : 0;

  // "pro" here means "paying" for the stat card — includes Team
  // subscribers, not just tier==='pro' rows, otherwise Team revenue would
  // silently disappear from the conversion-rate stat.
  const { count: proCount, error: proCountError } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .in("tier", ["pro", "team"])
    .not("status", "in", `(${INACTIVE_SUBSCRIPTION_STATUSES.join(",")})`);
  if (proCountError) {
    return { success: false, error: "Failed to count pro subscriptions" };
  }

  // Subscriber-type breakdown (Free/Trialing/Pro/Team) — needs each
  // free-tier user's created_at, which a count-only query can't give.
  // Fetches every user in one listUsers() call, same pattern (and same
  // "fine at this scale" reasoning) as getSignupBuckets() below.
  const [usersResult, activeSubsResult] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from("subscriptions")
      .select("user_id, tier")
      .not("status", "in", `(${INACTIVE_SUBSCRIPTION_STATUSES.join(",")})`),
  ]);
  if (usersResult.error) {
    return { success: false, error: "Failed to load users" };
  }
  if (activeSubsResult.error) {
    return { success: false, error: "Failed to load subscriptions" };
  }
  const tierByUserId = new Map(activeSubsResult.data.map((s) => [s.user_id as string, s.tier as string]));

  let freeUsers = 0;
  let trialingUsers = 0;
  let proSubscribers = 0;
  let teamSubscribers = 0;
  for (const u of usersResult.data.users) {
    const activeTier = tierByUserId.get(u.id);
    if (isAdminEmail(u.email)) teamSubscribers++;
    else if (activeTier === "pro") proSubscribers++;
    else if (activeTier === "team") teamSubscribers++;
    else if (computeTrialStatus(u.created_at).isTrialing) trialingUsers++;
    else freeUsers++;
  }

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
      proUsers: proCount ?? 0,
      conversionRate: totalUsers > 0 ? Math.round(((proCount ?? 0) / totalUsers) * 1000) / 10 : 0,
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
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    return { success: false, error: "Failed to load users" };
  }

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
    const key = toISODate(startOfPeriod(new Date(u.created_at)));
    const index = indexByPeriodStart.get(key);
    if (index !== undefined) buckets[index].count += 1;
  }

  return { success: true, data: buckets };
}
