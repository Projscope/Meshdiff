import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "./requireAdmin.js";
import { getTrialExtension } from "./trialExtensions.js";
import { getTrialTierChoice } from "./trialTierChoice.js";

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
  /** true when `tier` came from a free-tier trial user's own Team-trial
   * choice (see trialTierChoice.ts / TrialTierChoiceModal.tsx), not a real
   * subscription or admin grant. Callers that care whether this is a real
   * paying tier (e.g. getAccountAccess()'s trial-day-count logic) can't
   * just treat this the same as a real 'team' tier. */
  viaTrialChoice?: boolean;
}

// Any status in this list means "not actually paying" despite a row
// existing — exported so callers needing the same rule in bulk (e.g. the
// admin users list's per-row isPro flag) don't redefine it separately.
export const INACTIVE_SUBSCRIPTION_STATUSES = ["canceled", "past_due"];

/** Lets a caller that already has the trial inputs (getAccountAccess()
 * below) hand them to getUserTier() instead of forcing a second
 * auth.admin.getUserById()/getTrialExtension() round trip. */
export interface TrialContext {
  createdAt: string | null | undefined;
  overrideEndsAt?: string | null;
}

// Single source of truth for "what tier is this user" — used by GET
// /billing/subscription today, and reusable by any future gating without
// duplicating the active/trialing check.
export async function getUserTier(supabase: SupabaseClient, userId: string, trial?: TrialContext): Promise<UserTier> {
  // An admin-granted tier (see adminGrants.ts, set from the Admin Users
  // page) takes priority over — and needs no — a real Stripe row. `row` is
  // null here since there's no actual subscription backing it; every
  // caller already treats a null row as "no billing details to show",
  // which is exactly right for a manual grant.
  const { data: grant } = await supabase
    .from("admin_granted_tier")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  if (grant) {
    return { tier: grant.tier as "pro" | "team", row: null };
  }

  const { data } = await supabase
    .from("subscriptions")
    .select("tier, status, current_period_end, cancel_at_period_end, quantity")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) {
    // Treat any non-canceled, non-past_due status as active — includes:
    // - active: paid and active
    // - trialing: in trial period
    // - incomplete: awaiting payment (user just checked out)
    // - incomplete_expired: payment failed but can retry
    if (!INACTIVE_SUBSCRIPTION_STATUSES.includes(data.status)) {
      return { tier: data.tier, row: data as SubscriptionRow };
    }
  }

  // Free tier so far (no admin grant, no active subscription) — while
  // trialing, the user may have chosen to trial Team instead of the
  // default Pro-level access (TrialTierChoiceModal.tsx). That choice never
  // creates a real subscription row, so `row` stays null exactly like
  // every other free-tier case here.
  let trialContext = trial;
  if (!trialContext) {
    const { data: userResult } = await supabase.auth.admin.getUserById(userId);
    trialContext = { createdAt: userResult?.user?.created_at, overrideEndsAt: await getTrialExtension(supabase, userId) };
  }
  if (computeTrialStatus(trialContext.createdAt, trialContext.overrideEndsAt).isTrialing) {
    const choice = await getTrialTierChoice(supabase, userId);
    if (choice === "team") {
      return { tier: "team", row: null, viaTrialChoice: true };
    }
  }

  return { tier: "free", row: null };
}

export type AccountStatus = "pro" | "restricted";

export const TRIAL_DAYS = 14;

export interface TrialStatus {
  isTrialing: boolean;
  trialDaysRemaining: number | null;
}

/** Pure day-math, factored out so getAccountAccess() and the admin users
 * list (which already has each row's auth.users.created_at from
 * listUsers(), no extra lookup needed) can't drift on the trial window.
 *
 * `overrideEndsAt` — an admin-set trial_extensions row (see
 * trialExtensions.ts) — replaces the default created_at + 14 days end date
 * verbatim when present, in either direction (it can extend or shorten).
 * Omitted/null falls back to the original default-only behavior. */
export function computeTrialStatus(createdAt: string | null | undefined, overrideEndsAt?: string | null): TrialStatus {
  const defaultEndsAtMs = createdAt ? new Date(createdAt).getTime() + TRIAL_DAYS * 86_400_000 : -Infinity;
  const endsAtMs = overrideEndsAt ? new Date(overrideEndsAt).getTime() : defaultEndsAtMs;
  const msRemaining = endsAtMs - Date.now();
  if (msRemaining > 0) {
    return { isTrialing: true, trialDaysRemaining: Math.ceil(msRemaining / 86_400_000) };
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
  const { tier, viaTrialChoice } = await getUserTier(supabase, userId);
  // A real subscription or admin grant — never trial-gated, no extra
  // lookups needed. A trial-tier choice also returns tier!=='free' here,
  // but isn't a real paid tier, so it falls through to the trial
  // computation below instead (it still needs isTrialing/
  // trialDaysRemaining populated correctly for the UI).
  if (tier !== "free" && !viaTrialChoice) {
    return { status: "pro", tier, viaTeamMembership: false, isTrialing: false, trialDaysRemaining: null };
  }

  const { data: userResult } = await supabase.auth.admin.getUserById(userId);

  // Admin accounts (ADMIN_EMAILS) always have full, permanent access —
  // never restricted, never trial-gated, with or without a subscription
  // of their own.
  if (isAdminEmail(userResult?.user?.email)) {
    return { status: "pro", tier: "team", viaTeamMembership: false, isTrialing: false, trialDaysRemaining: null };
  }

  const trialOverride = await getTrialExtension(supabase, userId);
  const trial = computeTrialStatus(userResult?.user?.created_at, trialOverride);
  if (trial.isTrialing) {
    return { status: "pro", tier, viaTeamMembership: false, ...trial };
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
