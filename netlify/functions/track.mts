import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Minimal shape of Netlify Functions v2's second handler argument — not
// imported from @netlify/functions since that package isn't a dependency
// here (Netlify's build/runtime injects it automatically; no existing
// function in this repo imports its types either, see waitlist.mts).
interface NetlifyContext {
  geo?: { country?: { code?: string } };
  ip?: string;
}

interface TrackBody {
  path?: string;
  referrer?: string;
  language?: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Reduces a referrer URL to just its hostname, treating same-origin,
 * empty, or unparseable values as direct traffic — internal navigation
 * and query strings are meaningless (and privacy-sensitive) noise in a
 * referrer breakdown. */
function referrerHost(referrer: string | undefined, ownOrigin: string): string {
  if (!referrer) return "(direct)";
  try {
    const url = new URL(referrer);
    if (url.origin === ownOrigin) return "(direct)";
    return url.hostname;
  } catch {
    return "(direct)";
  }
}

/** Strips query string/hash defensively (the client should already send a
 * bare pathname, but never trust that from an untrusted POST body), and
 * normalizes away a trailing slash — "/features" and "/features/" are the
 * same page, but without this they'd land as two separate Top Pages rows
 * depending on how the link was typed/clicked. The root path is the one
 * exception: "/" has no non-slash form to normalize to. */
/** Coarse mobile/tablet/desktop classification from the User-Agent header
 * alone — the same simplified heuristic privacy-friendly analytics tools
 * commonly use, not full device/browser fingerprinting. iPadOS 13+ reports
 * as a desktop Mac UA and can't be reliably told apart from one server-side
 * without a client-side touch-support hint, so it's counted as desktop —
 * an accepted limitation rather than added client-side complexity. */
function classifyDevice(userAgent: string): string {
  if (/iPad|Android(?!.*Mobile)|Tablet|Silk/i.test(userAgent)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(userAgent)) return "mobile";
  return "desktop";
}

/** Coarse browser family from the User-Agent header — order matters, since
 * most browser UAs impersonate several others for compatibility (Edge and
 * Opera both include "Chrome" and "Safari" tokens; Chrome itself includes
 * "Safari"). Checked most-specific-first so a real Chrome UA doesn't get
 * misclassified as Safari, etc. Same "good enough for a breakdown chart"
 * scope as classifyDevice() above, not a full UA-parsing library. */
function classifyBrowser(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\/|Opera/.test(userAgent)) return "Opera";
  if (/SamsungBrowser/.test(userAgent)) return "Samsung Internet";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  if (/MSIE|Trident/.test(userAgent)) return "Internet Explorer";
  return "Other";
}

function cleanPath(path: string | undefined): string {
  if (!path) return "/";
  const withoutQuery = path.split("?")[0]!.split("#")[0]!;
  const trimmed = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
  return trimmed || "/";
}

/**
 * Self-hosted, cookie-less pageview tracker — see plan "Self-hosted
 * privacy-friendly analytics". Runs alongside Google Analytics for now
 * (see apps/web/src/lib/analytics.ts), not a replacement yet.
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ANALYTICS_HASH_SALT
 * set in the Netlify site's environment variables — never committed.
 */
export default async function track(req: Request, context: NetlifyContext): Promise<Response> {
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  let body: TrackBody;
  try {
    body = (await req.json()) as TrackBody;
  } catch {
    return json({ success: false, error: "Invalid request body" }, 400);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const salt = process.env.ANALYTICS_HASH_SALT;
  if (!url || !key || !salt) {
    console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or ANALYTICS_HASH_SALT is not configured");
    return json({ success: false, error: "Analytics is not configured" }, 500);
  }
  const supabase = createClient(url, key);

  const day = todayUTC();
  const path = cleanPath(body.path);
  const ownOrigin = req.headers.get("origin") ?? new URL(req.url).origin;
  const referrer = referrerHost(body.referrer, ownOrigin);
  const language = (body.language ?? "unknown").slice(0, 35);

  // context.geo/context.ip are Netlify Functions v2-only — populated by
  // Netlify's edge in production, generally absent/mocked in `netlify dev`
  // local runs. Default gracefully rather than erroring either way.
  const country = context.geo?.country?.code ?? "unknown";
  const ip = context.ip ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const visitorHash = createHash("sha256").update(`${ip}|${userAgent}|${day}|${salt}`).digest("hex");
  const device = classifyDevice(userAgent);
  const browser = classifyBrowser(userAgent);

  try {
    const { data: inserted, error: dedupeError } = await supabase
      .from("analytics_visitor_daily")
      .insert({ visitor_hash: visitorHash, day })
      .select("visitor_hash")
      .maybeSingle();
    // A unique-constraint violation (already seen today) isn't a real
    // error — it's the expected "not a new visitor" case. Anything else is.
    if (dedupeError && dedupeError.code !== "23505") {
      console.error("Failed to record visitor dedupe row", dedupeError);
    }
    const isNewVisitor = !!inserted;

    const dimensions: Array<[string, string]> = [
      ["total", "total"],
      ["page", path],
      ["country", country],
      ["language", language],
      ["referrer", referrer],
      ["device", device],
      ["browser", browser],
    ];

    for (const [dimensionType, dimensionValue] of dimensions) {
      const { error } = await supabase.rpc("increment_analytics_rollup", {
        p_day: day,
        p_dimension_type: dimensionType,
        p_dimension_value: dimensionValue,
        p_new_visitor: isNewVisitor,
      });
      if (error) {
        console.error(`Failed to upsert rollup for ${dimensionType}=${dimensionValue}`, error);
      }
    }

    return json({ success: true }, 200);
  } catch (err) {
    console.error("Analytics tracking threw", err);
    return json({ success: false, error: "Failed to record pageview" }, 502);
  }
}
