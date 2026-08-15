import type { FastifyRequest, FastifyReply } from "fastify";
import { getSupabase } from "./supabase.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

/**
 * Verifies the bearer token against Supabase Auth and sets request.userId.
 * Register as a preHandler on routes that need a logged-in user — health,
 * waitlist, and share stay open (see plan: Free tier's anonymous entry point).
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Try Bearer token first, then fall back to Supabase session cookie
  let token: string | null = null;

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    // Try to extract from Supabase session cookie
    const cookies = request.cookies;
    if (cookies) {
      const supabaseSession = Object.entries(cookies)
        .find(([key]) => key.startsWith("sb-") && key.endsWith("-auth-token"))?.[1];

      if (supabaseSession) {
        try {
          const session = JSON.parse(supabaseSession);
          token = session?.access_token || null;
        } catch {
          // Cookie parsing failed, token remains null
        }
      }
    }
  }

  if (!token) {
    reply.code(401).send({ success: false, error: "Authentication required" });
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    reply.code(500).send({ success: false, error: "Auth is not configured" });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    reply.code(401).send({ success: false, error: "Invalid or expired session" });
    return;
  }

  request.userId = data.user.id;
}
