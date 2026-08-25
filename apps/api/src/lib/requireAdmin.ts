import type { FastifyRequest, FastifyReply } from "fastify";
import { getSupabase } from "./supabase.js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Shared with subscription.ts so admin accounts also get permanent,
 * never-restricted product access (see getAccountAccess()) without
 * duplicating the ADMIN_EMAILS parsing. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Must run after requireAuth (needs request.userId already set). Looks up
 * the caller's email via admin.getUserById — requireAuth doesn't retain the
 * Supabase User object on request, so this is a second lookup rather than
 * extending FastifyRequest with email (keeps requireAuth general-purpose;
 * admin-gating is the only caller that needs email).
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    reply.code(500).send({ success: false, error: "Auth is not configured" });
    return;
  }

  const { data, error } = await supabase.auth.admin.getUserById(request.userId!);
  const email = data?.user?.email;
  if (error || !isAdminEmail(email)) {
    reply.code(403).send({ success: false, error: "Admin access required" });
    return;
  }
}
