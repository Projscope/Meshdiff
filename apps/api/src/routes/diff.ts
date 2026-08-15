import type { FastifyInstance } from "fastify";
import { getSupabase } from "../lib/supabase.js";
import { loadMeshGeometryServer } from "../lib/loadMeshServer.js";
import { computeVoxelDiff } from "../../../shared/dist/engine/diffVoxels.js";
import { requireAuth } from "../lib/requireAuth.js";
import { requireActiveAccess } from "../lib/requireActiveAccess.js";
import { getProjectAccess } from "../lib/ownership.js";

const BUCKET = "project-meshes";

interface VersionRow {
  id: string;
  project_id: string;
  file_path: string;
  file_format: string;
}

export default async function diffRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { versionAId: string; versionBId: string } }>(
    "/diff/:versionAId/:versionBId",
    { preHandler: [requireAuth, requireActiveAccess] },
    async (request, reply) => {
      const { versionAId, versionBId } = request.params;
      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Diffing is not configured" };
      }

      try {
        // Ownership must be checked before the cache lookup below — a
        // cached diff's presence/content shouldn't leak to a user who
        // doesn't own the project it belongs to.
        const { data: versions, error: versionsError } = await supabase
          .from("versions")
          .select("id, project_id, file_path, file_format")
          .in("id", [versionAId, versionBId]);
        if (versionsError) {
          app.log.error(versionsError, "Failed to look up versions");
          reply.code(502);
          return { success: false, error: "Failed to load diff" };
        }

        const versionA = (versions as VersionRow[] | null)?.find((v) => v.id === versionAId);
        const versionB = (versions as VersionRow[] | null)?.find((v) => v.id === versionBId);
        if (!versionA || !versionB) {
          reply.code(404);
          return { success: false, error: "One or both versions not found" };
        }
        if (versionA.project_id !== versionB.project_id) {
          reply.code(400);
          return { success: false, error: "Versions must belong to the same project" };
        }
        if (!(await getProjectAccess(supabase, versionA.project_id, request.userId!)).role) {
          reply.code(404);
          return { success: false, error: "One or both versions not found" };
        }

        const { data: cached, error: cacheError } = await supabase
          .from("version_diffs")
          .select("stats")
          .eq("version_a_id", versionAId)
          .eq("version_b_id", versionBId)
          .maybeSingle();
        if (cacheError) {
          app.log.error(cacheError, "Failed to look up cached diff");
          reply.code(502);
          return { success: false, error: "Failed to load diff" };
        }
        if (cached) {
          return { success: true, data: cached.stats };
        }

        const [blobA, blobB] = await Promise.all([
          supabase.storage.from(BUCKET).download(versionA.file_path),
          supabase.storage.from(BUCKET).download(versionB.file_path),
        ]);
        if (blobA.error || !blobA.data || blobB.error || !blobB.data) {
          app.log.error({ a: blobA.error, b: blobB.error }, "Failed to download version files");
          reply.code(502);
          return { success: false, error: "Failed to read version files" };
        }

        const [bufferA, bufferB] = await Promise.all([
          blobA.data.arrayBuffer(),
          blobB.data.arrayBuffer(),
        ]);
        const [geoAResult, geoBResult] = await Promise.all([
          loadMeshGeometryServer(bufferA, versionA.file_format as "stl" | "obj" | "3mf"),
          loadMeshGeometryServer(bufferB, versionB.file_format as "stl" | "obj" | "3mf"),
        ]);
        if (!geoAResult.success) {
          reply.code(422);
          return { success: false, error: geoAResult.error };
        }
        if (!geoBResult.success) {
          reply.code(422);
          return { success: false, error: geoBResult.error };
        }

        const diffResult = computeVoxelDiff(geoAResult.data, geoBResult.data, {
          fileFormatA: versionA.file_format,
          fileFormatB: versionB.file_format,
        });
        if (!diffResult.success) {
          reply.code(422);
          return { success: false, error: diffResult.error };
        }

        const { stats } = diffResult.data;

        const { error: insertError } = await supabase.from("version_diffs").upsert(
          {
            project_id: versionA.project_id,
            version_a_id: versionAId,
            version_b_id: versionBId,
            stats,
            printability_status: stats.printabilityStatus,
            computed_at: new Date().toISOString(),
          },
          { onConflict: "version_a_id,version_b_id" },
        );
        if (insertError) {
          app.log.warn(insertError, "Failed to cache computed diff");
        }

        return { success: true, data: stats };
      } catch (err) {
        app.log.error(err, "Diff computation threw");
        reply.code(502);
        return { success: false, error: "Failed to compute diff" };
      }
    },
  );
}
