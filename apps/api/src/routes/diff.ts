import type { FastifyInstance } from "fastify";
import { requireSupabase } from "../lib/requireSupabase.js";
import { loadMeshGeometryServer } from "../lib/loadMeshServer.js";
import { computeVoxelDiff } from "../../../shared/dist/engine/diffVoxels.js";
import { requireAuth } from "../lib/requireAuth.js";
import { getProjectAccess } from "../lib/ownership.js";
import { exceedsMaxFileSize } from "../lib/fileSizeLimit.js";
import { isUnderMemoryPressure } from "../lib/memoryGuard.js";
import { runExclusive } from "../lib/computeLock.js";

const BUCKET = "project-meshes";

interface VersionRow {
  id: string;
  project_id: string;
  file_path: string;
  file_format: string;
}

export default async function diffRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  app.get<{ Params: { versionAId: string; versionBId: string } }>(
    "/diff/:versionAId/:versionBId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { versionAId, versionBId } = request.params;
      const supabase = request.supabase!;

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
        const access = await getProjectAccess(supabase, versionA.project_id, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "One or both versions not found" };
        }
        // Viewing a diff between two already-uploaded versions is a read —
        // unrestricted for anyone with project access, including a
        // downgraded former-Pro user looking at their retained history.

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

        // Everything from here through computeVoxelDiff is the expensive
        // part — a project page fires one of these requests per consecutive
        // version pair, all at once (see computeLock.ts), so this all runs
        // serialized process-wide rather than N of these piling up in
        // memory simultaneously. The point-in-time memory check still runs
        // first (now serialized too), since a genuinely long queue could
        // still leave the process near its ceiling by the time this
        // request's turn comes up.
        const computed = await runExclusive(async () => {
          if (isUnderMemoryPressure()) {
            return { ok: false as const, code: 503, error: "Server is under heavy load, please try again shortly" };
          }

          const [blobA, blobB] = await Promise.all([
            supabase.storage.from(BUCKET).download(versionA.file_path),
            supabase.storage.from(BUCKET).download(versionB.file_path),
          ]);
          if (blobA.error || !blobA.data || blobB.error || !blobB.data) {
            app.log.error({ a: blobA.error, b: blobB.error }, "Failed to download version files");
            return { ok: false as const, code: 502, error: "Failed to read version files" };
          }
          if (exceedsMaxFileSize(blobA.data) || exceedsMaxFileSize(blobB.data)) {
            return { ok: false as const, code: 413, error: "File must be under 50MB" };
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
            return { ok: false as const, code: 422, error: geoAResult.error };
          }
          if (!geoBResult.success) {
            return { ok: false as const, code: 422, error: geoBResult.error };
          }

          const diffResult = computeVoxelDiff(geoAResult.data, geoBResult.data, {
            fileFormatA: versionA.file_format,
            fileFormatB: versionB.file_format,
          });
          if (!diffResult.success) {
            return { ok: false as const, code: 422, error: diffResult.error };
          }

          return { ok: true as const, stats: diffResult.data.stats };
        });

        if (!computed.ok) {
          reply.code(computed.code);
          return { success: false, error: computed.error };
        }
        const { stats } = computed;

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
