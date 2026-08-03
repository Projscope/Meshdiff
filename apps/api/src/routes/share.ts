import type { FastifyInstance } from "fastify";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_EXTENSIONS = new Set(["stl", "obj", "3mf"]);
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXPIRY_DAYS = new Set([1, 3, 7]);
const DOWNLOAD_URL_TTL_SECONDS = 60;
const BUCKET = "share-meshes";

interface FileMeta {
  name: string;
  size: number;
}

interface CreateShareBody {
  mode?: "voxel" | "surface";
  toleranceMm?: number;
  expiresInDays?: number;
  fileA?: FileMeta;
  fileB?: FileMeta;
}

function sanitizeFilename(name: string): string {
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const base = name.slice(0, name.length - extension.length);
  const safeBase = base.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 100) || "file";
  const safeExtension = extension.replace(/[^a-zA-Z0-9.]/g, "");
  return `${safeBase}${safeExtension}`;
}

function extensionOf(name: string): string {
  return name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
}

function validateFile(file: FileMeta | undefined, label: string): string | null {
  if (!file || !file.name || typeof file.size !== "number") {
    return `${label} is required`;
  }
  if (!ALLOWED_EXTENSIONS.has(extensionOf(file.name))) {
    return `${label} must be an STL, OBJ, or 3MF file`;
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return `${label} must be under 50MB`;
  }
  return null;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function shareRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateShareBody }>("/share", async (request, reply) => {
    const { mode, toleranceMm, expiresInDays, fileA, fileB } = request.body ?? {};

    if (mode !== "voxel" && mode !== "surface") {
      reply.code(400);
      return { success: false, error: "mode must be 'voxel' or 'surface'" };
    }
    if (typeof toleranceMm !== "number" || !Number.isFinite(toleranceMm) || toleranceMm < 0) {
      reply.code(400);
      return { success: false, error: "toleranceMm must be a non-negative number" };
    }
    if (typeof expiresInDays !== "number" || !ALLOWED_EXPIRY_DAYS.has(expiresInDays)) {
      reply.code(400);
      return { success: false, error: "expiresInDays must be 1, 3, or 7" };
    }
    const fileAError = validateFile(fileA, "fileA");
    if (fileAError) {
      reply.code(400);
      return { success: false, error: fileAError };
    }
    const fileBError = validateFile(fileB, "fileB");
    if (fileBError) {
      reply.code(400);
      return { success: false, error: fileBError };
    }

    const supabase = getSupabase();
    if (!supabase) {
      app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
      reply.code(500);
      return { success: false, error: "Sharing is not configured" };
    }

    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiresInDays! * 24 * 60 * 60 * 1000).toISOString();
    const fileAPath = `${id}/a-${sanitizeFilename(fileA!.name)}`;
    const fileBPath = `${id}/b-${sanitizeFilename(fileB!.name)}`;

    try {
      const { error: insertError } = await supabase.from("shares").insert({
        id,
        expires_at: expiresAt,
        mode,
        tolerance_mm: toleranceMm,
        file_a_name: fileA!.name,
        file_b_name: fileB!.name,
        file_a_path: fileAPath,
        file_b_path: fileBPath,
      });
      if (insertError) {
        app.log.error(insertError, "Failed to insert share row");
        reply.code(502);
        return { success: false, error: "Failed to create share, please try again" };
      }

      const shareUrl = `${request.headers.origin ?? "http://localhost:5173"}/?share=${id}`;

      // Best-effort: this is a permanent log for the future admin dashboard,
      // independent of the shares row's lifecycle (delete_expired_shares()
      // purges shares but never touches share_stats). A failure here
      // shouldn't block the actual share creation.
      const { error: statsError } = await supabase.from("share_stats").insert({
        share_id: id,
        expires_in_days: expiresInDays,
        share_url: shareUrl,
      });
      if (statsError) {
        app.log.warn(statsError, "Failed to record share_stats row");
      }

      const [uploadA, uploadB] = await Promise.all([
        supabase.storage.from(BUCKET).createSignedUploadUrl(fileAPath),
        supabase.storage.from(BUCKET).createSignedUploadUrl(fileBPath),
      ]);
      if (uploadA.error || uploadB.error) {
        app.log.error({ a: uploadA.error, b: uploadB.error }, "Failed to create signed upload URLs");
        reply.code(502);
        return { success: false, error: "Failed to create share, please try again" };
      }

      return {
        success: true,
        data: {
          id,
          expiresAt,
          url: shareUrl,
          uploadUrlA: uploadA.data.signedUrl,
          uploadUrlB: uploadB.data.signedUrl,
        },
      };
    } catch (err) {
      app.log.error(err, "Share creation threw");
      reply.code(502);
      return { success: false, error: "Failed to create share, please try again" };
    }
  });

  app.get<{ Params: { id: string } }>("/share/:id", async (request, reply) => {
    const supabase = getSupabase();
    if (!supabase) {
      app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
      reply.code(500);
      return { success: false, error: "Sharing is not configured" };
    }

    try {
      const { data: row, error } = await supabase
        .from("shares")
        .select("mode, tolerance_mm, expires_at, file_a_name, file_b_name, file_a_path, file_b_path")
        .eq("id", request.params.id)
        .maybeSingle();

      if (error) {
        app.log.error(error, "Failed to look up share");
        reply.code(502);
        return { success: false, error: "Failed to load share" };
      }
      if (!row) {
        reply.code(404);
        return { success: false, error: "Share link not found" };
      }
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        reply.code(410);
        return { success: false, error: "This share link has expired" };
      }

      const [downloadA, downloadB] = await Promise.all([
        supabase.storage.from(BUCKET).createSignedUrl(row.file_a_path, DOWNLOAD_URL_TTL_SECONDS),
        supabase.storage.from(BUCKET).createSignedUrl(row.file_b_path, DOWNLOAD_URL_TTL_SECONDS),
      ]);
      if (downloadA.error || downloadB.error) {
        app.log.error(
          { a: downloadA.error, b: downloadB.error },
          "Failed to create signed download URLs",
        );
        reply.code(502);
        return { success: false, error: "This share's files are unavailable" };
      }

      return {
        success: true,
        data: {
          mode: row.mode,
          toleranceMm: row.tolerance_mm,
          fileA: { filename: row.file_a_name, downloadUrl: downloadA.data.signedUrl },
          fileB: { filename: row.file_b_name, downloadUrl: downloadB.data.signedUrl },
        },
      };
    } catch (err) {
      app.log.error(err, "Share retrieval threw");
      reply.code(502);
      return { success: false, error: "Failed to load share" };
    }
  });
}
