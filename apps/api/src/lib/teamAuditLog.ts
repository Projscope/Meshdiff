import type { FastifyBaseLogger } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamAuditAction =
  | "team_created"
  | "member_invited"
  | "member_removed"
  | "member_role_changed"
  | "version_approved"
  | "version_rejected";

/**
 * Best-effort — logs the failure but never throws. The action this
 * describes has already succeeded by the time this is called; a lost
 * audit-log row shouldn't turn a successful invite/approve/etc. into a
 * failed request.
 */
export async function logTeamAudit(
  supabase: SupabaseClient,
  log: FastifyBaseLogger,
  entry: { teamId: string; actorUserId: string; action: TeamAuditAction; summary: string },
): Promise<void> {
  const { error } = await supabase.from("team_audit_log").insert({
    team_id: entry.teamId,
    actor_user_id: entry.actorUserId,
    action: entry.action,
    summary: entry.summary,
  });
  if (error) {
    log.error(error, "Failed to write team audit log entry");
  }
}
