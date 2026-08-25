import type { SupabaseClient } from "@supabase/supabase-js";

type Result<T> = { success: true; data: T } | { success: false; error: string };

/** All user_ids currently flagged as a demo account (see
 * 20260101000025_demo_accounts.sql) — existence in demo_accounts is the
 * flag, no boolean column to keep in sync. Used to exclude these accounts
 * from the admin user-count widgets (getAdminStats/getSignupBuckets). */
export async function getDemoUserIds(supabase: SupabaseClient): Promise<Result<Set<string>>> {
  const { data, error } = await supabase.from("demo_accounts").select("user_id");
  if (error) return { success: false, error: error.message };
  return { success: true, data: new Set((data as Array<{ user_id: string }>).map((r) => r.user_id)) };
}

export async function setDemoAccount(
  supabase: SupabaseClient,
  userId: string,
  isDemo: boolean,
): Promise<Result<void>> {
  if (isDemo) {
    const { error } = await supabase.from("demo_accounts").upsert({ user_id: userId });
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase.from("demo_accounts").delete().eq("user_id", userId);
    if (error) return { success: false, error: error.message };
  }
  return { success: true, data: undefined };
}
