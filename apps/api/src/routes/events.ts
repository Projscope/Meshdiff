import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/requireAuth.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { recordEvent } from "../lib/productEvents.js";

interface ClientEventBody {
  event?: string;
  surface?: string;
}

// Only events that genuinely originate in the browser. Everything else
// (first_upload, share_created, ...) is recorded server-side where it
// happens, so a client can't claim it.
const SURFACE_PATTERN = /^[a-z0-9_]{1,40}$/;
const PAYWALL_REPEAT_MS = 3_600_000;
const lastPaywallAt = new Map<string, number>();

export default async function eventsRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  app.post<{ Body: ClientEventBody }>("/events", { preHandler: requireAuth }, async (request, reply) => {
    const { event, surface } = request.body ?? {};
    if (event !== "paywall_viewed" || typeof surface !== "string" || !SURFACE_PATTERN.test(surface)) {
      reply.code(400);
      return { success: false, error: "Unsupported event" };
    }

    // The same prompt re-rendering shouldn't inflate the count: one per user
    // per surface per hour.
    const key = `${request.userId}:${surface}`;
    const now = Date.now();
    const last = lastPaywallAt.get(key);
    if (last === undefined || now - last >= PAYWALL_REPEAT_MS) {
      lastPaywallAt.set(key, now);
      recordEvent(request.supabase!, request.userId!, "paywall_viewed", { surface });
    }
    return { success: true, data: {} };
  });
}
