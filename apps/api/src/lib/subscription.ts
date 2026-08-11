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

  if (!data || (data.status !== "active" && data.status !== "trialing")) {
    return { tier: "free", row: null };
  }
  return { tier: "pro", row: data as SubscriptionRow };
}
