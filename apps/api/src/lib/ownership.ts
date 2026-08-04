import type { SupabaseClient } from "@supabase/supabase-js";

/** True if the project exists and is owned by userId. Used before every mutation/read that scopes to a project. */
export async function isProjectOwner(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  return data !== null;
}
