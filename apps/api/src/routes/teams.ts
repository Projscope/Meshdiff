import type { FastifyInstance } from "fastify";
import { getSupabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/requireAuth.js";

interface CreateTeamBody {
  name?: string;
}

interface AddMemberBody {
  email?: string;
  role?: "admin" | "approver" | "member";
}

export default async function teamsRoute(app: FastifyInstance): Promise<void> {
  app.get("/teams", { preHandler: requireAuth }, async (request, reply) => {
    const supabase = getSupabase();
    if (!supabase) {
      app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
      reply.code(500);
      return { success: false, error: "Teams are not configured" };
    }

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

  app.post<{ Body: CreateTeamBody }>("/teams", { preHandler: requireAuth }, async (request, reply) => {
    const { name } = request.body ?? {};
    if (typeof name !== "string" || name.trim().length === 0) {
      reply.code(400);
      return { success: false, error: "name is required" };
    }

    const supabase = getSupabase();
    if (!supabase) {
      app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
      reply.code(500);
      return { success: false, error: "Teams are not configured" };
    }

    try {
      const { data: team, error } = await supabase
        .from("teams")
        .insert({ name: name.trim(), owner_user_id: request.userId })
        .select("id, name, created_at")
        .single();
      if (error) {
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

      return { success: true, data: { id: team.id, name: team.name, createdAt: team.created_at } };
    } catch (err) {
      app.log.error(err, "Team creation threw");
      reply.code(502);
      return { success: false, error: "Failed to create team, please try again" };
    }
  });

  app.get<{ Params: { teamId: string } }>(
    "/teams/:teamId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { teamId } = request.params;
      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Teams are not configured" };
      }

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

  app.post<{ Params: { teamId: string }; Body: AddMemberBody }>(
    "/teams/:teamId/members",
    { preHandler: requireAuth },
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

      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Teams are not configured" };
      }

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

        return { success: true, data: { userId, role } };
      } catch (err) {
        app.log.error(err, "Add team member threw");
        reply.code(502);
        return { success: false, error: "Failed to add member, please try again" };
      }
    },
  );

  app.delete<{ Params: { teamId: string; userId: string } }>(
    "/teams/:teamId/members/:userId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { teamId, userId: targetUserId } = request.params;

      // Removing yourself isn't "removing a member", it's leaving the team,
      // which isn't a feature here yet (this also covers the owner trying
      // to remove themselves — they can't, same as anyone else).
      if (targetUserId === request.userId) {
        reply.code(400);
        return { success: false, error: "You can't remove yourself from the team" };
      }

      const supabase = getSupabase();
      if (!supabase) {
        app.log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
        reply.code(500);
        return { success: false, error: "Teams are not configured" };
      }

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

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Remove team member threw");
        reply.code(502);
        return { success: false, error: "Failed to remove member, please try again" };
      }
    },
  );
}
