import type { FastifyInstance } from "fastify";
import { requireAuth, getOptionalUser } from "../lib/requireAuth.js";
import { requireAdmin, getAdminUserIds } from "../lib/requireAdmin.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { notifyFeedbackSubmitted } from "../lib/notify.js";

const PAGE_SIZE = 25;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_EMAIL_LENGTH = 320;
const MAX_PAGE_LENGTH = 200;
const MAX_USER_AGENT_LENGTH = 500;

type FeedbackType = "note" | "feature" | "bug";

const TYPE_LABEL: Record<FeedbackType, string> = { note: "note", feature: "feature request", bug: "bug report" };

interface FeedbackRow {
  id: string;
  type: FeedbackType;
  message: string;
  email: string | null;
  page: string | null;
  status: "new" | "reviewed";
  created_at: string;
  // Auto-captured, admin-only context — distinct from the optional `email`
  // field above, which is contact info the submitter typed in themselves.
  user_id: string | null;
  user_email: string | null;
  user_agent: string | null;
}

interface SubmitFeedbackBody {
  type?: string;
  message?: string;
  email?: string;
  page?: string;
}

interface AdminFeedbackQuery {
  page?: string;
}

interface UpdateFeedbackStatusBody {
  status?: string;
}

function toFeedbackSummary(row: FeedbackRow) {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    email: row.email,
    page: row.page,
    status: row.status,
    createdAt: row.created_at,
    userId: row.user_id,
    userEmail: row.user_email,
    userAgent: row.user_agent,
  };
}

export default async function feedbackRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  // Public — no auth. This is the "Add Feedback" button on the free,
  // unauthenticated Live Diff tool, so there's no logged-in user to
  // attribute this to; email is opt-in contact info the submitter types in.
  app.post<{ Body: SubmitFeedbackBody }>("/feedback", async (request, reply) => {
    const { type, message, email, page } = request.body ?? {};

    if (type !== "note" && type !== "feature" && type !== "bug") {
      reply.code(400);
      return { success: false, error: "type must be 'note', 'feature', or 'bug'" };
    }
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    if (!trimmedMessage) {
      reply.code(400);
      return { success: false, error: "message is required" };
    }
    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      reply.code(400);
      return { success: false, error: `message must be under ${MAX_MESSAGE_LENGTH} characters` };
    }
    if (email !== undefined && (typeof email !== "string" || email.length > MAX_EMAIL_LENGTH)) {
      reply.code(400);
      return { success: false, error: "email is invalid" };
    }

    const supabase = request.supabase!;
    // Best-effort — the button is global now, so a logged-in user's request
    // already carries a bearer token even though this route stays open to
    // anonymous /live visitors. Purely for admin context; never blocks or
    // surfaces back to the submitter.
    const submitter = await getOptionalUser(request);
    const userAgent = request.headers["user-agent"];

    try {
      const { data: inserted, error } = await supabase
        .from("feedback")
        .insert({
          type,
          message: trimmedMessage,
          email: email?.trim() || null,
          page: typeof page === "string" ? page.slice(0, MAX_PAGE_LENGTH) : null,
          user_id: submitter?.id ?? null,
          user_email: submitter?.email ?? null,
          user_agent: typeof userAgent === "string" ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        app.log.error(error, "Failed to insert feedback");
        reply.code(502);
        return { success: false, error: "Failed to submit feedback, please try again" };
      }

      const adminUserIds = await getAdminUserIds(supabase);
      if (adminUserIds.length > 0) {
        const preview = trimmedMessage.length > 120 ? `${trimmedMessage.slice(0, 120)}…` : trimmedMessage;
        await notifyFeedbackSubmitted(supabase, app.log, {
          recipientUserIds: adminUserIds,
          feedbackId: (inserted as { id: string }).id,
          summary: `New ${TYPE_LABEL[type]}: "${preview}"`,
        });
      }

      return { success: true, data: true };
    } catch (err) {
      app.log.error(err, "Feedback submission threw");
      reply.code(502);
      return { success: false, error: "Failed to submit feedback, please try again" };
    }
  });

  app.get<{ Querystring: AdminFeedbackQuery }>(
    "/admin/feedback",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);

      try {
        const { data, error, count } = await supabase
          .from("feedback")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
        if (error) {
          app.log.error(error, "Failed to list feedback");
          reply.code(502);
          return { success: false, error: "Failed to load feedback" };
        }

        return {
          success: true,
          data: { entries: (data as FeedbackRow[]).map(toFeedbackSummary), total: count ?? 0 },
        };
      } catch (err) {
        app.log.error(err, "Admin feedback list threw");
        reply.code(502);
        return { success: false, error: "Failed to load feedback" };
      }
    },
  );

  // Single-entry lookup — used by the notification deep-link (see
  // NotificationInbox.tsx's targetPath()) to open one specific entry's
  // detail modal regardless of which page of the (paginated) list it's on.
  app.get<{ Params: { id: string } }>(
    "/admin/feedback/:id",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;

      try {
        const { data, error } = await supabase
          .from("feedback")
          .select("*")
          .eq("id", request.params.id)
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to load feedback entry");
          reply.code(502);
          return { success: false, error: "Failed to load feedback" };
        }
        if (!data) {
          reply.code(404);
          return { success: false, error: "Feedback not found" };
        }

        return { success: true, data: toFeedbackSummary(data as FeedbackRow) };
      } catch (err) {
        app.log.error(err, "Admin feedback lookup threw");
        reply.code(502);
        return { success: false, error: "Failed to load feedback" };
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateFeedbackStatusBody }>(
    "/admin/feedback/:id",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { status } = request.body ?? {};
      if (status !== "new" && status !== "reviewed") {
        reply.code(400);
        return { success: false, error: "status must be 'new' or 'reviewed'" };
      }

      const supabase = request.supabase!;

      try {
        const { data, error } = await supabase
          .from("feedback")
          .update({ status })
          .eq("id", request.params.id)
          .select("id")
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to update feedback status");
          reply.code(502);
          return { success: false, error: "Failed to update feedback" };
        }
        if (!data) {
          reply.code(404);
          return { success: false, error: "Feedback not found" };
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Admin feedback status update threw");
        reply.code(502);
        return { success: false, error: "Failed to update feedback" };
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/admin/feedback/:id",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;

      try {
        const { data, error } = await supabase
          .from("feedback")
          .delete()
          .eq("id", request.params.id)
          .select("id")
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to delete feedback");
          reply.code(502);
          return { success: false, error: "Failed to delete feedback" };
        }
        if (!data) {
          reply.code(404);
          return { success: false, error: "Feedback not found" };
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Admin feedback delete threw");
        reply.code(502);
        return { success: false, error: "Failed to delete feedback" };
      }
    },
  );
}
