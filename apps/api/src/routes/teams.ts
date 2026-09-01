import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/requireAuth.js";
import { requireActiveAccess } from "../lib/requireActiveAccess.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { getUserTier, INACTIVE_SUBSCRIPTION_STATUSES } from "../lib/subscription.js";
import { toVersionSummary, type VersionRow } from "./versions.js";
import { logTeamAudit } from "../lib/teamAuditLog.js";

interface CreateTeamBody {
  name?: string;
}

interface AddMemberBody {
  email?: string;
  role?: "admin" | "approver" | "member";
}

interface UpdateMemberRoleBody {
  role?: "admin" | "approver" | "member";
}

export default async function teamsRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  app.get("/teams", { preHandler: [requireAuth, requireActiveAccess] }, async (request, reply) => {
    const supabase = request.supabase!;

    try {
      const { data: memberships, error: membershipError } = await supabase
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", request.userId);
      if (membershipError) {
        app.log.error(membershipError, "Failed to list team memberships");
        reply.code(502);
        return { success: false, error: "Failed to load teams" };
      }
      if (!memberships || memberships.length === 0) {
        return { success: true, data: [] };
      }

      const { data: teams, error: teamsError } = await supabase
        .from("teams")
        .select("id, name")
        .in(
          "id",
          memberships.map((m) => m.team_id),
        );
      if (teamsError) {
        app.log.error(teamsError, "Failed to load teams");
        reply.code(502);
        return { success: false, error: "Failed to load teams" };
      }

      const roleByTeamId = new Map(memberships.map((m) => [m.team_id, m.role]));
      const data = (teams ?? []).map((team) => ({
        id: team.id,
        name: team.name,
        myRole: roleByTeamId.get(team.id),
      }));

      return { success: true, data };
    } catch (err) {
      app.log.error(err, "Team list threw");
      reply.code(502);
      return { success: false, error: "Failed to load teams" };
    }
  });

  app.post<{ Body: CreateTeamBody }>("/teams", { preHandler: [requireAuth, requireActiveAccess] }, async (request, reply) => {
    const { name } = request.body ?? {};
    if (typeof name !== "string" || name.trim().length === 0) {
      reply.code(400);
      return { success: false, error: "name is required" };
    }

    const supabase = request.supabase!;
    const { tier } = await getUserTier(supabase, request.userId!);
    if (tier !== "team") {
      reply.code(403);
      return { success: false, error: "Upgrade to the Team plan to create a team." };
    }

    try {
      const { data: team, error } = await supabase
        .from("teams")
        .insert({ name: name.trim(), owner_user_id: request.userId })
        .select("id, name, created_at")
        .single();
      if (error) {
        if (error.code === "23505") {
          reply.code(409);
          return {
            success: false,
            error: "You already own a team — Meshdiff supports one team per Team-plan subscription.",
          };
        }
        app.log.error(error, "Failed to create team");
        reply.code(502);
        return { success: false, error: "Failed to create team, please try again" };
      }

      // The creator is always an admin — see plan: "owner is always also
      // an admin, no separate owner role needed for approval purposes."
      const { error: memberError } = await supabase
        .from("team_members")
        .insert({ team_id: team.id, user_id: request.userId, role: "admin" });
      if (memberError) {
        app.log.error(memberError, "Failed to add team creator as admin");
        reply.code(502);
        return { success: false, error: "Failed to create team, please try again" };
      }

      await logTeamAudit(supabase, app.log, {
        teamId: team.id,
        actorUserId: request.userId!,
        action: "team_created",
        summary: "Created the team",
      });

      return { success: true, data: { id: team.id, name: team.name, createdAt: team.created_at } };
    } catch (err) {
      app.log.error(err, "Team creation threw");
      reply.code(502);
      return { success: false, error: "Failed to create team, please try again" };
    }
  });

  app.get<{ Params: { teamId: string } }>(
    "/teams/:teamId",
    { preHandler: [requireAuth, requireActiveAccess] },
    async (request, reply) => {
      const { teamId } = request.params;
      const supabase = request.supabase!;

      try {
        const { data: membership } = await supabase
          .from("team_members")
          .select("role")
          .eq("team_id", teamId)
          .eq("user_id", request.userId)
          .maybeSingle();
        if (!membership) {
          reply.code(404);
          return { success: false, error: "Team not found" };
        }

        const { data: team, error: teamError } = await supabase
          .from("teams")
          .select("id, name, owner_user_id, created_at")
          .eq("id", teamId)
          .maybeSingle();
        if (teamError || !team) {
          reply.code(404);
          return { success: false, error: "Team not found" };
        }

        const { data: members, error: membersError } = await supabase
          .from("team_members")
          .select("user_id, role, joined_at")
          .eq("team_id", teamId);
        if (membersError) {
          app.log.error(membersError, "Failed to list team members");
          reply.code(502);
          return { success: false, error: "Failed to load team" };
        }

        const userIds = (members ?? []).map((m) => m.user_id);
        const { data: emailRows, error: emailError } = await supabase.rpc("get_user_emails_by_ids", {
          p_ids: userIds,
        });
        if (emailError) {
          app.log.warn(emailError, "Failed to resolve member emails");
        }
        const emailByUserId = new Map((emailRows ?? []).map((r: { id: string; email: string }) => [r.id, r.email]));

        // Seats purchased come from the owner's own subscription — not the
        // requester's, since a non-owner admin/approver viewing this page
        // has no subscription of their own to read.
        const { data: ownerSub } = await supabase
          .from("subscriptions")
          .select("tier, status, quantity")
          .eq("user_id", team.owner_user_id)
          .maybeSingle();
        const seats =
          ownerSub && ownerSub.tier === "team" && !INACTIVE_SUBSCRIPTION_STATUSES.includes(ownerSub.status)
            ? { purchased: ownerSub.quantity, used: (members ?? []).length }
            : null;

        return {
          success: true,
          data: {
            id: team.id,
            name: team.name,
            myRole: membership.role,
            // Ownership is tracked separately from team_members.role — the
            // owner is also always an admin row, but not every admin is the
            // owner. Both invite/remove access (isOwner || myRole==='admin')
            // and "can this specific row be removed" (never the owner's)
            // need to know who the owner actually is.
            isOwner: team.owner_user_id === request.userId,
            seats,
            members: (members ?? []).map((m) => ({
              userId: m.user_id,
              email: emailByUserId.get(m.user_id) ?? null,
              role: m.role,
              joinedAt: m.joined_at,
              isOwner: m.user_id === team.owner_user_id,
            })),
          },
        };
      } catch (err) {
        app.log.error(err, "Team lookup threw");
        reply.code(502);
        return { success: false, error: "Failed to load team" };
      }
    },
  );

  // Cross-project queue for the team dashboard — everything a reviewer
  // would otherwise have to visit each project individually to find.
  // Two-step (project ids, then versions in those ids) rather than a
  // Supabase embedded-join, matching this file's existing style (see
  // GET /teams above: memberships -> teams is the same shape).
  app.get<{ Params: { teamId: string } }>(
    "/teams/:teamId/pending-versions",
    { preHandler: [requireAuth, requireActiveAccess] },
    async (request, reply) => {
      const { teamId } = request.params;
      const supabase = request.supabase!;

      try {
        const { data: membership } = await supabase
          .from("team_members")
          .select("role")
          .eq("team_id", teamId)
          .eq("user_id", request.userId)
          .maybeSingle();
        if (!membership) {
          reply.code(404);
          return { success: false, error: "Team not found" };
        }

        const { data: projects, error: projectsError } = await supabase
          .from("projects")
          .select("id, name")
          .eq("team_id", teamId);
        if (projectsError) {
          app.log.error(projectsError, "Failed to list team projects");
          reply.code(502);
          return { success: false, error: "Failed to load pending versions" };
        }
        if (!projects || projects.length === 0) {
          return { success: true, data: [] };
        }
        const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

        const { data: versions, error: versionsError } = await supabase
          .from("versions")
          .select("*")
          .in(
            "project_id",
            projects.map((p) => p.id),
          )
          .eq("approval_status", "in_review") // renamed from 'pending' — see migration 0027
          .order("created_at", { ascending: true }); // oldest-waiting-first — an action queue, not a feed
        if (versionsError) {
          app.log.error(versionsError, "Failed to load pending versions");
          reply.code(502);
          return { success: false, error: "Failed to load pending versions" };
        }

        const data = (versions as VersionRow[]).map((row) => ({
          ...toVersionSummary(row),
          projectId: row.project_id,
          projectName: projectNameById.get(row.project_id) ?? "Unknown project",
        }));

        return { success: true, data };
      } catch (err) {
        app.log.error(err, "Team pending-versions threw");
        reply.code(502);
        return { success: false, error: "Failed to load pending versions" };
      }
    },
  );

  const AUDIT_LOG_PAGE_SIZE = 50;

  app.get<{ Params: { teamId: string } }>(
    "/teams/:teamId/audit-log",
    { preHandler: [requireAuth, requireActiveAccess] },
    async (request, reply) => {
      const { teamId } = request.params;
      const supabase = request.supabase!;

      try {
        const { data: membership } = await supabase
          .from("team_members")
          .select("role")
          .eq("team_id", teamId)
          .eq("user_id", request.userId)
          .maybeSingle();
        if (!membership) {
          reply.code(404);
          return { success: false, error: "Team not found" };
        }

        const { data: entries, error: entriesError } = await supabase
          .from("team_audit_log")
          .select("id, actor_user_id, action, summary, created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false })
          .limit(AUDIT_LOG_PAGE_SIZE);
        if (entriesError) {
          app.log.error(entriesError, "Failed to load audit log");
          reply.code(502);
          return { success: false, error: "Failed to load activity" };
        }
        if (!entries || entries.length === 0) {
          return { success: true, data: [] };
        }

        const actorIds = [...new Set(entries.map((e) => e.actor_user_id).filter((id): id is string => !!id))];
        const { data: emailRows, error: emailError } = await supabase.rpc("get_user_emails_by_ids", {
          p_ids: actorIds,
        });
        if (emailError) {
          app.log.warn(emailError, "Failed to resolve audit log actor emails");
        }
        const emailByUserId = new Map((emailRows ?? []).map((r: { id: string; email: string }) => [r.id, r.email]));

        const data = entries.map((e) => ({
          id: e.id,
          actorEmail: e.actor_user_id ? (emailByUserId.get(e.actor_user_id) ?? null) : null,
          action: e.action,
          summary: e.summary,
          createdAt: e.created_at,
        }));

        return { success: true, data };
      } catch (err) {
        app.log.error(err, "Team audit-log threw");
        reply.code(502);
        return { success: false, error: "Failed to load activity" };
      }
    },
  );

  app.post<{ Params: { teamId: string }; Body: AddMemberBody }>(
    "/teams/:teamId/members",
    { preHandler: [requireAuth, requireActiveAccess] },
    async (request, reply) => {
      const { teamId } = request.params;
      const { email, role } = request.body ?? {};

      if (typeof email !== "string" || !email.includes("@")) {
        reply.code(400);
        return { success: false, error: "A valid email is required" };
      }
      if (role !== "admin" && role !== "approver" && role !== "member") {
        reply.code(400);
        return { success: false, error: "role must be 'admin', 'approver', or 'member'" };
      }

      const supabase = request.supabase!;

      try {
        const { data: team } = await supabase
          .from("teams")
          .select("owner_user_id")
          .eq("id", teamId)
          .maybeSingle();
        if (!team) {
          reply.code(404);
          return { success: false, error: "Team not found" };
        }
        if (team.owner_user_id !== request.userId) {
          const { data: requesterMembership } = await supabase
            .from("team_members")
            .select("role")
            .eq("team_id", teamId)
            .eq("user_id", request.userId)
            .maybeSingle();
          if (requesterMembership?.role !== "admin") {
            reply.code(403);
            return { success: false, error: "Only the team owner or an admin can add members" };
          }
        }

        // Resolved and membership-checked before the seat-limit check below
        // so re-inviting someone already on the team gives a clear "already
        // on the team" error instead of a misleading seat-limit error when
        // the team happens to be at capacity.
        const { data: userId, error: lookupError } = await supabase.rpc("get_user_id_by_email", {
          p_email: email.trim().toLowerCase(),
        });
        if (lookupError) {
          app.log.error(lookupError, "Failed to look up user by email");
          reply.code(502);
          return { success: false, error: "Failed to add member, please try again" };
        }
        if (!userId) {
          reply.code(404);
          return { success: false, error: "No Meshdiff account found for that email" };
        }

        const { data: existingMembership } = await supabase
          .from("team_members")
          .select("user_id")
          .eq("team_id", teamId)
          .eq("user_id", userId)
          .maybeSingle();
        if (existingMembership) {
          reply.code(409);
          return { success: false, error: "That person is already on the team" };
        }

        // Seat limit, checked after confirming this is a genuinely new
        // member. Seats come from the owner's own subscription — quantity 0
        // if they're not an active Team subscriber (shouldn't normally
        // happen since POST /teams itself requires tier==='team', but a
        // lapsed/downgraded subscription after team creation should still
        // block new invites).
        const { data: ownerSub } = await supabase
          .from("subscriptions")
          .select("tier, status, quantity")
          .eq("user_id", team.owner_user_id)
          .maybeSingle();
        const purchasedSeats =
          ownerSub && ownerSub.tier === "team" && !INACTIVE_SUBSCRIPTION_STATUSES.includes(ownerSub.status)
            ? ownerSub.quantity
            : 0;

        const { count: memberCount, error: countError } = await supabase
          .from("team_members")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId);
        if (countError) {
          app.log.error(countError, "Failed to count team members");
          reply.code(502);
          return { success: false, error: "Failed to add member, please try again" };
        }

        if ((memberCount ?? 0) >= purchasedSeats) {
          reply.code(403);
          return {
            success: false,
            error: `Seat limit reached (${memberCount ?? 0}/${purchasedSeats} used). Increase your seat count in Billing to invite more members.`,
            code: "seat_limit_reached",
          };
        }

        const { error: insertError } = await supabase
          .from("team_members")
          .insert({ team_id: teamId, user_id: userId, role });
        if (insertError) {
          if (insertError.code === "23505") {
            reply.code(409);
            return { success: false, error: "That person is already on the team" };
          }
          app.log.error(insertError, "Failed to add team member");
          reply.code(502);
          return { success: false, error: "Failed to add member, please try again" };
        }

        await logTeamAudit(supabase, app.log, {
          teamId,
          actorUserId: request.userId!,
          action: "member_invited",
          summary: `Invited ${email.trim().toLowerCase()} as ${role}`,
        });

        return { success: true, data: { userId, role } };
      } catch (err) {
        app.log.error(err, "Add team member threw");
        reply.code(502);
        return { success: false, error: "Failed to add member, please try again" };
      }
    },
  );

  app.patch<{ Params: { teamId: string; userId: string }; Body: UpdateMemberRoleBody }>(
    "/teams/:teamId/members/:userId",
    { preHandler: [requireAuth, requireActiveAccess] },
    async (request, reply) => {
      const { teamId, userId: targetUserId } = request.params;
      const { role } = request.body ?? {};

      if (role !== "admin" && role !== "approver" && role !== "member") {
        reply.code(400);
        return { success: false, error: "role must be 'admin', 'approver', or 'member'" };
      }

      // Same rationale as DELETE below — changing your own role (including
      // the owner, who isn't a team_members row at all) isn't supported
      // through this endpoint, to avoid a lone admin locking themselves out.
      if (targetUserId === request.userId) {
        reply.code(400);
        return { success: false, error: "You can't change your own role" };
      }

      const supabase = request.supabase!;

      try {
        const { data: team } = await supabase
          .from("teams")
          .select("owner_user_id")
          .eq("id", teamId)
          .maybeSingle();
        if (!team) {
          reply.code(404);
          return { success: false, error: "Team not found" };
        }
        if (targetUserId === team.owner_user_id) {
          reply.code(400);
          return { success: false, error: "The team owner's role can't be changed" };
        }
        if (team.owner_user_id !== request.userId) {
          const { data: requesterMembership } = await supabase
            .from("team_members")
            .select("role")
            .eq("team_id", teamId)
            .eq("user_id", request.userId)
            .maybeSingle();
          if (requesterMembership?.role !== "admin") {
            reply.code(403);
            return { success: false, error: "Only the team owner or an admin can change member roles" };
          }
        }

        const { data: emailRows } = await supabase.rpc("get_user_emails_by_ids", { p_ids: [targetUserId] });
        const targetEmail = (emailRows as { id: string; email: string }[] | null)?.[0]?.email ?? null;

        const { data: updated, error } = await supabase
          .from("team_members")
          .update({ role })
          .eq("team_id", teamId)
          .eq("user_id", targetUserId)
          .select("user_id")
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to update team member role");
          reply.code(502);
          return { success: false, error: "Failed to update role, please try again" };
        }
        if (!updated) {
          reply.code(404);
          return { success: false, error: "Member not found" };
        }

        await logTeamAudit(supabase, app.log, {
          teamId,
          actorUserId: request.userId!,
          action: "member_role_changed",
          summary: `Changed ${targetEmail ?? targetUserId}'s role to ${role}`,
        });

        return { success: true, data: { userId: targetUserId, role } };
      } catch (err) {
        app.log.error(err, "Update team member role threw");
        reply.code(502);
        return { success: false, error: "Failed to update role, please try again" };
      }
    },
  );

  app.delete<{ Params: { teamId: string; userId: string } }>(
    "/teams/:teamId/members/:userId",
    { preHandler: [requireAuth, requireActiveAccess] },
    async (request, reply) => {
      const { teamId, userId: targetUserId } = request.params;

      // Removing yourself isn't "removing a member", it's leaving the team,
      // which isn't a feature here yet (this also covers the owner trying
      // to remove themselves — they can't, same as anyone else).
      if (targetUserId === request.userId) {
        reply.code(400);
        return { success: false, error: "You can't remove yourself from the team" };
      }

      const supabase = request.supabase!;

      try {
        const { data: team } = await supabase
          .from("teams")
          .select("owner_user_id")
          .eq("id", teamId)
          .maybeSingle();
        if (!team) {
          reply.code(404);
          return { success: false, error: "Team not found" };
        }
        if (targetUserId === team.owner_user_id) {
          reply.code(400);
          return { success: false, error: "The team owner can't be removed" };
        }
        if (team.owner_user_id !== request.userId) {
          const { data: requesterMembership } = await supabase
            .from("team_members")
            .select("role")
            .eq("team_id", teamId)
            .eq("user_id", request.userId)
            .maybeSingle();
          if (requesterMembership?.role !== "admin") {
            reply.code(403);
            return { success: false, error: "Only the team owner or an admin can remove members" };
          }
        }

        // Resolved before the delete purely so the audit summary reads
        // naturally ("Removed jane@co.com") — the auth.users row itself
        // is untouched by removing a team_members row either way.
        const { data: emailRows } = await supabase.rpc("get_user_emails_by_ids", { p_ids: [targetUserId] });
        const targetEmail = (emailRows as { id: string; email: string }[] | null)?.[0]?.email ?? null;

        const { error } = await supabase
          .from("team_members")
          .delete()
          .eq("team_id", teamId)
          .eq("user_id", targetUserId);
        if (error) {
          app.log.error(error, "Failed to remove team member");
          reply.code(502);
          return { success: false, error: "Failed to remove member, please try again" };
        }

        await logTeamAudit(supabase, app.log, {
          teamId,
          actorUserId: request.userId!,
          action: "member_removed",
          summary: `Removed ${targetEmail ?? targetUserId}`,
        });

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Remove team member threw");
        reply.code(502);
        return { success: false, error: "Failed to remove member, please try again" };
      }
    },
  );
}
