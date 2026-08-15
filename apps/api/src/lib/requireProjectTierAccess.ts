import type { FastifyReply } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectAccess } from "./ownership.js";
import { getUserTier } from "./subscription.js";

/**
 * Free users get full read/write on their own auto-seeded Sample Project
 * (see seedSampleProject.ts) — compare, delete, share, report, measure —
 * so they can see what Pro looks like before upgrading, but nothing else.
 * Pro users are unrestricted. Call after getProjectAccess() has already
 * confirmed access.role is non-null (404 case handled by the caller); this
 * only decides the 403-vs-allow question.
 *
 * NOT for uploading new versions — see requireProUploadAccess below. The
 * Sample Project ships with its two versions pre-seeded (see
 * seedSampleProject.ts); free users explore those, they don't add more.
 */
export async function requireProjectTierAccess(
  supabase: SupabaseClient,
  userId: string,
  access: ProjectAccess,
  reply: FastifyReply,
): Promise<boolean> {
  if (access.isSample) return true;

  const { tier } = await getUserTier(supabase, userId);
  if (tier === "pro") return true;

  reply.code(403).send({
    success: false,
    error: "Subscribe to Pro to use this feature. Try it on the Sample Project first.",
    code: "subscription_required",
  });
  return false;
}

/**
 * Uploading a new version is Pro-only everywhere, including the Sample
 * Project — unlike requireProjectTierAccess, isSample grants no exemption
 * here. Same call contract: after getProjectAccess() confirms access.role
 * is non-null.
 */
export async function requireProUploadAccess(
  supabase: SupabaseClient,
  userId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const { tier } = await getUserTier(supabase, userId);
  if (tier === "pro") return true;

  reply.code(403).send({
    success: false,
    error: "Subscribe to Pro to upload new versions.",
    code: "subscription_required",
  });
  return false;
}
