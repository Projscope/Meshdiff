import type { SupabaseClient } from "@supabase/supabase-js";

type Result<T> = { success: true; data: T } | { success: false; error: string };

export async function getTrialTierChoice(supabase: SupabaseClient, userId: string): Promise<"team" | null> {
  const { data } = await supabase.from("trial_tier_choice").select("tier").eq("user_id", userId).maybeSingle();
  return data ? "team" : null;
}

/** "pro" deletes the row (the default, since a row only ever means "chose
 * Team" — see trial_tier_choice's migration comment); "team" upserts it. */
export async function setTrialTierChoice(
  supabase: SupabaseClient,
  userId: string,
  tier: "pro" | "team",
): Promise<Result<true>> {
  if (tier === "pro") {
    const { error } = await supabase.from("trial_tier_choice").delete().eq("user_id", userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  const { error } = await supabase
    .from("trial_tier_choice")
    .upsert({ user_id: userId, tier: "team", chosen_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}
