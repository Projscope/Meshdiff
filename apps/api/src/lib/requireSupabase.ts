import type { FastifyRequest, FastifyReply } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase.js";

declare module "fastify" {
  interface FastifyRequest {
    supabase?: SupabaseClient;
  }
}

/**
 * Attaches request.supabase, or 500s once if Supabase isn't configured —
 * every route handler used to repeat this null-check-and-500 block
 * individually (34 occurrences across 9 route files). Register once per
 * route file via app.addHook("preHandler", requireSupabase); Fastify scopes
 * a hook registered this way to every route in that file's encapsulation
 * context automatically, so no individual route's preHandler array needs
 * to change. Safe to run even on routes with no auth (e.g. billing.ts's
 * Stripe webhook) since this only checks configuration, not identity.
 */
export async function requireSupabase(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    reply.code(500).send({ success: false, error: "Service is not configured" });
    return;
  }
  request.supabase = supabase;
}
