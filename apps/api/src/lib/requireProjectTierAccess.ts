import type { FastifyReply } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectAccess } from "./ownership.js";
import { getAccountAccess, hasSyncAccess } from "./subscription.js";
import { recordEvent } from "./productEvents.js";

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
  if (status === "pro") {
    // The route pattern (e.g. "POST /projects/:projectId/versions/:versionId/comments")
    // says which gated feature this was without every call site passing one.
    recordEvent(supabase, userId, "first_pro_feature_used", {
      feature: `${reply.request.method} ${reply.request.routeOptions?.url ?? reply.request.url}`,
    });
    return true;
  }

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

/**
 * Desktop sync (local-mode versions, the comment change feed) is a Team
 * feature. Everyone else gets a 403 with a stable `team_required` code the
 * client can turn into an upgrade prompt rather than a generic failure.
 */
export async function requireSyncAccess(
  supabase: SupabaseClient,
  userId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const access = await getAccountAccess(supabase, userId);
  if (await hasSyncAccess(supabase, userId, access)) return true;

  reply.code(403).send({
    success: false,
    error: "Syncing from the desktop app is part of the Team plan.",
    code: "team_required",
  });
  return false;
}
