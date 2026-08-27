import type { FastifyInstance } from "fastify";
import { requireSupabase } from "../lib/requireSupabase.js";
import { requireAuth } from "../lib/requireAuth.js";

interface NotificationRow {
  id: string;
  actor_user_id: string | null;
  type: string;
  project_id: string | null;
  version_id: string | null;
  comment_id: string | null;
  summary: string;
  read_at: string | null;
  created_at: string;
}

function toNotificationSummary(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    projectId: row.project_id,
    versionId: row.version_id,
    commentId: row.comment_id,
    summary: row.summary,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

const PAGE_SIZE = 30;

export default async function notificationsRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  app.get<{ Querystring: { unreadOnly?: string; page?: string } }>(
    "/notifications",
    { preHandler: requireAuth },
    async (request, reply) => {
      const supabase = request.supabase!;
      const unreadOnly = request.query.unreadOnly === "true";
      const page = Math.max(1, Number(request.query.page) || 1);

      try {
        let query = supabase
          .from("notifications")
          .select("*")
          .eq("recipient_user_id", request.userId!)
          .order("created_at", { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
        if (unreadOnly) query = query.is("read_at", null);

        const { data: rows, error } = await query;
        if (error) {
          app.log.error(error, "Failed to list notifications");
          reply.code(502);
          return { success: false, error: "Failed to load notifications" };
        }

        return { success: true, data: (rows as NotificationRow[]).map(toNotificationSummary) };
      } catch (err) {
        app.log.error(err, "Notifications list threw");
        reply.code(502);
        return { success: false, error: "Failed to load notifications" };
      }
    },
  );

  // Cheap poll target for the bell badge — a count query, not the full page
  // of rows the inbox dropdown needs.
  app.get(
    "/notifications/unread-count",
    { preHandler: requireAuth },
    async (request, reply) => {
      const supabase = request.supabase!;

      try {
        const { count, error } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_user_id", request.userId!)
          .is("read_at", null);
        if (error) {
          app.log.error(error, "Failed to count unread notifications");
          reply.code(502);
          return { success: false, error: "Failed to load unread count" };
        }

        return { success: true, data: { count: count ?? 0 } };
      } catch (err) {
        app.log.error(err, "Unread notification count threw");
        reply.code(502);
        return { success: false, error: "Failed to load unread count" };
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/notifications/:id/read",
    { preHandler: requireAuth },
    async (request, reply) => {
      const supabase = request.supabase!;

      try {
        const { data: row, error } = await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", request.params.id)
          .eq("recipient_user_id", request.userId!)
          .select("id")
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to mark notification read");
          reply.code(502);
          return { success: false, error: "Failed to mark notification read" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Notification not found" };
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Mark notification read threw");
        reply.code(502);
        return { success: false, error: "Failed to mark notification read" };
      }
    },
  );

  app.post(
    "/notifications/mark-all-read",
    { preHandler: requireAuth },
    async (request, reply) => {
      const supabase = request.supabase!;

      try {
        const { error } = await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("recipient_user_id", request.userId!)
          .is("read_at", null);
        if (error) {
          app.log.error(error, "Failed to mark all notifications read");
          reply.code(502);
          return { success: false, error: "Failed to mark all notifications read" };
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Mark all notifications read threw");
        reply.code(502);
        return { success: false, error: "Failed to mark all notifications read" };
      }
    },
  );
}
