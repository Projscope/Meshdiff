import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProjectAccess {
  /** null means no access at all — caller should 404. approver is an
   * "upgraded member": can approve/reject versions, but can't invite/remove
   * team members or do anything else admin-gated. */
  role: "owner" | "admin" | "approver" | "member" | null;
  teamId: string | null;
  /** True for the auto-seeded "Sample Project" (see seedSampleProject.ts) —
   * lets requireProjectTierAccess() admit free users to that one project. */
  isSample: boolean;
}

const NO_ACCESS: ProjectAccess = { role: null, teamId: null, isSample: false };

/**
 * Resolves a user's access to a project, accounting for team membership.
 * A project with a null team_id is "personal" (Pro) — only its owner has
 * access. A project with a team_id is "Team" — the owner plus any
 * team_members row grants access, with role reflecting approval rights
 * (see routes/versions.ts's canReviewVersions(), which accepts 'admin' or
 * 'approver' for team projects).
 */
export async function getProjectAccess(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<ProjectAccess> {
  const { data: project } = await supabase
    .from("projects")
    .select("owner_user_id, team_id, is_sample")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return NO_ACCESS;
  if (project.owner_user_id === userId) {
    return { role: "owner", teamId: project.team_id, isSample: project.is_sample };
  }
  if (!project.team_id) return NO_ACCESS;

  const { data: member } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", project.team_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member) return NO_ACCESS;
  return {
    role: member.role as "admin" | "approver" | "member",
    teamId: project.team_id,
    isSample: project.is_sample,
  };
}
