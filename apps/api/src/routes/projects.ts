import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/requireAuth.js";
import { requireActiveAccess } from "../lib/requireActiveAccess.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { getProjectAccess } from "../lib/ownership.js";
import { getUserTier } from "../lib/subscription.js";
import { requireProjectWriteAccess } from "../lib/requireProjectTierAccess.js";

const BUCKET = "project-meshes";
const THUMBNAIL_URL_TTL_SECONDS = 3600;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function thumbnailPath(projectId: string): string {
  return `thumbnails/${projectId}.png`;
}

interface CreateProjectBody {
  name?: string;
  description?: string;
}

interface UpdateProjectBody {
  name?: string;
  description?: string | null;
  teamId?: string | null;
}

interface ListProjectsQuery {
  page?: string;
  pageSize?: string;
  sort?: "name" | "date-newest" | "date-oldest";
}

export default async function projectsRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  app.post<{ Body: CreateProjectBody }>(
    "/projects",
    { preHandler: [requireAuth, requireActiveAccess] },
    async (request, reply) => {
      const { name, description } = request.body ?? {};

      if (typeof name !== "string" || name.trim().length === 0) {
        reply.code(400);
        return { success: false, error: "name is required" };
      }

      const supabase = request.supabase!;

      const { tier } = await getUserTier(supabase, request.userId!);
      if (tier === "free") {
        reply.code(403);
        return { success: false, error: "Upgrade to create new projects. Use the Sample Project to learn the platform." };
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
            teamId: null,
            latestFileName: null,
            versionCount: 0,
            latestPrintabilityStatus: null,
            thumbnailUrl: null,
          },
        };
      } catch (err) {
        app.log.error(err, "Project creation threw");
        reply.code(502);
        return { success: false, error: "Failed to create project, please try again" };
      }
    },
  );

  app.get<{ Querystring: ListProjectsQuery }>("/projects", { preHandler: requireAuth }, async (request, reply) => {
    const supabase = request.supabase!;
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(request.query.pageSize ?? "", 10) || DEFAULT_PAGE_SIZE));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const sort = request.query.sort ?? "date-newest";

    try {
      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", request.userId);
      const teamIds = (memberships ?? []).map((m) => m.team_id as string);

      // Denormalized latest-version summary (filename/date) belongs on the
      // list card per the mockup; join the most recent version per project
      // rather than a second round trip per card. Includes projects owned
      // directly, plus any project belonging to a team the user is a
      // member of (see plan: team_id null = personal, non-null = Team).
      let query = supabase
        .from("projects")
        .select(
          "id, name, description, created_at, updated_at, team_id, versions(file_name, created_at, printability_status)",
          { count: "exact" },
        );
      query =
        teamIds.length > 0
          ? query.or(`owner_user_id.eq.${request.userId},team_id.in.(${teamIds.join(",")})`)
          : query.eq("owner_user_id", request.userId);

      // Apply sorting based on the sort parameter
      if (sort === "name") {
        query = query.order("name", { ascending: true });
      } else if (sort === "date-oldest") {
        query = query.order("created_at", { ascending: true });
      } else {
        // Default: date-newest
        query = query.order("created_at", { ascending: false });
      }

      const { data: rows, error, count } = await query.range(from, to);

      if (error) {
        app.log.error(error, "Failed to list projects");
        reply.code(502);
        return { success: false, error: "Failed to load projects" };
      }

      // Thumbnail objects are optional (a project with no uploads yet, or
      // one uploaded before this feature shipped, has none) — request a
      // signed URL for the deterministic thumbnails/{id}.png path regardless
      // and let the frontend fall back to a placeholder on 404 rather than
      // doing a separate existence check per project.
      const projects = await Promise.all(
        (rows ?? []).map(async (row) => {
          const versions = (row.versions ?? []) as Array<{
            file_name: string;
            created_at: string;
            printability_status: "pass" | "warn" | "fail" | null;
          }>;
          const latest = versions.sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )[0];
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(thumbnailPath(row.id), THUMBNAIL_URL_TTL_SECONDS);
          return {
            id: row.id,
            name: row.name,
            description: row.description,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            teamId: row.team_id,
            latestFileName: latest?.file_name ?? null,
            versionCount: versions.length,
            latestPrintabilityStatus: latest?.printability_status ?? null,
            thumbnailUrl: signed?.signedUrl ?? null,
          };
        }),
      );

      return { success: true, data: { projects, total: count ?? projects.length } };
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
      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, request.params.projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        // Viewing a project's own detail is a read — unrestricted for
        // anyone with access, including a downgraded former-Pro user.

        const { data: row, error } = await supabase
          .from("projects")
          .select("id, name, description, created_at, updated_at, team_id")
          .eq("id", request.params.projectId)
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

        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(thumbnailPath(row.id), THUMBNAIL_URL_TTL_SECONDS);

        return {
          success: true,
          data: {
            id: row.id,
            name: row.name,
            description: row.description,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            teamId: row.team_id,
            thumbnailUrl: signed?.signedUrl ?? null,
            myRole: access.role,
          },
        };
      } catch (err) {
        app.log.error(err, "Project lookup threw");
        reply.code(502);
        return { success: false, error: "Failed to load project" };
      }
    },
  );

  app.patch<{ Params: { projectId: string }; Body: UpdateProjectBody }>(
    "/projects/:projectId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId } = request.params;
      const body = request.body ?? {};
      const hasTeamId = "teamId" in body;
      const hasName = "name" in body;
      const hasDescription = "description" in body;

      if (hasTeamId && body.teamId !== null && typeof body.teamId !== "string") {
        reply.code(400);
        return { success: false, error: "teamId must be a string or null" };
      }
      if (hasName && (typeof body.name !== "string" || body.name.trim().length === 0)) {
        reply.code(400);
        return { success: false, error: "name must be a non-empty string" };
      }
      if (hasDescription && body.description !== null && typeof body.description !== "string") {
        reply.code(400);
        return { success: false, error: "description must be a string or null" };
      }
      if (!hasTeamId && !hasName && !hasDescription) {
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

        // Moving a project between teams is owner-only (it changes who has
        // access at all); renaming/describing is fine for a team admin too.
        if (hasTeamId && access.role !== "owner") {
          reply.code(403);
          return { success: false, error: "Only the project owner can change its team" };
        }
        if ((hasName || hasDescription) && access.role === "member") {
          reply.code(403);
          return { success: false, error: "Only the project owner or a team admin can edit this project" };
        }

        if (hasTeamId && body.teamId !== null) {
          const { data: membership } = await supabase
            .from("team_members")
            .select("id")
            .eq("team_id", body.teamId)
            .eq("user_id", request.userId)
            .maybeSingle();
          if (!membership) {
            reply.code(403);
            return { success: false, error: "You must be a member of that team" };
          }
        }

        const update: Record<string, unknown> = {};
        if (hasTeamId) update.team_id = body.teamId;
        if (hasName) update.name = body.name!.trim();
        if (hasDescription) update.description = body.description;

        const { data: row, error } = await supabase
          .from("projects")
          .update(update)
          .eq("id", projectId)
          .select("id, name, description, team_id")
          .single();
        if (error) {
          app.log.error(error, "Failed to update project");
          reply.code(502);
          return { success: false, error: "Failed to update project" };
        }

        return {
          success: true,
          data: { name: row.name, description: row.description, teamId: row.team_id },
        };
      } catch (err) {
        app.log.error(err, "Project update threw");
        reply.code(502);
        return { success: false, error: "Failed to update project" };
      }
    },
  );

  // The thumbnail is rendered client-side from the mesh the user just
  // uploaded (see renderThumbnail.ts) and re-uploaded here at a fixed,
  // deterministic path so the list page's signed-URL lookup doesn't need a
  // DB column to track it — each new upload just overwrites the same object.
  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/thumbnail-upload-url",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId } = request.params;
      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        // Re-rendering the thumbnail from an *existing* version (see the
        // auto-fallback effect in ProjectDetailPage.tsx) isn't uploading a
        // new version — it's cosmetic, so it follows the same sample-project
        // exemption as viewing/comparing, not the stricter upload gate.
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: upload, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(thumbnailPath(projectId), { upsert: true });
        if (error) {
          app.log.error(error, "Failed to create thumbnail upload URL");
          reply.code(502);
          return { success: false, error: "Failed to prepare thumbnail upload" };
        }

        return { success: true, data: { uploadUrl: upload.signedUrl } };
      } catch (err) {
        app.log.error(err, "Thumbnail upload URL threw");
        reply.code(502);
        return { success: false, error: "Failed to prepare thumbnail upload" };
      }
    },
  );

  // Owner or team admin only — everything else (versions, version_diffs,
  // comments) cascades at the DB level (see migrations), but storage
  // objects (mesh files, thumbnail) live outside Postgres and have to be
  // cleaned up explicitly or they'd leak forever.
  app.delete<{ Params: { projectId: string } }>(
    "/projects/:projectId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId } = request.params;
      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (access.role !== "owner" && access.role !== "admin") {
          reply.code(403);
          return { success: false, error: "Only the project owner or a team admin can delete this project" };
        }

        const { data: versions } = await supabase
          .from("versions")
          .select("file_path")
          .eq("project_id", projectId);

        const paths = [...(versions ?? []).map((v) => v.file_path as string), thumbnailPath(projectId)];
        if (paths.length > 0) {
          const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
          if (removeError) {
            app.log.warn(removeError, "Failed to remove some project files from storage");
          }
        }

        const { error } = await supabase.from("projects").delete().eq("id", projectId);
        if (error) {
          app.log.error(error, "Failed to delete project");
          reply.code(502);
          return { success: false, error: "Failed to delete project, please try again" };
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Project deletion threw");
        reply.code(502);
        return { success: false, error: "Failed to delete project, please try again" };
      }
    },
  );

  // Called when the version the thumbnail depicted was deleted and no
  // versions remain to re-render from — removes the stale image so the list
  // page falls back to the "no model yet" placeholder instead of showing a
  // deleted model.
  app.delete<{ Params: { projectId: string } }>(
    "/projects/:projectId/thumbnail",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId } = request.params;
      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { error } = await supabase.storage.from(BUCKET).remove([thumbnailPath(projectId)]);
        if (error) {
          app.log.error(error, "Failed to remove thumbnail");
          reply.code(502);
          return { success: false, error: "Failed to remove thumbnail" };
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Thumbnail removal threw");
        reply.code(502);
        return { success: false, error: "Failed to remove thumbnail" };
      }
    },
  );
}
