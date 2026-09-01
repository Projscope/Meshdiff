import type { FastifyBaseLogger } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Best-effort — logs the failure but never throws, same convention as
 * logTeamAudit(). The action this describes (a version transition, a
 * mention, etc.) has already succeeded by the time this is called; a lost
 * notification shouldn't turn that into a failed request.
 *
 * In-app only for this milestone — no email delivery. email_sent_at is
 * reserved on the table for adding it later without another migration.
 */
async function insertNotification(
  supabase: SupabaseClient,
  log: FastifyBaseLogger,
  entry: {
    recipientUserId: string;
    actorUserId: string | null;
    type:
      | "mention"
      | "comment_assigned"
      | "version_state_changed"
      | "review_requested"
      | "gate_completed"
      | "comment_status_changed";
    projectId: string;
    versionId?: string | null;
    commentId?: string | null;
    summary: string;
  },
): Promise<void> {
  // A user can generate their own notification (e.g. self-approving a
  // version they also uploaded) — that's just noise, not something worth
  // surfacing in their own inbox.
  if (entry.recipientUserId === entry.actorUserId) return;

  const { error } = await supabase.from("notifications").insert({
    recipient_user_id: entry.recipientUserId,
    actor_user_id: entry.actorUserId,
    type: entry.type,
    project_id: entry.projectId,
    version_id: entry.versionId ?? null,
    comment_id: entry.commentId ?? null,
    summary: entry.summary,
  });
  if (error) log.error(error, "Failed to write notification");
}

/** Notifies the uploader (and, when moving into in_review, every project
 * reviewer) that a version's review state changed. `recipientUserIds` is
 * resolved by the caller (versions.ts) since who counts as "the uploader"
 * or "a reviewer" depends on project/team data this module doesn't fetch. */
export async function notifyVersionStateChanged(
  supabase: SupabaseClient,
  log: FastifyBaseLogger,
  params: {
    recipientUserIds: string[];
    actorUserId: string;
    projectId: string;
    versionId: string;
    summary: string;
  },
): Promise<void> {
  for (const recipientUserId of new Set(params.recipientUserIds)) {
    await insertNotification(supabase, log, {
      recipientUserId,
      actorUserId: params.actorUserId,
      type: "version_state_changed",
      projectId: params.projectId,
      versionId: params.versionId,
      summary: params.summary,
    });
  }
}

export async function notifyMention(
  supabase: SupabaseClient,
  log: FastifyBaseLogger,
  params: {
    recipientUserId: string;
    actorUserId: string;
    projectId: string;
    versionId: string;
    commentId: string;
    summary: string;
  },
): Promise<void> {
  await insertNotification(supabase, log, {
    recipientUserId: params.recipientUserId,
    actorUserId: params.actorUserId,
    type: "mention",
    projectId: params.projectId,
    versionId: params.versionId,
    commentId: params.commentId,
    summary: params.summary,
  });
}

export async function notifyCommentAssigned(
  supabase: SupabaseClient,
  log: FastifyBaseLogger,
  params: {
    recipientUserId: string;
    actorUserId: string;
    projectId: string;
    versionId: string;
    commentId: string;
    summary: string;
  },
): Promise<void> {
  await insertNotification(supabase, log, {
    recipientUserId: params.recipientUserId,
    actorUserId: params.actorUserId,
    type: "comment_assigned",
    projectId: params.projectId,
    versionId: params.versionId,
    commentId: params.commentId,
    summary: params.summary,
  });
}

/** Sent to whoever is invested in a comment thread (its author and current
 * assignee, if any) when its status changes — resolved or reopened. Fans
 * out to a set of recipients like notifyGateCompleted, since a comment can
 * have both an author and a separate assignee. */
export async function notifyCommentStatusChanged(
  supabase: SupabaseClient,
  log: FastifyBaseLogger,
  params: {
    recipientUserIds: string[];
    actorUserId: string;
    projectId: string;
    versionId: string;
    commentId: string;
    summary: string;
  },
): Promise<void> {
  for (const recipientUserId of new Set(params.recipientUserIds)) {
    await insertNotification(supabase, log, {
      recipientUserId,
      actorUserId: params.actorUserId,
      type: "comment_status_changed",
      projectId: params.projectId,
      versionId: params.versionId,
      commentId: params.commentId,
      summary: params.summary,
    });
  }
}

/** Sent to reviewers (admin/approver) when the last unmet gate on a version
 * is checked off — the version is now approvable, which a reviewer would
 * otherwise only discover by re-checking the checklist themselves. */
export async function notifyGateCompleted(
  supabase: SupabaseClient,
  log: FastifyBaseLogger,
  params: {
    recipientUserIds: string[];
    actorUserId: string;
    projectId: string;
    versionId: string;
    summary: string;
  },
): Promise<void> {
  for (const recipientUserId of new Set(params.recipientUserIds)) {
    await insertNotification(supabase, log, {
      recipientUserId,
      actorUserId: params.actorUserId,
      type: "gate_completed",
      projectId: params.projectId,
      versionId: params.versionId,
      summary: params.summary,
    });
  }
}
