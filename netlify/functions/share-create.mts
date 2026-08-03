import { createClient } from "@supabase/supabase-js";

const ALLOWED_EXTENSIONS = new Set(["stl", "obj", "3mf"]);
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXPIRY_DAYS = new Set([1, 3, 7]);
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

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

/**
 * Same logic as apps/api/src/routes/share.ts's POST handler, adapted to
 * Netlify's function runtime (see netlify/functions/waitlist.mts for the
 * established pattern). Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * set in the Netlify site's environment variables — never committed.
 */
export default async function shareCreate(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  let body: CreateShareBody;
  try {
    body = (await req.json()) as CreateShareBody;
  } catch {
    return json({ success: false, error: "Invalid request body" }, 400);
  }

  const { mode, toleranceMm, expiresInDays, fileA, fileB } = body;

  if (mode !== "voxel" && mode !== "surface") {
    return json({ success: false, error: "mode must be 'voxel' or 'surface'" }, 400);
  }
  if (typeof toleranceMm !== "number" || !Number.isFinite(toleranceMm) || toleranceMm < 0) {
    return json({ success: false, error: "toleranceMm must be a non-negative number" }, 400);
  }
  if (typeof expiresInDays !== "number" || !ALLOWED_EXPIRY_DAYS.has(expiresInDays)) {
    return json({ success: false, error: "expiresInDays must be 1, 3, or 7" }, 400);
  }
  const fileAError = validateFile(fileA, "fileA");
  if (fileAError) return json({ success: false, error: fileAError }, 400);
  const fileBError = validateFile(fileB, "fileB");
  if (fileBError) return json({ success: false, error: fileBError }, 400);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
    return json({ success: false, error: "Sharing is not configured" }, 500);
  }
  const supabase = createClient(url, key);

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
      console.error("Failed to insert share row", insertError);
      return json({ success: false, error: "Failed to create share, please try again" }, 502);
    }

    const shareUrl = `${req.headers.get("origin") ?? new URL(req.url).origin}/?share=${id}`;

    // Best-effort: permanent log for the future admin dashboard, independent
    // of the shares row's lifecycle (delete_expired_shares() purges shares
    // but never touches share_stats). A failure here shouldn't block the
    // actual share creation.
    const { error: statsError } = await supabase.from("share_stats").insert({
      share_id: id,
      expires_in_days: expiresInDays,
      share_url: shareUrl,
    });
    if (statsError) {
      console.warn("Failed to record share_stats row", statsError);
    }

    const [uploadA, uploadB] = await Promise.all([
      supabase.storage.from(BUCKET).createSignedUploadUrl(fileAPath),
      supabase.storage.from(BUCKET).createSignedUploadUrl(fileBPath),
    ]);
    if (uploadA.error || uploadB.error) {
      console.error("Failed to create signed upload URLs", uploadA.error, uploadB.error);
      return json({ success: false, error: "Failed to create share, please try again" }, 502);
    }

    return json(
      {
        success: true,
        data: {
          id,
          expiresAt,
          url: shareUrl,
          uploadUrlA: uploadA.data.signedUrl,
          uploadUrlB: uploadB.data.signedUrl,
        },
      },
      200,
    );
  } catch (err) {
    console.error("Share creation threw", err);
    return json({ success: false, error: "Failed to create share, please try again" }, 502);
  }
}
