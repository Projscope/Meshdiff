import { createClient } from "@supabase/supabase-js";

const BUCKET = "share-meshes";
const DOWNLOAD_URL_TTL_SECONDS = 60;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Same logic as apps/api/src/routes/share.ts's GET handler, adapted to
 * Netlify's function runtime. Reads `id` from the query string (see
 * apps/web/src/lib/api.ts's shareGetEndpoint), consistent with
 * netlify/functions/waitlist.mts's plain-Request/Response style.
 */
export default async function shareGet(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return json({ success: false, error: "Missing share id" }, 400);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
    return json({ success: false, error: "Sharing is not configured" }, 500);
  }
  const supabase = createClient(url, key);

  try {
    const { data: row, error } = await supabase
      .from("shares")
      .select("mode, tolerance_mm, expires_at, file_a_name, file_b_name, file_a_path, file_b_path")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Failed to look up share", error);
      return json({ success: false, error: "Failed to load share" }, 502);
    }
    if (!row) {
      return json({ success: false, error: "Share link not found" }, 404);
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return json({ success: false, error: "This share link has expired" }, 410);
    }

    const [downloadA, downloadB] = await Promise.all([
      supabase.storage.from(BUCKET).createSignedUrl(row.file_a_path, DOWNLOAD_URL_TTL_SECONDS),
      supabase.storage.from(BUCKET).createSignedUrl(row.file_b_path, DOWNLOAD_URL_TTL_SECONDS),
    ]);
    if (downloadA.error || downloadB.error) {
      console.error("Failed to create signed download URLs", downloadA.error, downloadB.error);
      return json({ success: false, error: "This share's files are unavailable" }, 502);
    }

    return json(
      {
        success: true,
        data: {
          mode: row.mode,
          toleranceMm: row.tolerance_mm,
          fileA: { filename: row.file_a_name, downloadUrl: downloadA.data.signedUrl },
          fileB: { filename: row.file_b_name, downloadUrl: downloadB.data.signedUrl },
        },
      },
      200,
    );
  } catch (err) {
    console.error("Share retrieval threw", err);
    return json({ success: false, error: "Failed to load share" }, 502);
  }
}
