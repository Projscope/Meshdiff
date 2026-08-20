import type { FastifyRequest, FastifyReply } from "fastify";
import { getSupabase } from "./supabase.js";
import { getAccountAccess } from "./subscription.js";

/**
 * Blocks a restricted account (no Pro/Team subscription of their own, and
 * not a member of a team whose owner has an active Team subscription —
 * see getAccountAccess()'s viaTeamMembership check) from everything except
 * what's explicitly left off this preHandler — see the plan: GET /projects,
 * DELETE /projects/:id, GET /workspace, and all of billing.ts stay
 * reachable so a restricted user can still see/delete their projects and
 * actually subscribe. Must run after requireAuth (needs request.userId
 * already set).
 */
export async function requireActiveAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    reply.code(500).send({ success: false, error: "Billing is not configured" });
    return;
  }

  const access = await getAccountAccess(supabase, request.userId!);
  if (access.status === "restricted") {
    reply.code(403).send({
      success: false,
      error: "Subscribe to Pro to keep using Meshdiff.",
      code: "subscription_required",
    });
  }
}
