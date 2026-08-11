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

export type AccountStatus = "pro" | "trialing" | "restricted";

export interface AccountAccess {
  status: AccountStatus;
  tier: "free" | "pro";
  trialEndsAt: string | null;
  /** Ceil'd days until trial_ends_at — only set when status is "trialing". */
  trialDaysRemaining: number | null;
}

// The real access gate (see requireActiveAccess.ts): a Pro subscription
// always wins; otherwise falls back to the 7-day trial computed in
// user_trials (see migration 0013) from the user's real signup date. Note
// this "trialing" is a distinct concept from getUserTier()'s Stripe
// subscription status of the same name (a Stripe-side subscription trial,
// which this app doesn't use) — different layer entirely.
export async function getAccountAccess(supabase: SupabaseClient, userId: string): Promise<AccountAccess> {
  const { tier } = await getUserTier(supabase, userId);
  if (tier === "pro") {
    return { status: "pro", tier, trialEndsAt: null, trialDaysRemaining: null };
  }

  const { data: trial } = await supabase
    .from("user_trials")
    .select("trial_ends_at")
    .eq("user_id", userId)
    .maybeSingle();

  const trialEndsAt = trial?.trial_ends_at ?? null;
  if (trialEndsAt && new Date(trialEndsAt) > new Date()) {
    const msRemaining = new Date(trialEndsAt).getTime() - Date.now();
    return { status: "trialing", tier, trialEndsAt, trialDaysRemaining: Math.ceil(msRemaining / 86_400_000) };
  }

  return { status: "restricted", tier, trialEndsAt, trialDaysRemaining: null };
}
