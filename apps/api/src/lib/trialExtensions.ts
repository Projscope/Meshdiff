import type { SupabaseClient } from "@supabase/supabase-js";

type Result<T> = { success: true; data: T } | { success: false; error: string };

/** Bulk lookup for the admin users list — one query instead of one per row. */
export async function getTrialExtensionsByUser(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Result<Map<string, string>>> {
  if (userIds.length === 0) return { success: true, data: new Map() };
  const { data, error } = await supabase
    .from("trial_extensions")
    .select("user_id, trial_ends_at")
    .in("user_id", userIds);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: new Map((data as Array<{ user_id: string; trial_ends_at: string }>).map((r) => [r.user_id, r.trial_ends_at])),
  };
}

export async function getTrialExtension(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("trial_extensions")
    .select("trial_ends_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.trial_ends_at as string | undefined) ?? null;
}

/** trialEndsAt: null clears the extension, reverting to the default
 * created_at + 14 days computation. */
export async function setTrialExtension(
  supabase: SupabaseClient,
  userId: string,
  trialEndsAt: string | null,
  grantedByUserId: string,
): Promise<Result<true>> {
  if (trialEndsAt === null) {
    const { error } = await supabase.from("trial_extensions").delete().eq("user_id", userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  const { error } = await supabase
    .from("trial_extensions")
    .upsert(
      { user_id: userId, trial_ends_at: trialEndsAt, granted_by_user_id: grantedByUserId, granted_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}
