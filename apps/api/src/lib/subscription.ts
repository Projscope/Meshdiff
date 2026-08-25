import type { SupabaseClient } from "@supabase/supabase-js";

export interface SubscriptionRow {
  tier: "pro" | "team";
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  quantity: number;
}

export interface UserTier {
  tier: "free" | "pro" | "team";
  row: SubscriptionRow | null;
}

// Any status in this list means "not actually paying" despite a row
// existing — exported so callers needing the same rule in bulk (e.g. the
// admin users list's per-row isPro flag) don't redefine it separately.
export const INACTIVE_SUBSCRIPTION_STATUSES = ["canceled", "past_due"];

// Single source of truth for "what tier is this user" — used by GET
// /billing/subscription today, and reusable by any future gating without
// duplicating the active/trialing check.
export async function getUserTier(supabase: SupabaseClient, userId: string): Promise<UserTier> {
  const { data } = await supabase
    .from("subscriptions")
    .select("tier, status, current_period_end, cancel_at_period_end, quantity")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return { tier: "free", row: null };
  }

  // Treat any non-canceled, non-past_due status as active — includes:
  // - active: paid and active
  // - trialing: in trial period
  // - incomplete: awaiting payment (user just checked out)
  // - incomplete_expired: payment failed but can retry
  if (INACTIVE_SUBSCRIPTION_STATUSES.includes(data.status)) {
    return { tier: "free", row: null };
  }

  return { tier: data.tier, row: data as SubscriptionRow };
}

export type AccountStatus = "pro" | "restricted";

const TRIAL_DAYS = 14;

export interface TrialStatus {
  isTrialing: boolean;
  trialDaysRemaining: number | null;
}

/** Pure day-math, factored out so getAccountAccess() and the admin users
 * list (which already has each row's auth.users.created_at from
 * listUsers(), no extra lookup needed) can't drift on the trial window. */
export function computeTrialStatus(createdAt: string | null | undefined): TrialStatus {
  const daysSinceSignup = createdAt ? (Date.now() - new Date(createdAt).getTime()) / 86_400_000 : Infinity;
  if (daysSinceSignup < TRIAL_DAYS) {
    return { isTrialing: true, trialDaysRemaining: Math.ceil(TRIAL_DAYS - daysSinceSignup) };
  }
  return { isTrialing: false, trialDaysRemaining: null };
}

export interface AccountAccess {
  status: AccountStatus;
  tier: "free" | "pro" | "team";
  /** true when access is granted via someone else's active Team
   * subscription (this user has no paid row of their own). Lets callers
   * that care (e.g. UI messaging) distinguish "you're paying" from
   * "you're riding your team owner's plan" without a second round trip. */
  viaTeamMembership: boolean;
  /** true for the first TRIAL_DAYS after signup, for a free-tier user with
   * no subscription of their own — see the 14-day trial note below. */
  isTrialing: boolean;
  /** Whole days left in the trial window, or null when not trialing. */
  trialDaysRemaining: number | null;
}

// The real access gate (see requireActiveAccess.ts). A free-tier user gets
// full ("pro") access for their first 14 days after signup — computed on
// the fly from auth.users.created_at, not a separate table (this project
// tried a user_trials table + trigger once, in 20260101000013_user_trials.sql,
// removed in 20260101000014_remove_trial.sql; computing from created_at
// avoids reintroducing that table and needs no backfill — an existing
// free user's created_at is already >14 days old, so they're unaffected).
// After the window, they fall through to the existing restricted/
// team-membership check exactly as before.
export async function getAccountAccess(supabase: SupabaseClient, userId: string): Promise<AccountAccess> {
  const { tier } = await getUserTier(supabase, userId);
  if (tier !== "free") {
    return { status: "pro", tier, viaTeamMembership: false, isTrialing: false, trialDaysRemaining: null };
  }

  const { data: userResult } = await supabase.auth.admin.getUserById(userId);
  const trial = computeTrialStatus(userResult?.user?.created_at);
  if (trial.isTrialing) {
    return { status: "pro", tier: "free", viaTeamMembership: false, ...trial };
  }

  const { data: hasTeamAccess } = await supabase.rpc("has_active_team_access", { p_user_id: userId });
  return {
    status: hasTeamAccess ? "pro" : "restricted",
    tier: "free",
    viaTeamMembership: !!hasTeamAccess,
    isTrialing: false,
    trialDaysRemaining: null,
  };
}
