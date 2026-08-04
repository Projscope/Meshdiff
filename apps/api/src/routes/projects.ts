import type { FastifyInstance } from "fastify";
import { getSupabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/requireAuth.js";

interface CreateProjectBody {
  name?: string;
  description?: string;
}

export default async function projectsRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateProjectBody }>(
    "/projects",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { name, description } = request.body ?? {};

      if (typeof name !== "string" || name.trim().length === 0) {
        reply.code(400);
        return { success: false, error: "name is required" };
      }

      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Projects are not configured" };
      }

      try {
        const { data: row, error } = await supabase
          .from("projects")
          .insert({ name: name.trim(), description: description ?? null, owner_user_id: request.userId })
          .select("id, name, description, created_at, updated_at")
          .single();

        if (error) {
          app.log.error(error, "Failed to insert project");
          reply.code(502);
          return { success: false, error: "Failed to create project, please try again" };
        }

        return {
          success: true,
          data: {
            id: row.id,
            name: row.name,
            description: row.description,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            latestFileName: null,
          },
        };
      } catch (err) {
        app.log.error(err, "Project creation threw");
        reply.code(502);
        return { success: false, error: "Failed to create project, please try again" };
      }
    },
  );

  app.get("/projects", { preHandler: requireAuth }, async (request, reply) => {
    const supabase = getSupabase();
    if (!supabase) {
      app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
      reply.code(500);
      return { success: false, error: "Projects are not configured" };
    }

    try {
      // Denormalized latest-version summary (filename/date) belongs on the
      // list card per the mockup; join the most recent version per project
      // rather than a second round trip per card.
      const { data: rows, error } = await supabase
        .from("projects")
        .select(
          "id, name, description, created_at, updated_at, versions(file_name, created_at)",
        )
        .eq("owner_user_id", request.userId)
        .order("updated_at", { ascending: false });

      if (error) {
        app.log.error(error, "Failed to list projects");
        reply.code(502);
        return { success: false, error: "Failed to load projects" };
      }

      const data = (rows ?? []).map((row) => {
        const versions = (row.versions ?? []) as Array<{ file_name: string; created_at: string }>;
        const latest = versions.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0];
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          latestFileName: latest?.file_name ?? null,
        };
      });

      return { success: true, data };
    } catch (err) {
      app.log.error(err, "Project list threw");
      reply.code(502);
      return { success: false, error: "Failed to load projects" };
    }
  });

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Projects are not configured" };
      }

      try {
        const { data: row, error } = await supabase
          .from("projects")
          .select("id, name, description, created_at, updated_at")
          .eq("id", request.params.projectId)
          .eq("owner_user_id", request.userId)
          .maybeSingle();

        if (error) {
          app.log.error(error, "Failed to load project");
          reply.code(502);
          return { success: false, error: "Failed to load project" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }

        return { success: true, data: row };
      } catch (err) {
        app.log.error(err, "Project lookup threw");
        reply.code(502);
        return { success: false, error: "Failed to load project" };
      }
    },
  );
}
