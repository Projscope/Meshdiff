import type { SupabaseClient } from "@supabase/supabase-js";

type Result<T> = { success: true; data: T } | { success: false; error: string };

export type GrantedTier = "pro" | "team";

/** Bulk lookup for the admin users list — one query instead of one per row. */
export async function getAdminGrantsByUser(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Result<Map<string, GrantedTier>>> {
  if (userIds.length === 0) return { success: true, data: new Map() };
  const { data, error } = await supabase.from("admin_granted_tier").select("user_id, tier").in("user_id", userIds);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: new Map((data as Array<{ user_id: string; tier: GrantedTier }>).map((r) => [r.user_id, r.tier])),
  };
}

/** Sets (tier: "pro"|"team") or clears (tier: null) the manual grant for one
 * user — clearing just removes the floor, it never touches that user's real
 * Stripe subscription if they happen to have one. */
export async function setAdminGrant(
  supabase: SupabaseClient,
  userId: string,
  tier: GrantedTier | null,
  grantedByUserId: string,
): Promise<Result<true>> {
  if (tier === null) {
    const { error } = await supabase.from("admin_granted_tier").delete().eq("user_id", userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  const { error } = await supabase
    .from("admin_granted_tier")
    .upsert(
      { user_id: userId, tier, granted_by_user_id: grantedByUserId, granted_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}
