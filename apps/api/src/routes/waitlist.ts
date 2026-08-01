import type { FastifyInstance } from "fastify";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ConvertKitSubscribeResponse {
  subscription?: { id: number };
  error?: string;
  message?: string;
}

export default async function waitlistRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { email?: string } }>("/waitlist", async (request, reply) => {
    const email = request.body?.email?.trim();
    if (!email || !EMAIL_PATTERN.test(email)) {
      reply.code(400);
      return { success: false, error: "A valid email address is required" };
    }

    const apiKey = process.env.CONVERTKIT_API_KEY;
    const formId = process.env.CONVERTKIT_FORM_ID;
    if (!apiKey || !formId) {
      app.log.error("CONVERTKIT_API_KEY or CONVERTKIT_FORM_ID is not configured");
      reply.code(500);
      return { success: false, error: "Waitlist signup is not configured" };
    }

    try {
      const response = await fetch(
        `https://api.convertkit.com/v3/forms/${formId}/subscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: apiKey, email }),
        },
      );
      const data = (await response.json()) as ConvertKitSubscribeResponse;

      if (!response.ok || data.error) {
        app.log.error({ status: response.status, data }, "ConvertKit subscribe failed");
        reply.code(502);
        return { success: false, error: "Waitlist signup failed, please try again" };
      }

      return { success: true, data: { subscribed: true } };
    } catch (err) {
      app.log.error(err, "ConvertKit request threw");
      reply.code(502);
      return { success: false, error: "Waitlist signup failed, please try again" };
    }
  });
}
