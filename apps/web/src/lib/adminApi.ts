import { request, type Result } from "./projectsApi";

export interface AdminUserRow {
  id: string;
  email: string | null;
  signupDate: string;
  lastSignInAt: string | null;
  tier: "free" | "pro" | "team";
  status: string | null;
  currentPeriodEnd: string | null;
  /** true for the first 14 days after a free signup — see
   * computeTrialStatus() in apps/api/src/lib/subscription.ts. */
  isTrialing: boolean;
  trialDaysRemaining: number | null;
  /** Flagged by an admin as a demo/test/showcase account — excluded from
   * the stat widgets and signups chart, no effect on the account itself.
   * See setUserDemoStatus() and apps/api/src/lib/demoAccounts.ts. */
  isDemo: boolean;
}

export interface AdminStats {
  totalUsers: number;
  proUsers: number;
  conversionRate: number;
  /** Subscriber-type breakdown — always sums to totalUsers. Free/trialing
   * split uses the same day-math as computeTrialStatus() on the backend. */
  freeUsers: number;
  trialingUsers: number;
  proSubscribers: number;
  teamSubscribers: number;
  communityShares: number;
  freeShares: number;
  proShares: number;
}

export interface AdminUsersPage {
  users: AdminUserRow[];
  total: number;
  stats: AdminStats;
}

export type SignupGranularity = "week" | "month";

export interface SignupBucket {
  periodStart: string;
  count: number;
}

export interface AdminDashboard {
  stats: AdminStats;
  signups: SignupBucket[];
}

export function listAdminUsers(page = 1): Promise<Result<AdminUsersPage>> {
  return request(`/admin/users?page=${page}`);
}

export function setUserDemoStatus(userId: string, isDemo: boolean): Promise<Result<{ userId: string; isDemo: boolean }>> {
  return request(`/admin/users/${userId}/demo`, { method: "PATCH", body: JSON.stringify({ demo: isDemo }) });
}

export function getAdminDashboard(granularity: SignupGranularity = "week"): Promise<Result<AdminDashboard>> {
  return request(`/admin/stats?granularity=${granularity}`);
}

export type AnalyticsGranularity = "day" | "week" | "month";

export interface AnalyticsTrendPoint {
  date: string;
  pageviews: number;
  visitors: number;
}

export interface AnalyticsBreakdownEntry {
  value: string;
  count: number;
  /** This value's contribution to `count` from today (UTC) alone. */
  todayCount: number;
}

export interface AnalyticsSummary {
  totalPageviews: number;
  totalUniqueVisitors: number;
  todayPageviews: number;
  todayUniqueVisitors: number;
  dailyTrend: AnalyticsTrendPoint[];
  topPages: AnalyticsBreakdownEntry[];
  topCountries: AnalyticsBreakdownEntry[];
  topLanguages: AnalyticsBreakdownEntry[];
  topReferrers: AnalyticsBreakdownEntry[];
  topDevices: AnalyticsBreakdownEntry[];
}

/** Self-hosted, cookie-less pageview analytics — see
 * netlify/functions/track.mts (write side) and CLAUDE.md/the analytics
 * plan. `from`/`to` are YYYY-MM-DD; defaults to the last 30 days. */
export function getAdminAnalytics(
  from?: string,
  to?: string,
  granularity?: AnalyticsGranularity,
): Promise<Result<AnalyticsSummary>> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (granularity) params.set("granularity", granularity);
  const query = params.toString();
  return request(`/admin/analytics${query ? `?${query}` : ""}`);
}
