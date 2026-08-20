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

export interface AccountAccess {
  status: AccountStatus;
  tier: "free" | "pro" | "team";
  /** true when access is granted via someone else's active Team
   * subscription (this user has no paid row of their own). Lets callers
   * that care (e.g. UI messaging) distinguish "you're paying" from
   * "you're riding your team owner's plan" without a second round trip. */
  viaTeamMembership: boolean;
}

// The real access gate (see requireActiveAccess.ts): Pro/Team are payable
// from day one — no trial. A user's own subscription is checked first
// (cheap, one query, same as before); only for a free-tier user do we pay
// for the extra RPC that checks team-owner-derived access — Pro/Team users
// (and non-team-members) never touch it.
export async function getAccountAccess(supabase: SupabaseClient, userId: string): Promise<AccountAccess> {
  const { tier } = await getUserTier(supabase, userId);
  if (tier !== "free") {
    return { status: "pro", tier, viaTeamMembership: false };
  }

  const { data: hasTeamAccess } = await supabase.rpc("has_active_team_access", { p_user_id: userId });
  return {
    status: hasTeamAccess ? "pro" : "restricted",
    tier: "free",
    viaTeamMembership: !!hasTeamAccess,
  };
}
