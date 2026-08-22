import type { FastifyReply } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectAccess } from "./ownership.js";
import { getAccountAccess } from "./subscription.js";

/**
 * Gates a *mutation* on a project that isn't the auto-seeded Sample
 * Project (see seedSampleProject.ts) — comment, approve/reject, delete a
 * version, upload a slicer profile or print photo, etc. Pro/Team users are
 * unrestricted — this uses getAccountAccess() (not a raw tier === "pro"
 * check) specifically so a Team owner (own tier "team") and a team member
 * with no subscription of their own (riding the owner's seats, own tier
 * "free" but viaTeamMembership) both count as unrestricted, same as
 * requireActiveAccess.ts does for its own gate.
 *
 * A downgraded former-Pro user hits this too (their own projects aren't
 * exempt just because they used to be Pro) — per the pricing FAQ, existing
 * history is retained and stays *readable* after a downgrade, but creating
 * or changing anything on it requires resubscribing. Read routes (list/get
 * a project, its versions, its comments, its diff) don't call this at all
 * — see requireProjectReadAccess below.
 *
 * Call after getProjectAccess() has already confirmed access.role is
 * non-null (404 case handled by the caller); this only decides the
 * 403-vs-allow question.
 *
 * NOT for uploading new versions — see requireProUploadAccess below. The
 * Sample Project ships with its two versions pre-seeded (see
 * seedSampleProject.ts); free users explore those, they don't add more.
 */
export async function requireProjectWriteAccess(
  supabase: SupabaseClient,
  userId: string,
  access: ProjectAccess,
  reply: FastifyReply,
): Promise<boolean> {
  if (access.isSample) return true;

  const { status } = await getAccountAccess(supabase, userId);
  if (status === "pro") return true;

  reply.code(403).send({
    success: false,
    error: "Subscribe to Pro to use this feature. Try it on the Sample Project first.",
    code: "subscription_required",
  });
  return false;
}

/**
 * Uploading a new version is Pro/Team-only everywhere, including the
 * Sample Project — unlike requireProjectTierAccess, isSample grants no
 * exemption here. Same call contract: after getProjectAccess() confirms
 * access.role is non-null.
 */
export async function requireProUploadAccess(
  supabase: SupabaseClient,
  userId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const { status } = await getAccountAccess(supabase, userId);
  if (status === "pro") return true;

  reply.code(403).send({
    success: false,
    error: "Subscribe to Pro to upload new versions.",
    code: "subscription_required",
  });
  return false;
}
