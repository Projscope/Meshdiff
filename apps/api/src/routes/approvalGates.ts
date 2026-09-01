import type { FastifyInstance } from "fastify";
import { requireSupabase } from "../lib/requireSupabase.js";
import { requireAuth } from "../lib/requireAuth.js";
import { getProjectAccess } from "../lib/ownership.js";
import { requireProjectWriteAccess } from "../lib/requireProjectTierAccess.js";
import { notifyGateCompleted } from "../lib/notify.js";

interface GateDefinitionRow {
  id: string;
  project_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

function toGateSummary(row: GateDefinitionRow) {
  return { id: row.id, label: row.label, sortOrder: row.sort_order };
}

// Admin/owner only — same "who can configure the project" bar as team
// member management, not the lower "who can review" bar (canTransitionVersionState
// in versions.ts) that also admits 'approver'. Gates are project-scoped, not
// team-scoped (see migration 0028), so a Team-tier check happens alongside.
function canConfigureGates(access: { role: string | null; teamId: string | null }): boolean {
  if (!access.teamId) return false;
  return access.role === "owner" || access.role === "admin";
}

export default async function approvalGatesRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/approval-gates",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId } = request.params;
      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        // Read — unrestricted for anyone with project access, same
        // convention as every other GET in this file family.

        const { data: rows, error } = await supabase
          .from("approval_gate_definitions")
          .select("*")
          .eq("project_id", projectId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (error) {
          app.log.error(error, "Failed to list approval gates");
          reply.code(502);
          return { success: false, error: "Failed to load approval gates" };
        }

        return { success: true, data: (rows as GateDefinitionRow[]).map(toGateSummary) };
      } catch (err) {
        app.log.error(err, "Approval gates list threw");
        reply.code(502);
        return { success: false, error: "Failed to load approval gates" };
      }
    },
  );

  // Per-version fulfillment, joined with each gate's label — what the
  // checklist UI actually renders. The aggregate satisfiedCount/totalCount
  // on VersionSummary (versions.ts) is enough for a "2/3" badge, but not
  // enough to know *which* gates are still unchecked.
  app.get<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId/approval-gates",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId } = request.params;
      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }

        const { data: rows, error } = await supabase
          .from("approval_gate_fulfillments")
          .select("satisfied, approval_gate_definitions!inner(id, label, sort_order, is_active)")
          .eq("version_id", versionId)
          .eq("approval_gate_definitions.is_active", true);
        if (error) {
          app.log.error(error, "Failed to load version approval gates");
          reply.code(502);
          return { success: false, error: "Failed to load approval gates" };
        }

        type FulfillmentRow = {
          satisfied: boolean;
          approval_gate_definitions: { id: string; label: string; sort_order: number };
        };
        const fulfillments = ((rows ?? []) as unknown as FulfillmentRow[])
          .map((r) => ({
            id: r.approval_gate_definitions.id,
            label: r.approval_gate_definitions.label,
            sortOrder: r.approval_gate_definitions.sort_order,
            satisfied: r.satisfied,
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder);

        return { success: true, data: fulfillments };
      } catch (err) {
        app.log.error(err, "Version approval gates lookup threw");
        reply.code(502);
        return { success: false, error: "Failed to load approval gates" };
      }
    },
  );

  app.post<{ Params: { projectId: string }; Body: { label?: string } }>(
    "/projects/:projectId/approval-gates",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId } = request.params;
      const { label } = request.body ?? {};
      const supabase = request.supabase!;

      const trimmedLabel = typeof label === "string" ? label.trim() : "";
      if (!trimmedLabel) {
        reply.code(400);
        return { success: false, error: "label is required" };
      }
      if (trimmedLabel.length > 200) {
        reply.code(400);
        return { success: false, error: "label must be under 200 characters" };
      }

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;
        if (!canConfigureGates(access)) {
          reply.code(403);
          return { success: false, error: "Only a team admin can configure approval gates" };
        }

        const { count } = await supabase
          .from("approval_gate_definitions")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("is_active", true);

        const { data: row, error } = await supabase
          .from("approval_gate_definitions")
          .insert({ project_id: projectId, label: trimmedLabel, sort_order: count ?? 0 })
          .select("*")
          .single();
        if (error) {
          app.log.error(error, "Failed to create approval gate");
          reply.code(502);
          return { success: false, error: "Failed to create approval gate" };
        }

        return { success: true, data: toGateSummary(row as GateDefinitionRow) };
      } catch (err) {
        app.log.error(err, "Approval gate creation threw");
        reply.code(502);
        return { success: false, error: "Failed to create approval gate" };
      }
    },
  );

  app.patch<{ Params: { projectId: string; gateId: string }; Body: { label?: string; sortOrder?: number } }>(
    "/projects/:projectId/approval-gates/:gateId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, gateId } = request.params;
      const { label, sortOrder } = request.body ?? {};
      const supabase = request.supabase!;

      const update: { label?: string; sort_order?: number } = {};
      if (label !== undefined) {
        const trimmedLabel = typeof label === "string" ? label.trim() : "";
        if (!trimmedLabel) {
          reply.code(400);
          return { success: false, error: "label cannot be empty" };
        }
        update.label = trimmedLabel;
      }
      if (sortOrder !== undefined) {
        if (typeof sortOrder !== "number" || !Number.isFinite(sortOrder)) {
          reply.code(400);
          return { success: false, error: "sortOrder must be a number" };
        }
        update.sort_order = sortOrder;
      }
      if (Object.keys(update).length === 0) {
        reply.code(400);
        return { success: false, error: "Nothing to update" };
      }

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;
        if (!canConfigureGates(access)) {
          reply.code(403);
          return { success: false, error: "Only a team admin can configure approval gates" };
        }

        const { data: row, error } = await supabase
          .from("approval_gate_definitions")
          .update(update)
          .eq("id", gateId)
          .eq("project_id", projectId)
          .select("*")
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to update approval gate");
          reply.code(502);
          return { success: false, error: "Failed to update approval gate" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Approval gate not found" };
        }

        return { success: true, data: toGateSummary(row as GateDefinitionRow) };
      } catch (err) {
        app.log.error(err, "Approval gate update threw");
        reply.code(502);
        return { success: false, error: "Failed to update approval gate" };
      }
    },
  );

  app.delete<{ Params: { projectId: string; gateId: string } }>(
    "/projects/:projectId/approval-gates/:gateId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, gateId } = request.params;
      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;
        if (!canConfigureGates(access)) {
          reply.code(403);
          return { success: false, error: "Only a team admin can configure approval gates" };
        }

        // Soft-delete — existing fulfillment rows on already-finalized
        // versions stay meaningful (see migration 0028's comment).
        const { data: row, error } = await supabase
          .from("approval_gate_definitions")
          .update({ is_active: false })
          .eq("id", gateId)
          .eq("project_id", projectId)
          .select("id")
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to remove approval gate");
          reply.code(502);
          return { success: false, error: "Failed to remove approval gate" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Approval gate not found" };
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Approval gate removal threw");
        reply.code(502);
        return { success: false, error: "Failed to remove approval gate" };
      }
    },
  );

  // Toggling a checkbox isn't itself a review action — any project member
  // with write access can do it (e.g. the uploader confirming they ran a
  // slicer check), not just admin/approver.
  app.patch<{
    Params: { projectId: string; versionId: string; gateId: string };
    Body: { satisfied?: boolean };
  }>(
    "/projects/:projectId/versions/:versionId/approval-gates/:gateId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId, gateId } = request.params;
      const { satisfied } = request.body ?? {};
      const supabase = request.supabase!;

      if (typeof satisfied !== "boolean") {
        reply.code(400);
        return { success: false, error: "satisfied must be a boolean" };
      }

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: row, error } = await supabase
          .from("approval_gate_fulfillments")
          .update({
            satisfied,
            satisfied_by_user_id: satisfied ? request.userId : null,
            satisfied_at: satisfied ? new Date().toISOString() : null,
          })
          .eq("version_id", versionId)
          .eq("gate_definition_id", gateId)
          .select("id")
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to update gate fulfillment");
          reply.code(502);
          return { success: false, error: "Failed to update gate" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Gate not found for this version" };
        }

        // Only worth notifying reviewers when THIS toggle is what brought
        // the version from not-all-satisfied to all-satisfied — not on
        // every checkbox click, and not on an unchecking.
        if (satisfied && access.teamId) {
          const { data: fulfillments } = await supabase
            .from("approval_gate_fulfillments")
            .select("satisfied, approval_gate_definitions!inner(is_active)")
            .eq("version_id", versionId)
            .eq("approval_gate_definitions.is_active", true);
          const allSatisfied = (fulfillments ?? []).every((f: { satisfied: boolean }) => f.satisfied);
          if (allSatisfied) {
            const { data: project } = await supabase.from("projects").select("owner_user_id, name").eq("id", projectId).maybeSingle();
            const { data: members } = await supabase
              .from("team_members")
              .select("user_id")
              .eq("team_id", access.teamId)
              .in("role", ["admin", "approver"]);
            const reviewerIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
            if (project?.owner_user_id) reviewerIds.push(project.owner_user_id);
            const { data: version } = await supabase.from("versions").select("version_number").eq("id", versionId).maybeSingle();
            const versionNumber = (version as { version_number: number } | null)?.version_number ?? "?";
            const projectName = (project as { name: string } | null)?.name;
            await notifyGateCompleted(supabase, app.log, {
              recipientUserIds: reviewerIds,
              actorUserId: request.userId!,
              projectId,
              versionId,
              summary: projectName
                ? `All approval gates satisfied on ${projectName} (v${versionNumber}) — ready to approve`
                : `All approval gates satisfied on v${versionNumber} — ready to approve`,
            });
          }
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Gate fulfillment update threw");
        reply.code(502);
        return { success: false, error: "Failed to update gate" };
      }
    },
  );
}
