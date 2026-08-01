const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ConvertKitSubscribeResponse {
  subscription?: { id: number };
  error?: string;
  message?: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Same logic as apps/api/src/routes/waitlist.ts, adapted to Netlify's
 * function runtime. Deployed alongside the static site so the frontend
 * has a same-origin endpoint in production without needing a separately
 * hosted backend (see apps/web/src/lib/api.ts).
 *
 * Requires CONVERTKIT_API_KEY and CONVERTKIT_FORM_ID set as environment
 * variables in the Netlify site's dashboard (Site settings > Environment
 * variables) — never committed to the repo.
 */
export default async function waitlist(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  let email: string | undefined;
  try {
    const body = (await req.json()) as { email?: string };
    email = body.email?.trim();
  } catch {
    return json({ success: false, error: "Invalid request body" }, 400);
  }

  if (!email || !EMAIL_PATTERN.test(email)) {
    return json({ success: false, error: "A valid email address is required" }, 400);
  }

  const apiKey = process.env.CONVERTKIT_API_KEY;
  const formId = process.env.CONVERTKIT_FORM_ID;
  if (!apiKey || !formId) {
    console.error("CONVERTKIT_API_KEY or CONVERTKIT_FORM_ID is not configured");
    return json({ success: false, error: "Waitlist signup is not configured" }, 500);
  }

  try {
    const response = await fetch(`https://api.convertkit.com/v3/forms/${formId}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, email }),
    });
    const data = (await response.json()) as ConvertKitSubscribeResponse;

    if (!response.ok || data.error) {
      console.error("ConvertKit subscribe failed", response.status, data);
      return json({ success: false, error: "Waitlist signup failed, please try again" }, 502);
    }

    return json({ success: true, data: { subscribed: true } }, 200);
  } catch (err) {
    console.error("ConvertKit request threw", err);
    return json({ success: false, error: "Waitlist signup failed, please try again" }, 502);
  }
}
