import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../lib/requireAuth.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { getProjectAccess } from "../lib/ownership.js";
import { requireProjectWriteAccess } from "../lib/requireProjectTierAccess.js";

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
  created_at: string;
}

interface CreateCommentBody {
  body?: string;
  position?: [number, number, number];
  normal?: [number, number, number];
  parentCommentId?: string;
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
    createdAt: row.created_at,
  };
}

async function resolveAuthorEmails(
  supabase: SupabaseClient,
  log: FastifyBaseLogger,
  userIds: (string | null)[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter((id): id is string => !!id))];
  if (uniqueIds.length === 0) return new Map();
  const { data: emailRows, error } = await supabase.rpc("get_user_emails_by_ids", { p_ids: uniqueIds });
  if (error) {
    log.warn(error, "Failed to resolve comment author emails");
    return new Map();
  }
  return new Map((emailRows ?? []).map((r: { id: string; email: string }) => [r.id, r.email]));
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
        const emailByUserId = await resolveAuthorEmails(
          supabase,
          app.log,
          commentRows.map((r) => r.author_user_id),
        );

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
      const { body, position, normal, parentCommentId } = request.body ?? {};

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
          })
          .select("*")
          .single();
        if (error) {
          app.log.error(error, "Failed to insert comment");
          reply.code(502);
          return { success: false, error: "Failed to create comment, please try again" };
        }

        const emailByUserId = await resolveAuthorEmails(supabase, app.log, [request.userId!]);
        return { success: true, data: toCommentSummary(row as CommentRow, emailByUserId) };
      } catch (err) {
        app.log.error(err, "Comment creation threw");
        reply.code(502);
        return { success: false, error: "Failed to create comment, please try again" };
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

        // Owner/admin can moderate any comment on the project; anyone else
        // can only remove their own.
        const canModerateAny = access.role === "owner" || access.role === "admin";
        if (!canModerateAny && comment.author_user_id !== request.userId) {
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
