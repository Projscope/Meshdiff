import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../lib/requireAuth.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { getProjectAccess } from "../lib/ownership.js";
import { requireProjectWriteAccess } from "../lib/requireProjectTierAccess.js";
import { notifyMention, notifyCommentAssigned, notifyCommentStatusChanged } from "../lib/notify.js";

export type CommentStatus = "open" | "resolved" | "reopened";
export type CommentPriority = "low" | "normal" | "high";

interface CommentRow {
  id: string;
  version_id: string;
  author_user_id: string | null;
  parent_comment_id: string | null;
  body: string;
  position_x: number;
  position_y: number;
  position_z: number;
  normal_x: number | null;
  normal_y: number | null;
  normal_z: number | null;
  status: CommentStatus;
  assignee_user_id: string | null;
  priority: CommentPriority | null;
  status_changed_by_user_id: string | null;
  status_changed_at: string | null;
  created_at: string;
}

interface CreateCommentBody {
  body?: string;
  position?: [number, number, number];
  normal?: [number, number, number];
  parentCommentId?: string;
  assigneeUserId?: string;
  priority?: CommentPriority;
}

interface UpdateCommentBody {
  status?: CommentStatus;
  assigneeUserId?: string | null;
  priority?: CommentPriority | null;
}

function toCommentSummary(row: CommentRow, emailByUserId: Map<string, string>) {
  return {
    id: row.id,
    authorUserId: row.author_user_id,
    authorEmail: row.author_user_id ? (emailByUserId.get(row.author_user_id) ?? null) : null,
    parentCommentId: row.parent_comment_id,
    body: row.body,
    position: [row.position_x, row.position_y, row.position_z] as [number, number, number],
    normal:
      row.normal_x !== null && row.normal_y !== null && row.normal_z !== null
        ? ([row.normal_x, row.normal_y, row.normal_z] as [number, number, number])
        : null,
    status: row.status,
    assigneeUserId: row.assignee_user_id,
    assigneeEmail: row.assignee_user_id ? (emailByUserId.get(row.assignee_user_id) ?? null) : null,
    priority: row.priority,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
  };
}

async function resolveEmails(
  supabase: SupabaseClient,
  log: FastifyBaseLogger,
  userIds: (string | null)[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter((id): id is string => !!id))];
  if (uniqueIds.length === 0) return new Map();
  const { data: emailRows, error } = await supabase.rpc("get_user_emails_by_ids", { p_ids: uniqueIds });
  if (error) {
    log.warn(error, "Failed to resolve comment user emails");
    return new Map();
  }
  return new Map((emailRows ?? []).map((r: { id: string; email: string }) => [r.id, r.email]));
}

// Owner/admin can moderate any comment on the project; anyone else is
// limited to their own (delete) or to status/assignment they're party to
// (PATCH, see below).
function canModerateAny(access: { role: string | null }): boolean {
  return access.role === "owner" || access.role === "admin";
}

const MENTION_PATTERN = /@([\w.+-]+@[\w.-]+\.\w+)/g;

/** "ProjectName (v3)" for the notification summary — best-effort, so a
 * lookup failure degrades to a generic summary rather than blocking the
 * comment/mention itself (same "never throw" convention as notify.ts). */
async function describeVersionLocation(
  supabase: SupabaseClient,
  projectId: string,
  versionId: string,
): Promise<string | null> {
  const [{ data: project }, { data: version }] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
    supabase.from("versions").select("version_number").eq("id", versionId).maybeSingle(),
  ]);
  const projectName = (project as { name: string } | null)?.name;
  const versionNumber = (version as { version_number: number } | null)?.version_number;
  if (!projectName || !versionNumber) return null;
  return `${projectName} (v${versionNumber})`;
}

/** Parses @email@domain mentions out of a comment body (matching
 * teams.ts's existing invite-by-email convention — there's no
 * username/handle system at all), resolves each to a user id, and notifies
 * anyone who also has project access. An unresolved @-string, or one for a
 * user without access to this project, is left as literal text — no error,
 * no partial notification. Best-effort: failures are logged, not thrown. */
async function notifyMentions(
  supabase: SupabaseClient,
  log: FastifyBaseLogger,
  params: { body: string; projectId: string; versionId: string; commentId: string; actorUserId: string },
): Promise<void> {
  const emails = [...new Set([...params.body.matchAll(MENTION_PATTERN)].map((m) => m[1].toLowerCase()))];
  if (emails.length === 0) return;

  const location = await describeVersionLocation(supabase, params.projectId, params.versionId);

  for (const email of emails) {
    const { data: userId, error } = await supabase.rpc("get_user_id_by_email", { p_email: email });
    if (error || !userId) continue;
    if (userId === params.actorUserId) continue;

    const access = await getProjectAccess(supabase, params.projectId, userId);
    if (!access.role) continue;

    await notifyMention(supabase, log, {
      recipientUserId: userId,
      actorUserId: params.actorUserId,
      projectId: params.projectId,
      versionId: params.versionId,
      commentId: params.commentId,
      summary: location ? `You were mentioned in a comment on ${location}` : "You were mentioned in a comment",
    });
  }
}

export default async function commentsRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  app.get<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId/comments",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId } = request.params;
      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        // Reading comments is unrestricted for anyone with project access —
        // a downgraded former-Pro user can still see their history, they
        // just can't add to it (see the POST/DELETE handlers below).

        const { data: rows, error } = await supabase
          .from("comments")
          .select("*")
          .eq("version_id", versionId)
          .order("created_at", { ascending: true });
        if (error) {
          app.log.error(error, "Failed to list comments");
          reply.code(502);
          return { success: false, error: "Failed to load comments" };
        }

        const commentRows = rows as CommentRow[];
        const emailByUserId = await resolveEmails(supabase, app.log, [
          ...commentRows.map((r) => r.author_user_id),
          ...commentRows.map((r) => r.assignee_user_id),
        ]);

        return { success: true, data: commentRows.map((r) => toCommentSummary(r, emailByUserId)) };
      } catch (err) {
        app.log.error(err, "Comment list threw");
        reply.code(502);
        return { success: false, error: "Failed to load comments" };
      }
    },
  );

  app.post<{ Params: { projectId: string; versionId: string }; Body: CreateCommentBody }>(
    "/projects/:projectId/versions/:versionId/comments",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId } = request.params;
      const { body, position, normal, parentCommentId, assigneeUserId, priority } = request.body ?? {};

      if (typeof body !== "string" || body.trim().length === 0) {
        reply.code(400);
        return { success: false, error: "body is required" };
      }
      if (
        !Array.isArray(position) ||
        position.length !== 3 ||
        position.some((n) => typeof n !== "number" || !Number.isFinite(n))
      ) {
        reply.code(400);
        return { success: false, error: "position must be [x, y, z]" };
      }
      if (
        normal !== undefined &&
        (!Array.isArray(normal) ||
          normal.length !== 3 ||
          normal.some((n) => typeof n !== "number" || !Number.isFinite(n)))
      ) {
        reply.code(400);
        return { success: false, error: "normal must be [x, y, z] when provided" };
      }
      if (parentCommentId !== undefined && typeof parentCommentId !== "string") {
        reply.code(400);
        return { success: false, error: "parentCommentId must be a string when provided" };
      }
      if (priority !== undefined && priority !== "low" && priority !== "normal" && priority !== "high") {
        reply.code(400);
        return { success: false, error: "priority must be 'low', 'normal', or 'high' when provided" };
      }

      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: version, error: versionError } = await supabase
          .from("versions")
          .select("id")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (versionError) {
          app.log.error(versionError, "Failed to look up version");
          reply.code(502);
          return { success: false, error: "Failed to create comment" };
        }
        if (!version) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }

        if (parentCommentId) {
          // Replies are one level deep — a reply's own parent must itself
          // be a top-level comment (parent_comment_id null), so a chain
          // can't nest into a deeper thread than the popover UI supports.
          const { data: parent, error: parentError } = await supabase
            .from("comments")
            .select("id, parent_comment_id")
            .eq("id", parentCommentId)
            .eq("version_id", versionId)
            .maybeSingle();
          if (parentError) {
            app.log.error(parentError, "Failed to look up parent comment");
            reply.code(502);
            return { success: false, error: "Failed to create comment" };
          }
          if (!parent) {
            reply.code(404);
            return { success: false, error: "Parent comment not found" };
          }
          if (parent.parent_comment_id) {
            reply.code(400);
            return { success: false, error: "Can't reply to a reply" };
          }
        }

        if (assigneeUserId) {
          const assigneeAccess = await getProjectAccess(supabase, projectId, assigneeUserId);
          if (!assigneeAccess.role) {
            reply.code(400);
            return { success: false, error: "Assignee doesn't have access to this project" };
          }
        }

        const { data: row, error } = await supabase
          .from("comments")
          .insert({
            version_id: versionId,
            author_user_id: request.userId,
            parent_comment_id: parentCommentId ?? null,
            body: body.trim(),
            position_x: position[0],
            position_y: position[1],
            position_z: position[2],
            normal_x: normal?.[0] ?? null,
            normal_y: normal?.[1] ?? null,
            normal_z: normal?.[2] ?? null,
            assignee_user_id: assigneeUserId ?? null,
            priority: priority ?? null,
          })
          .select("*")
          .single();
        if (error) {
          app.log.error(error, "Failed to insert comment");
          reply.code(502);
          return { success: false, error: "Failed to create comment, please try again" };
        }

        const newComment = row as CommentRow;

        if (assigneeUserId && assigneeUserId !== request.userId) {
          const location = await describeVersionLocation(supabase, projectId, versionId);
          await notifyCommentAssigned(supabase, app.log, {
            recipientUserId: assigneeUserId,
            actorUserId: request.userId!,
            projectId,
            versionId,
            commentId: newComment.id,
            summary: location ? `You were assigned a comment on ${location}` : "You were assigned a comment",
          });
        }
        await notifyMentions(supabase, app.log, {
          body: newComment.body,
          projectId,
          versionId,
          commentId: newComment.id,
          actorUserId: request.userId!,
        });

        const emailByUserId = await resolveEmails(supabase, app.log, [request.userId!, assigneeUserId ?? null]);
        return { success: true, data: toCommentSummary(newComment, emailByUserId) };
      } catch (err) {
        app.log.error(err, "Comment creation threw");
        reply.code(502);
        return { success: false, error: "Failed to create comment, please try again" };
      }
    },
  );

  app.patch<{ Params: { projectId: string; versionId: string; commentId: string }; Body: UpdateCommentBody }>(
    "/projects/:projectId/versions/:versionId/comments/:commentId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId, commentId } = request.params;
      const { status, assigneeUserId, priority } = request.body ?? {};

      if (status !== undefined && status !== "open" && status !== "resolved" && status !== "reopened") {
        reply.code(400);
        return { success: false, error: "status must be 'open', 'resolved', or 'reopened'" };
      }
      if (assigneeUserId !== undefined && assigneeUserId !== null && typeof assigneeUserId !== "string") {
        reply.code(400);
        return { success: false, error: "assigneeUserId must be a string or null" };
      }
      if (priority !== undefined && priority !== null && priority !== "low" && priority !== "normal" && priority !== "high") {
        reply.code(400);
        return { success: false, error: "priority must be 'low', 'normal', 'high', or null" };
      }
      if (status === undefined && assigneeUserId === undefined && priority === undefined) {
        reply.code(400);
        return { success: false, error: "Nothing to update" };
      }

      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: existing, error: fetchError } = await supabase
          .from("comments")
          .select("*")
          .eq("id", commentId)
          .eq("version_id", versionId)
          .maybeSingle();
        if (fetchError) {
          app.log.error(fetchError, "Failed to look up comment");
          reply.code(502);
          return { success: false, error: "Failed to update comment" };
        }
        if (!existing) {
          reply.code(404);
          return { success: false, error: "Comment not found" };
        }
        const existingRow = existing as CommentRow;

        // Status: author, current assignee, or a moderator can change it —
        // resolving/reopening isn't exclusively a reviewer action, it's
        // "whoever is dealing with this thread." Assignee/priority changes
        // are moderator-or-author-only — a plain assignee shouldn't be able
        // to reassign themselves away or bump priority on someone else's
        // comment.
        const isAuthor = existingRow.author_user_id === request.userId;
        const isAssignee = existingRow.assignee_user_id === request.userId;
        const isModerator = canModerateAny(access);
        if (status !== undefined && !isAuthor && !isAssignee && !isModerator) {
          reply.code(403);
          return { success: false, error: "Only the author, assignee, or a moderator can change status" };
        }
        if ((assigneeUserId !== undefined || priority !== undefined) && !isAuthor && !isModerator) {
          reply.code(403);
          return { success: false, error: "Only the author or a moderator can change assignee/priority" };
        }

        if (assigneeUserId) {
          const assigneeAccess = await getProjectAccess(supabase, projectId, assigneeUserId);
          if (!assigneeAccess.role) {
            reply.code(400);
            return { success: false, error: "Assignee doesn't have access to this project" };
          }
        }

        const update: Record<string, unknown> = {};
        if (status !== undefined) {
          update.status = status;
          update.status_changed_by_user_id = request.userId;
          update.status_changed_at = new Date().toISOString();
        }
        if (assigneeUserId !== undefined) update.assignee_user_id = assigneeUserId;
        if (priority !== undefined) update.priority = priority;

        const { data: row, error } = await supabase
          .from("comments")
          .update(update)
          .eq("id", commentId)
          .select("*")
          .single();
        if (error) {
          app.log.error(error, "Failed to update comment");
          reply.code(502);
          return { success: false, error: "Failed to update comment" };
        }
        const updatedRow = row as CommentRow;

        if (assigneeUserId !== undefined && assigneeUserId && assigneeUserId !== existingRow.assignee_user_id && assigneeUserId !== request.userId) {
          const location = await describeVersionLocation(supabase, projectId, versionId);
          await notifyCommentAssigned(supabase, app.log, {
            recipientUserId: assigneeUserId,
            actorUserId: request.userId!,
            projectId,
            versionId,
            commentId,
            summary: location ? `You were assigned a comment on ${location}` : "You were assigned a comment",
          });
        }

        if (status !== undefined && status !== existingRow.status) {
          const recipients = [updatedRow.author_user_id, updatedRow.assignee_user_id].filter(
            (id): id is string => !!id && id !== request.userId,
          );
          if (recipients.length > 0) {
            const location = await describeVersionLocation(supabase, projectId, versionId);
            const verb = status === "resolved" ? "resolved" : status === "reopened" ? "reopened" : "reset to open";
            await notifyCommentStatusChanged(supabase, app.log, {
              recipientUserIds: recipients,
              actorUserId: request.userId!,
              projectId,
              versionId,
              commentId,
              summary: location ? `A comment was ${verb} on ${location}` : `A comment was ${verb}`,
            });
          }
        }

        const emailByUserId = await resolveEmails(supabase, app.log, [
          updatedRow.author_user_id,
          updatedRow.assignee_user_id,
        ]);
        return { success: true, data: toCommentSummary(updatedRow, emailByUserId) };
      } catch (err) {
        app.log.error(err, "Comment update threw");
        reply.code(502);
        return { success: false, error: "Failed to update comment" };
      }
    },
  );

  app.delete<{ Params: { projectId: string; versionId: string; commentId: string } }>(
    "/projects/:projectId/versions/:versionId/comments/:commentId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId, commentId } = request.params;
      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: version, error: versionError } = await supabase
          .from("versions")
          .select("id")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (versionError) {
          app.log.error(versionError, "Failed to look up version");
          reply.code(502);
          return { success: false, error: "Failed to delete comment" };
        }
        if (!version) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }

        const { data: comment, error: fetchError } = await supabase
          .from("comments")
          .select("id, author_user_id")
          .eq("id", commentId)
          .eq("version_id", versionId)
          .maybeSingle();
        if (fetchError) {
          app.log.error(fetchError, "Failed to look up comment");
          reply.code(502);
          return { success: false, error: "Failed to delete comment" };
        }
        if (!comment) {
          reply.code(404);
          return { success: false, error: "Comment not found" };
        }

        if (!canModerateAny(access) && comment.author_user_id !== request.userId) {
          reply.code(403);
          return { success: false, error: "You can only delete your own comments" };
        }

        const { error: deleteError } = await supabase.from("comments").delete().eq("id", commentId);
        if (deleteError) {
          app.log.error(deleteError, "Failed to delete comment");
          reply.code(502);
          return { success: false, error: "Failed to delete comment" };
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Comment deletion threw");
        reply.code(502);
        return { success: false, error: "Failed to delete comment" };
      }
    },
  );
}
