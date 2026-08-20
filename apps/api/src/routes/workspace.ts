import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/requireAuth.js";
import { requireActiveAccess } from "../lib/requireActiveAccess.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { seedSampleProject } from "../lib/seedSampleProject.js";

const DEFAULT_WORKSPACE_NAME = "My Workspace";

interface UpdateWorkspaceBody {
  name?: string;
}

export default async function workspaceRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  // Lazily created on first read rather than backfilled — a user who signed
  // up before this feature shipped just gets the default the first time
  // they load the sidebar.
  app.get("/workspace", { preHandler: requireAuth }, async (request, reply) => {
    const supabase = request.supabase!;

    try {
      const { data: existing, error: selectError } = await supabase
        .from("user_workspaces")
        .select("name")
        .eq("user_id", request.userId)
        .maybeSingle();
      if (selectError) {
        app.log.error(selectError, "Failed to load workspace");
        reply.code(502);
        return { success: false, error: "Failed to load workspace" };
      }
      if (existing) {
        return { success: true, data: { name: existing.name } };
      }

      const { data: created, error: insertError } = await supabase
        .from("user_workspaces")
        .insert({ user_id: request.userId, name: DEFAULT_WORKSPACE_NAME })
        .select("name")
        .single();
      if (insertError) {
        app.log.error(insertError, "Failed to create workspace");
        reply.code(502);
        return { success: false, error: "Failed to load workspace" };
      }

      // Best-effort: a brand-new workspace lands on this path exactly once
      // (the row above didn't exist a moment ago). A failure here shouldn't
      // block the user from getting their workspace — log and move on.
      try {
        await seedSampleProject(supabase, request.userId!);
      } catch (err) {
        app.log.error(err, "Failed to seed sample project for new workspace");
      }

      return { success: true, data: { name: created.name } };
    } catch (err) {
      app.log.error(err, "Workspace lookup threw");
      reply.code(502);
      return { success: false, error: "Failed to load workspace" };
    }
  });

  app.patch<{ Body: UpdateWorkspaceBody }>(
    "/workspace",
    { preHandler: [requireAuth, requireActiveAccess] },
    async (request, reply) => {
    const { name } = request.body ?? {};
    if (typeof name !== "string" || name.trim().length === 0) {
      reply.code(400);
      return { success: false, error: "name must be a non-empty string" };
    }

    const supabase = request.supabase!;

    try {
      const { data, error } = await supabase
        .from("user_workspaces")
        .upsert(
          { user_id: request.userId, name: name.trim(), updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        )
        .select("name")
        .single();
      if (error) {
        app.log.error(error, "Failed to update workspace");
        reply.code(502);
        return { success: false, error: "Failed to update workspace" };
      }

      return { success: true, data: { name: data.name } };
    } catch (err) {
      app.log.error(err, "Workspace update threw");
      reply.code(502);
      return { success: false, error: "Failed to update workspace" };
    }
  });
}
