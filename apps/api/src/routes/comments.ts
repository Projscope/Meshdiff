import type { FastifyInstance } from "fastify";
import { getSupabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/requireAuth.js";
import { getProjectAccess } from "../lib/ownership.js";
import { requireProjectTierAccess } from "../lib/requireProjectTierAccess.js";

interface CommentRow {
  id: string;
  version_id: string;
  author_user_id: string | null;
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
}

function toCommentSummary(row: CommentRow) {
  return {
    id: row.id,
    body: row.body,
    position: [row.position_x, row.position_y, row.position_z] as [number, number, number],
    normal:
      row.normal_x !== null && row.normal_y !== null && row.normal_z !== null
        ? ([row.normal_x, row.normal_y, row.normal_z] as [number, number, number])
        : null,
    createdAt: row.created_at,
  };
}

export default async function commentsRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId/comments",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId } = request.params;
      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Comments are not configured" };
      }

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectTierAccess(supabase, request.userId!, access, reply))) return;

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

        return { success: true, data: (rows as CommentRow[]).map(toCommentSummary) };
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
      const { body, position, normal } = request.body ?? {};

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

      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Comments are not configured" };
      }

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectTierAccess(supabase, request.userId!, access, reply))) return;

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

        const { data: row, error } = await supabase
          .from("comments")
          .insert({
            version_id: versionId,
            author_user_id: request.userId,
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

        return { success: true, data: toCommentSummary(row as CommentRow) };
      } catch (err) {
        app.log.error(err, "Comment creation threw");
        reply.code(502);
        return { success: false, error: "Failed to create comment, please try again" };
      }
    },
  );
}
