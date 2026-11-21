import { request, type Result } from "./projectsApi";

export interface AdminUserRow {
  id: string;
  email: string | null;
  signupDate: string;
  lastSignInAt: string | null;
  /** Last time this user used the app (any authenticated API call), from
   * user_activity. Unlike lastSignInAt it also moves when a saved session
   * returns. null = not seen since tracking began. */
  lastSeenAt: string | null;
  tier: "free" | "pro" | "team";
  status: string | null;
  currentPeriodEnd: string | null;
  /** true for the first 14 days after a free signup — see
   * computeTrialStatus() in apps/api/src/lib/subscription.ts. */
  isTrialing: boolean;
  trialDaysRemaining: number | null;
  /** false while the user hasn't uploaded yet (and has no admin override). */
  trialClockStarted: boolean;
  /** Flagged by an admin as a demo/test/showcase account — excluded from
   * the stat widgets and signups chart, no effect on the account itself.
   * See setUserDemoStatus() and apps/api/src/lib/demoAccounts.ts. */
  isDemo: boolean;
  /** ADMIN_EMAILS account — already has permanent Pro/Team access
   * regardless of subscription state, so the tier selector is disabled for
   * these rows (setting a grant here would be a no-op). */
  isAdmin: boolean;
  /** Manually granted via the selector below (see adminGrants.ts) —
   * distinct from `tier`/`status`, which already reflect the grant when one
   * exists (same precedence the real access check applies). null when this
   * account's tier comes from an actual Stripe subscription (or nothing). */
  adminGrantedTier: "pro" | "team" | null;
  /** Admin-set trial end date (ISO), if any — see trialExtensions.ts.
   * `isTrialing`/`trialDaysRemaining` above already reflect it; this is
   * just here so the UI can show an "extended" hint. null when the trial
   * (if any) is on the default created_at + 14 days schedule. */
  trialExtendedTo: string | null;
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

/** "free" clears any existing grant — it never cancels a real Stripe
 * subscription, just removes the manual floor. See adminGrants.ts. */
export function setUserGrantedTier(
  userId: string,
  tier: "free" | "pro" | "team",
): Promise<Result<{ userId: string; tier: string }>> {
  return request(`/admin/users/${userId}/subscription`, { method: "PATCH", body: JSON.stringify({ tier }) });
}

/** Extends this user's trial by `days` from whichever is later, now or
 * their current effective trial end — never shortens it, and stacks with
 * any prior extension. Pass `null` to clear the extension outright and
 * revert to the default created_at + 14 days schedule. See
 * trialExtensions.ts. */
export function extendUserTrial(
  userId: string,
  days: number | null,
): Promise<Result<{ userId: string; trialEndsAt: string | null }>> {
  return request(`/admin/users/${userId}/trial`, { method: "PATCH", body: JSON.stringify({ days }) });
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
  topBrowsers: AnalyticsBreakdownEntry[];
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

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** 0..1 of everyone who signed up. */
  shareOfSignups: number;
  /** 0..1 of the previous step; null for the first. */
  shareOfPrevious: number | null;
}

export type FunnelTrialState = "paying" | "trialing" | "trialing_not_started" | "ended";

export interface FunnelUserRow {
  id: string;
  email: string | null;
  signedUp: string;
  trial: FunnelTrialState;
  daysLeft: number | null;
  uploads: number;
  /** Uploaded something, but only the sample-gear files from the button. */
  sampleOnly: boolean;
  comments: number;
  shares: number;
  paywallViews: number;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
}

export interface AdminFunnel {
  generatedAt: string;
  steps: FunnelStep[];
  paying: { count: number; shareOfSignups: number };
  /** Counts events recorded since tracking began — they understate earlier behaviour. */
  tracked: {
    since: string | null;
    activeLast7d: number;
    paywallViewers: number;
    sharers: number;
    proFeatureUsers: number;
  };
  rows: FunnelUserRow[];
  rowsTruncated: boolean;
}

/** Where signups drop off plus a per-user activity table — see
 * apps/api/src/lib/adminFunnel.ts. Excludes demo accounts and admins. */
export function getAdminFunnel(): Promise<Result<AdminFunnel>> {
  return request("/admin/funnel");
}
