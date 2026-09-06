import type { FastifyRequest, FastifyReply } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
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
/** Resolves ADMIN_EMAILS to actual user ids — needed to fan out
 * notifications (see notifyFeedbackSubmitted in notify.ts), which
 * references auth.users(id), not an email. Paginates listUsers() the same
 * way seedApprovalTest.ts's findUserByEmail() does; fine at this scale
 * (ADMIN_EMAILS is a short, hand-maintained list). */
export async function getAdminUserIds(supabase: SupabaseClient): Promise<string[]> {
  if (ADMIN_EMAILS.length === 0) return [];
  const ids: string[] = [];
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users) {
      if (isAdminEmail(u.email)) ids.push(u.id);
    }
    if (data.users.length < 200) break;
  }
  return ids;
}

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
