import type { SupabaseClient } from "@supabase/supabase-js";

type Result<T> = { success: true; data: T } | { success: false; error: string };

/** Bulk lookup for the admin users list/stats — one query instead of one per row. */
export async function getFirstUploadsByUser(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Result<Map<string, string>>> {
  if (userIds.length === 0) return { success: true, data: new Map() };
  const { data, error } = await supabase
    .from("first_user_uploads")
    .select("user_id, first_upload_at")
    .in("user_id", userIds);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: new Map(
      (data as Array<{ user_id: string; first_upload_at: string }>).map((r) => [r.user_id, r.first_upload_at]),
    ),
  };
}

/** When this user first uploaded a model of their own (the auto-seeded
 * Sample Project doesn't count), or null if they haven't yet. Fails open to
 * null like getTrialExtension() — the trial then just stays in its
 * not-yet-started state rather than blocking the request. */
export async function getFirstUploadAt(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("first_user_uploads")
    .select("first_upload_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.first_upload_at as string | undefined) ?? null;
}
