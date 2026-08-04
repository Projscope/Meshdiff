import type { FastifyInstance } from "fastify";
import { ulid } from "ulid";
import archiver from "archiver";
import { getSupabase } from "../lib/supabase.js";
import { extensionOf } from "../lib/filename.js";
import { loadMeshGeometryServer } from "../lib/loadMeshServer.js";
import { generateChangeSummary } from "../lib/generateSummary.js";
import { computeVoxelDiff } from "@meshdiff/shared/engine/diffVoxels.js";
import { requireAuth } from "../lib/requireAuth.js";
import { isProjectOwner } from "../lib/ownership.js";

const ALLOWED_EXTENSIONS = new Set(["stl", "obj", "3mf"]);
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_URL_TTL_SECONDS = 60;
const BUCKET = "project-meshes";

interface CreateVersionBody {
  fileName?: string;
  fileSize?: number;
}

interface VersionRow {
  id: string;
  project_id: string;
  version_number: number;
  file_name: string;
  file_path: string;
  file_format: string;
  file_size_bytes: number;
  triangle_count: number | null;
  change_summary: string | null;
  printability_status: string | null;
  approval_status: string;
  created_at: string;
}

function toVersionSummary(row: VersionRow) {
  return {
    id: row.id,
    versionNumber: row.version_number,
    fileName: row.file_name,
    fileFormat: row.file_format,
    fileSizeBytes: row.file_size_bytes,
    triangleCount: row.triangle_count,
    changeSummary: row.change_summary,
    printabilityStatus: row.printability_status,
    approvalStatus: row.approval_status,
    createdAt: row.created_at,
  };
}

export default async function versionsRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { projectId: string }; Body: CreateVersionBody }>(
    "/projects/:projectId/versions",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { fileName, fileSize } = request.body ?? {};
      const { projectId } = request.params;

      if (typeof fileName !== "string" || !fileName) {
        reply.code(400);
        return { success: false, error: "fileName is required" };
      }
      const extension = extensionOf(fileName);
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        reply.code(400);
        return { success: false, error: "File must be an STL, OBJ, or 3MF file" };
      }
      if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
        reply.code(400);
        return { success: false, error: "File must be under 200MB" };
      }

      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Projects are not configured" };
      }

      try {
        if (!(await isProjectOwner(supabase, projectId, request.userId!))) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }

        const versionId = ulid();
        const filePath = `${projectId}/${versionId}.${extension}`;

        const { data: versionRow, error: rpcError } = await supabase
          .rpc("create_version", {
            p_id: versionId,
            p_project_id: projectId,
            p_file_name: fileName,
            p_file_path: filePath,
            p_file_format: extension,
            p_file_size_bytes: fileSize,
            p_uploaded_by_user_id: request.userId,
          })
          .single();

        if (rpcError) {
          app.log.error(rpcError, "Failed to allocate version");
          reply.code(502);
          return { success: false, error: "Failed to create version, please try again" };
        }

        const { data: upload, error: uploadError } = await supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(filePath);
        if (uploadError) {
          app.log.error(uploadError, "Failed to create signed upload URL");
          reply.code(502);
          return { success: false, error: "Failed to create version, please try again" };
        }

        return {
          success: true,
          data: {
            versionId,
            versionNumber: (versionRow as VersionRow).version_number,
            uploadUrl: upload.signedUrl,
          },
        };
      } catch (err) {
        app.log.error(err, "Version creation threw");
        reply.code(502);
        return { success: false, error: "Failed to create version, please try again" };
      }
    },
  );

  app.post<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId/finalize",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId } = request.params;
      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Projects are not configured" };
      }

      try {
        if (!(await isProjectOwner(supabase, projectId, request.userId!))) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }

        const { data: current, error: currentError } = await supabase
          .from("versions")
          .select("*")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (currentError) {
          app.log.error(currentError, "Failed to look up version");
          reply.code(502);
          return { success: false, error: "Failed to finalize version" };
        }
        if (!current) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }

        const currentRow = current as VersionRow;

        const { data: currentBlob, error: currentDownloadError } = await supabase.storage
          .from(BUCKET)
          .download(currentRow.file_path);
        if (currentDownloadError || !currentBlob) {
          app.log.error(currentDownloadError, "Failed to download current version file");
          reply.code(502);
          return { success: false, error: "Failed to read uploaded file" };
        }

        const currentBuffer = await currentBlob.arrayBuffer();
        const currentGeoResult = await loadMeshGeometryServer(
          currentBuffer,
          currentRow.file_format as "stl" | "obj" | "3mf",
        );
        if (!currentGeoResult.success) {
          reply.code(422);
          return { success: false, error: currentGeoResult.error };
        }

        let previousRow: VersionRow | null = null;
        if (currentRow.version_number > 1) {
          const { data: prev, error: prevError } = await supabase
            .from("versions")
            .select("*")
            .eq("project_id", projectId)
            .eq("version_number", currentRow.version_number - 1)
            .maybeSingle();
          if (prevError) {
            app.log.error(prevError, "Failed to look up previous version");
            reply.code(502);
            return { success: false, error: "Failed to finalize version" };
          }
          previousRow = prev as VersionRow | null;
        }

        // No previous version (v1): diff the mesh against itself so the
        // same computeVoxelDiff path still yields real per-mesh wall
        // thickness/overhang/printability stats, with zero deltas.
        let previousGeometry = currentGeoResult.data;
        let previousFormat = currentRow.file_format;
        if (previousRow) {
          const { data: prevBlob, error: prevDownloadError } = await supabase.storage
            .from(BUCKET)
            .download(previousRow.file_path);
          if (prevDownloadError || !prevBlob) {
            app.log.error(prevDownloadError, "Failed to download previous version file");
            reply.code(502);
            return { success: false, error: "Failed to read previous version file" };
          }
          const prevBuffer = await prevBlob.arrayBuffer();
          const prevGeoResult = await loadMeshGeometryServer(
            prevBuffer,
            previousRow.file_format as "stl" | "obj" | "3mf",
          );
          if (!prevGeoResult.success) {
            reply.code(422);
            return { success: false, error: prevGeoResult.error };
          }
          previousGeometry = prevGeoResult.data;
          previousFormat = previousRow.file_format;
        }

        const diffResult = computeVoxelDiff(previousGeometry, currentGeoResult.data, {
          fileFormatA: previousFormat,
          fileFormatB: currentRow.file_format,
        });
        if (!diffResult.success) {
          reply.code(422);
          return { success: false, error: diffResult.error };
        }

        const { stats } = diffResult.data;
        const changeSummary = generateChangeSummary(stats);
        const triangleCount = Math.round(stats.triangleDeltaB);

        const { error: updateError } = await supabase
          .from("versions")
          .update({
            triangle_count: triangleCount,
            change_summary: changeSummary,
            printability_status: stats.printabilityStatus,
          })
          .eq("id", versionId);
        if (updateError) {
          app.log.error(updateError, "Failed to update version with diff results");
          reply.code(502);
          return { success: false, error: "Failed to finalize version" };
        }

        if (previousRow) {
          const { error: diffCacheError } = await supabase
            .from("version_diffs")
            .upsert(
              {
                project_id: projectId,
                version_a_id: previousRow.id,
                version_b_id: versionId,
                stats,
                printability_status: stats.printabilityStatus,
                computed_at: new Date().toISOString(),
              },
              { onConflict: "version_a_id,version_b_id" },
            );
          if (diffCacheError) {
            app.log.warn(diffCacheError, "Failed to cache version diff");
          }
        }

        return {
          success: true,
          data: {
            versionId,
            triangleCount,
            changeSummary,
            printabilityStatus: stats.printabilityStatus,
          },
        };
      } catch (err) {
        app.log.error(err, "Version finalize threw");
        reply.code(502);
        return { success: false, error: "Failed to finalize version" };
      }
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/versions",
    { preHandler: requireAuth },
    async (request, reply) => {
      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Projects are not configured" };
      }

      try {
        if (!(await isProjectOwner(supabase, request.params.projectId, request.userId!))) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }

        const { data: rows, error } = await supabase
          .from("versions")
          .select("*")
          .eq("project_id", request.params.projectId)
          .order("version_number", { ascending: false });
        if (error) {
          app.log.error(error, "Failed to list versions");
          reply.code(502);
          return { success: false, error: "Failed to load versions" };
        }

        return { success: true, data: (rows as VersionRow[]).map(toVersionSummary) };
      } catch (err) {
        app.log.error(err, "Version list threw");
        reply.code(502);
        return { success: false, error: "Failed to load versions" };
      }
    },
  );

  app.get<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId } = request.params;
      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Projects are not configured" };
      }

      try {
        if (!(await isProjectOwner(supabase, projectId, request.userId!))) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }

        const { data: row, error } = await supabase
          .from("versions")
          .select("*")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to load version");
          reply.code(502);
          return { success: false, error: "Failed to load version" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }

        const versionRow = row as VersionRow;
        const { data: download, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(versionRow.file_path, DOWNLOAD_URL_TTL_SECONDS);
        if (downloadError) {
          app.log.error(downloadError, "Failed to create signed download URL");
          reply.code(502);
          return { success: false, error: "This version's file is unavailable" };
        }

        let previousVersionId: string | null = null;
        if (versionRow.version_number > 1) {
          const { data: prev } = await supabase
            .from("versions")
            .select("id")
            .eq("project_id", projectId)
            .eq("version_number", versionRow.version_number - 1)
            .maybeSingle();
          previousVersionId = (prev as { id: string } | null)?.id ?? null;
        }

        return {
          success: true,
          data: {
            ...toVersionSummary(versionRow),
            downloadUrl: download.signedUrl,
            previousVersionId,
          },
        };
      } catch (err) {
        app.log.error(err, "Version lookup threw");
        reply.code(502);
        return { success: false, error: "Failed to load version" };
      }
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/versions.zip",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId } = request.params;
      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Projects are not configured" };
      }

      if (!(await isProjectOwner(supabase, projectId, request.userId!))) {
        reply.code(404);
        return { success: false, error: "Project not found" };
      }

      const { data: rows, error } = await supabase
        .from("versions")
        .select("id, version_number, file_name, file_path")
        .eq("project_id", projectId)
        .order("version_number", { ascending: true });
      if (error) {
        app.log.error(error, "Failed to list versions for zip");
        reply.code(502);
        return { success: false, error: "Failed to build archive" };
      }
      const versionRows = (rows ?? []) as Array<{
        id: string;
        version_number: number;
        file_name: string;
        file_path: string;
      }>;
      if (versionRows.length === 0) {
        reply.code(404);
        return { success: false, error: "No versions to download" };
      }

      const archive = archiver("zip", { zlib: { level: 9 } });
      reply.header("Content-Type", "application/zip");
      reply.header("Content-Disposition", `attachment; filename="project-${projectId}-versions.zip"`);
      reply.send(archive);

      archive.on("error", (err) => {
        app.log.error(err, "Archive stream error");
      });

      for (const version of versionRows) {
        const { data: blob, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .download(version.file_path);
        if (downloadError || !blob) {
          app.log.warn(downloadError, `Skipping version ${version.id} in zip — download failed`);
          continue;
        }
        const buffer = Buffer.from(await blob.arrayBuffer());
        archive.append(buffer, { name: `v${version.version_number}-${version.file_name}` });
      }

      await archive.finalize();
    },
  );
}
