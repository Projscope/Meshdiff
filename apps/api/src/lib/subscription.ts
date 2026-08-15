import type { SupabaseClient } from "@supabase/supabase-js";

export interface SubscriptionRow {
  tier: "pro";
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

export interface UserTier {
  tier: "free" | "pro";
  row: SubscriptionRow | null;
}

// Single source of truth for "is this user Pro" — used by GET
// /billing/subscription today, and reusable by any future gating without
// duplicating the active/trialing check.
export async function getUserTier(supabase: SupabaseClient, userId: string): Promise<UserTier> {
  const { data } = await supabase
    .from("subscriptions")
    .select("tier, status, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return { tier: "free", row: null };
  }

  // Treat any non-canceled, non-past_due status as "pro" — includes:
  // - active: paid and active
  // - trialing: in trial period
  // - incomplete: awaiting payment (user just checked out)
  // - incomplete_expired: payment failed but can retry
  const inactiveStatuses = ["canceled", "past_due"];
  if (inactiveStatuses.includes(data.status)) {
    return { tier: "free", row: null };
  }

  return { tier: "pro", row: data as SubscriptionRow };
}

export type AccountStatus = "pro" | "restricted";

export interface AccountAccess {
  status: AccountStatus;
  tier: "free" | "pro";
}

// The real access gate (see requireActiveAccess.ts): Pro is payable from
// day one — no trial — so this is just getUserTier() reshaped into the
// status vocabulary requireActiveAccess checks against.
export async function getAccountAccess(supabase: SupabaseClient, userId: string): Promise<AccountAccess> {
  const { tier } = await getUserTier(supabase, userId);
  return { status: tier === "pro" ? "pro" : "restricted", tier };
}
