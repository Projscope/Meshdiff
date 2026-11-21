import type { SupabaseClient } from "@supabase/supabase-js";

export interface StableVersionRow {
  id: string;
  version_number: number;
  file_name: string;
  /** null for a local version (kept on the owner's computer). */
  file_path: string | null;
  storage_mode?: "cloud" | "local";
  content_sha256?: string | null;
  approval_status: string;
}

/**
 * Resolves the version that sharing/export should default to: the highest
 * version_number with approval_status = 'approved'. Falls back to the
 * latest version of any status when nothing has been approved yet (a
 * brand-new Team project needs *something* to point to) — see plan
 * "Stable-version resolution". Personal (Pro) projects effectively always
 * resolve to the latest version, since finalize() auto-approves there.
 */
export async function getStableVersion(
  supabase: SupabaseClient,
  projectId: string,
): Promise<StableVersionRow | null> {
  const { data: approved } = await supabase
    .from("versions")
    .select("id, version_number, file_name, file_path, storage_mode, content_sha256, approval_status")
    .eq("project_id", projectId)
    .eq("approval_status", "approved")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (approved) return approved as StableVersionRow;

  const { data: latest } = await supabase
    .from("versions")
    .select("id, version_number, file_name, file_path, storage_mode, content_sha256, approval_status")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (latest as StableVersionRow | null) ?? null;
}
