import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ulid } from "ulid";
import archiver from "archiver";
import { requireSupabase } from "../lib/requireSupabase.js";
import { extensionOf, sanitizeFilename } from "../lib/filename.js";
import { generateChangeSummary } from "../lib/generateSummary.js";
import type { VoxelDiffStats } from "../../../shared/dist/engine/diffVoxels.js";
import { requireAuth } from "../lib/requireAuth.js";
import { getProjectAccess } from "../lib/ownership.js";
import { requireProjectWriteAccess, requireProUploadAccess } from "../lib/requireProjectTierAccess.js";
import { getStableVersion } from "../lib/stableVersion.js";
import { MAX_FILE_BYTES } from "../lib/fileSizeLimit.js";
import { logTeamAudit } from "../lib/teamAuditLog.js";

// Diffing now runs client-side (see finalize() below and
// ProjectDetailPage.tsx/projectsApi.ts) — the server never parses or
// voxelizes mesh geometry for a Projects workspace upload anymore, so all
// three formats are safe to accept again. This used to be STL-only while
// finalize() did the diffing itself server-side (see project memory
// "render_oom_mesh_triangle_cap" for why: a 3MF's on-disk size doesn't
// reliably predict its actual triangle count once unpacked, and that drove
// a series of OOM crashes on Render).
const ALLOWED_EXTENSIONS = new Set(["stl", "obj", "3mf"]);
const DOWNLOAD_URL_TTL_SECONDS = 60;
const BUCKET = "project-meshes";
// Slicer profile is a settings snapshot, not G-code toolpath data (out of
// scope per CLAUDE.md) — capped small since it's meant to be a small text
// export, not an arbitrary file.
const MAX_SLICER_PROFILE_BYTES = 2 * 1024 * 1024;
const MAX_PRINT_PHOTO_BYTES = 10 * 1024 * 1024;
const PRINT_PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

interface CreateVersionBody {
  fileName?: string;
  fileSize?: number;
}

interface FinalizeVersionBody {
  stats?: VoxelDiffStats;
}

export interface VersionRow {
  id: string;
  project_id: string;
  version_number: number;
  file_name: string;
  file_path: string;
  file_format: string;
  file_size_bytes: number;
  triangle_count: number | null;
  change_summary: string | null;
  printability_status: string | null;
  approval_status: string;
  rejection_reason: string | null;
  created_at: string;
  uploaded_by_user_id: string | null;
  slicer_profile_path?: string | null;
  slicer_profile_file_name?: string | null;
  print_photo_path?: string | null;
  print_photo_file_name?: string | null;
  print_photo_caption?: string | null;
}

/** The 5-state review machine (see migration 0027) — replaces the old flat
 * pending/approved/rejected. 'draft' is reachable only via an explicit
 * future "save as draft" action (uploads still default straight to
 * 'in_review'); 'superseded' is set automatically when a newer version in
 * the same project is approved (see approve() below). */
export type ApprovalStatus = "draft" | "in_review" | "changes_requested" | "approved" | "superseded";

export interface GateStatus {
  satisfiedCount: number;
  totalCount: number;
}

export function toVersionSummary(
  row: VersionRow,
  uploaderEmail: string | null = null,
  gateStatus: GateStatus | null = null,
) {
  return {
    id: row.id,
    versionNumber: row.version_number,
    fileName: row.file_name,
    fileFormat: row.file_format,
    fileSizeBytes: row.file_size_bytes,
    triangleCount: row.triangle_count,
    changeSummary: row.change_summary,
    printabilityStatus: row.printability_status,
    approvalStatus: row.approval_status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    uploaderEmail,
    gateStatus,
  };
}

/** Team projects only — fetches active gate definitions for a project and
 * how many this version has satisfied, for the "2/3 gates" summary and the
 * approve-gating check. Returns null for non-team projects (gates don't
 * apply there) rather than a vacuous 0/0. */
async function getVersionGateStatus(
  supabase: SupabaseClient,
  versionId: string,
  teamId: string | null,
): Promise<GateStatus | null> {
  if (!teamId) return null;

  const { data: fulfillments, error } = await supabase
    .from("approval_gate_fulfillments")
    .select("satisfied, approval_gate_definitions!inner(id, is_active)")
    .eq("version_id", versionId)
    .eq("approval_gate_definitions.is_active", true);
  if (error) return null;

  const rows = (fulfillments ?? []) as Array<{ satisfied: boolean }>;
  return { satisfiedCount: rows.filter((r) => r.satisfied).length, totalCount: rows.length };
}

/** Called once per finalize() on a Team project — creates one fulfillment
 * row per currently-active gate definition so the checklist UI has
 * something to render immediately, rather than lazily on first GET (a read
 * should never have side effects). Personal (Pro) projects never call this;
 * gates are Team-tier only (see migration 0028). */
async function seedGateFulfillments(supabase: SupabaseClient, projectId: string, versionId: string): Promise<void> {
  const { data: definitions, error } = await supabase
    .from("approval_gate_definitions")
    .select("id")
    .eq("project_id", projectId)
    .eq("is_active", true);
  if (error || !definitions || definitions.length === 0) return;

  await supabase.from("approval_gate_fulfillments").insert(
    (definitions as Array<{ id: string }>).map((d) => ({ version_id: versionId, gate_definition_id: d.id })),
  );
}

export default async function versionsRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  app.post<{ Params: { projectId: string }; Body: CreateVersionBody }>(
    "/projects/:projectId/versions",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { fileName, fileSize } = request.body ?? {};
      const { projectId } = request.params;

      if (typeof fileName !== "string" || !fileName) {
        reply.code(400);
        return { success: false, error: "fileName is required" };
      }
      const extension = extensionOf(fileName);
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        reply.code(400);
        return { success: false, error: "File must be an STL file" };
      }
      if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
        reply.code(400);
        return { success: false, error: "File must be under 50MB" };
      }

      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProUploadAccess(supabase, request.userId!, reply))) return;

        const versionId = ulid();
        const filePath = `${projectId}/${versionId}.${extension}`;

        const { data: versionRow, error: rpcError } = await supabase
          .rpc("create_version", {
            p_id: versionId,
            p_project_id: projectId,
            p_file_name: fileName,
            p_file_path: filePath,
            p_file_format: extension,
            p_file_size_bytes: fileSize,
            p_uploaded_by_user_id: request.userId,
          })
          .single();

        if (rpcError) {
          app.log.error(rpcError, "Failed to allocate version");
          reply.code(502);
          return { success: false, error: "Failed to create version, please try again" };
        }

        const { data: upload, error: uploadError } = await supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(filePath);
        if (uploadError) {
          app.log.error(uploadError, "Failed to create signed upload URL");
          reply.code(502);
          return { success: false, error: "Failed to create version, please try again" };
        }

        return {
          success: true,
          data: {
            versionId,
            versionNumber: (versionRow as VersionRow).version_number,
            uploadUrl: upload.signedUrl,
          },
        };
      } catch (err) {
        app.log.error(err, "Version creation threw");
        reply.code(502);
        return { success: false, error: "Failed to create version, please try again" };
      }
    },
  );

  app.post<{ Params: { projectId: string; versionId: string }; Body: FinalizeVersionBody }>(
    "/projects/:projectId/versions/:versionId/finalize",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId } = request.params;
      const { stats } = request.body ?? {};
      const supabase = request.supabase!;
      // The client computes the diff itself now — parsing/voxelizing/BVH
      // work happens in the uploader's own browser (off-main-thread, same
      // engine the free Live Diff tool already uses), not on this shared
      // server. finalize() just accepts and stores the result. See project
      // memory "render_oom_mesh_triangle_cap" for why this moved: the
      // server computing it itself was the actual driver behind a series
      // of out-of-memory crashes, since one process's memory was shared
      // across every concurrent upload/comparison.
      if (!stats || typeof stats !== "object") {
        reply.code(400);
        return { success: false, error: "stats is required" };
      }

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProUploadAccess(supabase, request.userId!, reply))) return;

        const { data: current, error: currentError } = await supabase
          .from("versions")
          .select("*")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (currentError) {
          app.log.error(currentError, "Failed to look up version");
          reply.code(502);
          return { success: false, error: "Failed to finalize version" };
        }
        if (!current) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }

        const currentRow = current as VersionRow;

        let previousRow: VersionRow | null = null;
        if (currentRow.version_number > 1) {
          const { data: prev, error: prevError } = await supabase
            .from("versions")
            .select("*")
            .eq("project_id", projectId)
            .eq("version_number", currentRow.version_number - 1)
            .maybeSingle();
          if (prevError) {
            app.log.error(prevError, "Failed to look up previous version");
            reply.code(502);
            return { success: false, error: "Failed to finalize version" };
          }
          previousRow = prev as VersionRow | null;
        }

        const changeSummary = generateChangeSummary(stats);
        const triangleCount = Math.round(stats.triangleDeltaB);

        // Personal (Pro) projects don't have a review workflow — approval
        // status would just be dead-weight "Pending" clutter with nothing
        // to approve against, so auto-approve on upload. Team projects
        // (team_id set) keep the default 'pending' from create_version()
        // until an admin explicitly approves/rejects (see the two routes
        // below).
        const { error: updateError } = await supabase
          .from("versions")
          .update({
            triangle_count: triangleCount,
            change_summary: changeSummary,
            printability_status: stats.printabilityStatus,
            ...(access.teamId ? {} : { approval_status: "approved" }),
          })
          .eq("id", versionId);
        if (updateError) {
          app.log.error(updateError, "Failed to update version with diff results");
          reply.code(502);
          return { success: false, error: "Failed to finalize version" };
        }

        if (previousRow) {
          const { error: diffCacheError } = await supabase
            .from("version_diffs")
            .upsert(
              {
                project_id: projectId,
                version_a_id: previousRow.id,
                version_b_id: versionId,
                stats,
                printability_status: stats.printabilityStatus,
                computed_at: new Date().toISOString(),
              },
              { onConflict: "version_a_id,version_b_id" },
            );
          if (diffCacheError) {
            app.log.warn(diffCacheError, "Failed to cache version diff");
          }
        }

        if (access.teamId) {
          await seedGateFulfillments(supabase, projectId, versionId);
        }

        return {
          success: true,
          data: {
            versionId,
            triangleCount,
            changeSummary,
            printabilityStatus: stats.printabilityStatus,
          },
        };
      } catch (err) {
        app.log.error(err, "Version finalize threw");
        reply.code(502);
        return { success: false, error: "Failed to finalize version" };
      }
    },
  );

  // State transitions only matter for Team projects (team_id set) — see
  // plan. For personal (Pro) projects, finalize() already auto-approves, so
  // these routes have nothing useful to do there; requiring 'admin' or
  // 'approver' on a Team project but falling back to owner-only on a
  // personal one keeps the check meaningful in both cases without a
  // special-case error. 'approver' is an "upgraded member" — reviews only,
  // no invite/remove rights (those stay admin/owner-only, see teams.ts).
  // Renamed from canReviewVersions() — same logic, now framed around the
  // 5-state machine rather than a binary approve/reject.
  function canTransitionVersionState(access: { role: string | null; teamId: string | null }): boolean {
    if (!access.role) return false;
    // The project owner can always review, team or not — getProjectAccess
    // resolves 'owner' before checking team_members, so an owner who's
    // also a team admin would otherwise be wrongly excluded here.
    if (access.role === "owner") return true;
    return access.teamId ? access.role === "admin" || access.role === "approver" : false;
  }

  /** Every transition writes the new approval_status, inserts a
   * version_reviews history row (the array-of-latest-reviewer columns on
   * `versions` can't represent history — this table can), and best-effort
   * logs to the team audit log. Centralized here so the three transition
   * routes below can't drift on this bookkeeping. */
  async function recordTransition(
    supabase: SupabaseClient,
    params: {
      projectId: string;
      versionId: string;
      actorUserId: string;
      teamId: string | null;
      fromStatus: string;
      toStatus: ApprovalStatus;
      reason: string | null;
      auditAction: "version_approved" | "version_rejected" | "version_submitted_for_review";
      auditVerb: string;
    },
  ): Promise<void> {
    const { error: historyError } = await supabase.from("version_reviews").insert({
      version_id: params.versionId,
      actor_user_id: params.actorUserId,
      from_status: params.fromStatus,
      to_status: params.toStatus,
      reason: params.reason,
    });
    if (historyError) app.log.warn(historyError, "Failed to record version_reviews history row");

    // Audit log is team-scoped — no-op for personal/Pro projects (the
    // majority of traffic), which have no team_id to log against.
    if (params.teamId) {
      const { data: project } = await supabase
        .from("projects")
        .select("name")
        .eq("id", params.projectId)
        .maybeSingle();
      await logTeamAudit(supabase, app.log, {
        teamId: params.teamId,
        actorUserId: params.actorUserId,
        action: params.auditAction,
        summary: `${params.auditVerb} of ${project?.name ?? "Unknown project"}${params.reason ? `: ${params.reason}` : ""}`,
      });
    }
  }

  app.post<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId/submit-for-review",
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
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: current, error: lookupError } = await supabase
          .from("versions")
          .select("approval_status, version_number")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (lookupError) {
          app.log.error(lookupError, "Failed to look up version for submit-for-review");
          reply.code(502);
          return { success: false, error: "Failed to submit version for review" };
        }
        if (!current) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }
        const currentRow = current as { approval_status: string; version_number: number };
        if (currentRow.approval_status !== "draft") {
          reply.code(400);
          return { success: false, error: "Only a draft version can be submitted for review" };
        }

        const { data: row, error } = await supabase
          .from("versions")
          .update({ approval_status: "in_review" })
          .eq("id", versionId)
          .eq("project_id", projectId)
          .select("*")
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to submit version for review");
          reply.code(502);
          return { success: false, error: "Failed to submit version for review" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }

        await recordTransition(supabase, {
          projectId,
          versionId,
          actorUserId: request.userId!,
          teamId: access.teamId,
          fromStatus: "draft",
          toStatus: "in_review",
          reason: null,
          auditAction: "version_submitted_for_review",
          auditVerb: `Submitted v${currentRow.version_number} for review`,
        });

        return { success: true, data: toVersionSummary(row as VersionRow) };
      } catch (err) {
        app.log.error(err, "Version submit-for-review threw");
        reply.code(502);
        return { success: false, error: "Failed to submit version for review" };
      }
    },
  );

  app.post<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId/approve",
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
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;
        if (!canTransitionVersionState(access)) {
          reply.code(403);
          return { success: false, error: "Only a team admin can approve versions" };
        }

        const { data: beforeRow, error: beforeError } = await supabase
          .from("versions")
          .select("approval_status")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (beforeError) {
          app.log.error(beforeError, "Failed to look up version before approving");
          reply.code(502);
          return { success: false, error: "Failed to approve version" };
        }
        if (!beforeRow) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }
        const fromStatus = (beforeRow as { approval_status: string }).approval_status;

        if (access.teamId) {
          const { data: fulfillments, error: gatesError } = await supabase
            .from("approval_gate_fulfillments")
            .select("satisfied, approval_gate_definitions!inner(label, is_active)")
            .eq("version_id", versionId)
            .eq("approval_gate_definitions.is_active", true);
          if (gatesError) {
            app.log.warn(gatesError, "Failed to check approval gates before approving");
          } else {
            // PostgREST returns the embedded !inner relation as a single
            // object at runtime, but the untyped client can't express that
            // statically — cast to the actual shape rather than the
            // to-many array shape TS infers by default.
            type FulfillmentRow = { satisfied: boolean; approval_gate_definitions: { label: string } };
            const unmet = ((fulfillments ?? []) as unknown as FulfillmentRow[])
              .filter((f) => !f.satisfied)
              .map((f) => f.approval_gate_definitions.label);
            if (unmet.length > 0) {
              reply.code(403);
              return {
                success: false,
                error: `Unmet approval gates: ${unmet.join(", ")}`,
                code: "gates_unsatisfied",
                unmetGates: unmet,
              };
            }
          }
        }

        const { data: row, error } = await supabase
          .from("versions")
          .update({
            approval_status: "approved",
            reviewed_by_user_id: request.userId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: null,
          })
          .eq("id", versionId)
          .eq("project_id", projectId)
          .select("*")
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to approve version");
          reply.code(502);
          return { success: false, error: "Failed to approve version" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }

        // Only one version can be the current Approved one — any other
        // version in this project still marked 'approved' (from a prior
        // approval, now being superseded by this one) transitions to
        // 'superseded' in the same request. Simpler than a partial unique
        // index, and matches how getStableVersion() already picks the
        // highest-version-number approved row.
        const { data: superseded, error: supersedeError } = await supabase
          .from("versions")
          .update({ approval_status: "superseded" })
          .eq("project_id", projectId)
          .eq("approval_status", "approved")
          .neq("id", versionId)
          .select("id");
        if (supersedeError) {
          app.log.warn(supersedeError, "Failed to supersede prior approved version");
        } else {
          for (const supersededRow of (superseded ?? []) as Array<{ id: string }>) {
            const { error: supersedeHistoryError } = await supabase.from("version_reviews").insert({
              version_id: supersededRow.id,
              actor_user_id: request.userId,
              from_status: "approved",
              to_status: "superseded",
              reason: null,
            });
            if (supersedeHistoryError) {
              app.log.warn(supersedeHistoryError, "Failed to record supersede history row");
            }
          }
        }

        await recordTransition(supabase, {
          projectId,
          versionId,
          actorUserId: request.userId!,
          teamId: access.teamId,
          fromStatus,
          toStatus: "approved",
          reason: null,
          auditAction: "version_approved",
          auditVerb: `Approved v${(row as VersionRow).version_number}`,
        });

        return { success: true, data: toVersionSummary(row as VersionRow) };
      } catch (err) {
        app.log.error(err, "Version approve threw");
        reply.code(502);
        return { success: false, error: "Failed to approve version" };
      }
    },
  );

  // Shared by /reject (kept for backward compatibility with the current
  // two-button UI) and the new, more accurately-named /request-changes —
  // both transition in_review -> changes_requested.
  async function handleRequestChanges(
    request: FastifyRequest<{ Params: { projectId: string; versionId: string }; Body: { reason?: string } }>,
    reply: FastifyReply,
  ) {
    const { projectId, versionId } = request.params;
    const { reason } = request.body ?? {};
    const supabase = request.supabase!;

    try {
      const access = await getProjectAccess(supabase, projectId, request.userId!);
      if (!access.role) {
        reply.code(404);
        return { success: false, error: "Project not found" };
      }
      if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;
      if (!canTransitionVersionState(access)) {
        reply.code(403);
        return { success: false, error: "Only a team admin can request changes on versions" };
      }

      const { data: beforeRow, error: beforeError } = await supabase
        .from("versions")
        .select("approval_status")
        .eq("id", versionId)
        .eq("project_id", projectId)
        .maybeSingle();
      if (beforeError) {
        app.log.error(beforeError, "Failed to look up version before requesting changes");
        reply.code(502);
        return { success: false, error: "Failed to request changes on version" };
      }
      if (!beforeRow) {
        reply.code(404);
        return { success: false, error: "Version not found" };
      }
      const fromStatus = (beforeRow as { approval_status: string }).approval_status;
      const trimmedReason = typeof reason === "string" && reason.trim() ? reason.trim() : null;

      const { data: row, error } = await supabase
        .from("versions")
        .update({
          approval_status: "changes_requested",
          reviewed_by_user_id: request.userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: trimmedReason,
        })
        .eq("id", versionId)
        .eq("project_id", projectId)
        .select("*")
        .maybeSingle();
      if (error) {
        app.log.error(error, "Failed to request changes on version");
        reply.code(502);
        return { success: false, error: "Failed to request changes on version" };
      }
      if (!row) {
        reply.code(404);
        return { success: false, error: "Version not found" };
      }

      await recordTransition(supabase, {
        projectId,
        versionId,
        actorUserId: request.userId!,
        teamId: access.teamId,
        fromStatus,
        toStatus: "changes_requested",
        reason: trimmedReason,
        auditAction: "version_rejected",
        auditVerb: `Requested changes on v${(row as VersionRow).version_number}`,
      });

      return { success: true, data: toVersionSummary(row as VersionRow) };
    } catch (err) {
      app.log.error(err, "Version request-changes threw");
      reply.code(502);
      return { success: false, error: "Failed to request changes on version" };
    }
  }

  app.post<{ Params: { projectId: string; versionId: string }; Body: { reason?: string } }>(
    "/projects/:projectId/versions/:versionId/reject",
    { preHandler: requireAuth },
    handleRequestChanges,
  );

  app.post<{ Params: { projectId: string; versionId: string }; Body: { reason?: string } }>(
    "/projects/:projectId/versions/:versionId/request-changes",
    { preHandler: requireAuth },
    handleRequestChanges,
  );

  app.get<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId/review-history",
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
        // Read — unrestricted for anyone with project access, same
        // convention as every other GET in this file.

        const { data: rows, error } = await supabase
          .from("version_reviews")
          .select("*")
          .eq("version_id", versionId)
          .order("created_at", { ascending: true });
        if (error) {
          app.log.error(error, "Failed to load version review history");
          reply.code(502);
          return { success: false, error: "Failed to load review history" };
        }

        const historyRows = (rows ?? []) as Array<{
          id: string;
          actor_user_id: string | null;
          from_status: string;
          to_status: string;
          reason: string | null;
          created_at: string;
        }>;
        const actorIds = [...new Set(historyRows.map((r) => r.actor_user_id).filter((id): id is string => !!id))];
        let emailByUserId = new Map<string, string>();
        if (actorIds.length > 0) {
          const { data: emailRows, error: emailError } = await supabase.rpc("get_user_emails_by_ids", {
            p_ids: actorIds,
          });
          if (emailError) {
            app.log.warn(emailError, "Failed to resolve review-history actor emails");
          } else {
            emailByUserId = new Map((emailRows ?? []).map((r: { id: string; email: string }) => [r.id, r.email]));
          }
        }

        return {
          success: true,
          data: historyRows.map((r) => ({
            id: r.id,
            actorEmail: r.actor_user_id ? (emailByUserId.get(r.actor_user_id) ?? null) : null,
            fromStatus: r.from_status,
            toStatus: r.to_status,
            reason: r.reason,
            createdAt: r.created_at,
          })),
        };
      } catch (err) {
        app.log.error(err, "Version review-history threw");
        reply.code(502);
        return { success: false, error: "Failed to load review history" };
      }
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/versions",
    { preHandler: requireAuth },
    async (request, reply) => {
      const supabase = request.supabase!;

      try {
        const access = await getProjectAccess(supabase, request.params.projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        // Listing versions is a read — unrestricted for anyone with
        // project access, including a downgraded former-Pro user.

        const { data: rows, error } = await supabase
          .from("versions")
          .select("*")
          .eq("project_id", request.params.projectId)
          .order("version_number", { ascending: false });
        if (error) {
          app.log.error(error, "Failed to list versions");
          reply.code(502);
          return { success: false, error: "Failed to load versions" };
        }

        const versionRows = rows as VersionRow[];
        const uploaderIds = [...new Set(versionRows.map((row) => row.uploaded_by_user_id).filter((id): id is string => !!id))];
        let emailByUserId = new Map<string, string>();
        if (uploaderIds.length > 0) {
          const { data: emailRows, error: emailError } = await supabase.rpc("get_user_emails_by_ids", {
            p_ids: uploaderIds,
          });
          if (emailError) {
            app.log.warn(emailError, "Failed to resolve uploader emails");
          } else {
            emailByUserId = new Map((emailRows ?? []).map((r: { id: string; email: string }) => [r.id, r.email]));
          }
        }

        const gateStatuses = access.teamId
          ? await Promise.all(versionRows.map((row) => getVersionGateStatus(supabase, row.id, access.teamId)))
          : versionRows.map(() => null);

        return {
          success: true,
          data: versionRows.map((row, index) =>
            toVersionSummary(
              row,
              row.uploaded_by_user_id ? (emailByUserId.get(row.uploaded_by_user_id) ?? null) : null,
              gateStatuses[index],
            ),
          ),
        };
      } catch (err) {
        app.log.error(err, "Version list threw");
        reply.code(502);
        return { success: false, error: "Failed to load versions" };
      }
    },
  );

  app.get<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId",
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
        // Viewing a version's own detail is a read — unrestricted for
        // anyone with project access, including a downgraded former-Pro user.

        const { data: row, error } = await supabase
          .from("versions")
          .select("*")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (error) {
          app.log.error(error, "Failed to load version");
          reply.code(502);
          return { success: false, error: "Failed to load version" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }

        const versionRow = row as VersionRow;
        const { data: download, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(versionRow.file_path, DOWNLOAD_URL_TTL_SECONDS);
        if (downloadError) {
          app.log.error(downloadError, "Failed to create signed download URL");
          reply.code(502);
          return { success: false, error: "This version's file is unavailable" };
        }

        let previousVersionId: string | null = null;
        if (versionRow.version_number > 1) {
          const { data: prev } = await supabase
            .from("versions")
            .select("id")
            .eq("project_id", projectId)
            .eq("version_number", versionRow.version_number - 1)
            .maybeSingle();
          previousVersionId = (prev as { id: string } | null)?.id ?? null;
        }

        let slicerProfile: { fileName: string; downloadUrl: string } | null = null;
        if (versionRow.slicer_profile_path && versionRow.slicer_profile_file_name) {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(versionRow.slicer_profile_path, DOWNLOAD_URL_TTL_SECONDS);
          if (signed) slicerProfile = { fileName: versionRow.slicer_profile_file_name, downloadUrl: signed.signedUrl };
        }

        let printPhoto: { fileName: string; caption: string | null; downloadUrl: string } | null = null;
        if (versionRow.print_photo_path && versionRow.print_photo_file_name) {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(versionRow.print_photo_path, DOWNLOAD_URL_TTL_SECONDS);
          if (signed) {
            printPhoto = {
              fileName: versionRow.print_photo_file_name,
              caption: versionRow.print_photo_caption ?? null,
              downloadUrl: signed.signedUrl,
            };
          }
        }

        const gateStatus = await getVersionGateStatus(supabase, versionRow.id, access.teamId);

        return {
          success: true,
          data: {
            ...toVersionSummary(versionRow, null, gateStatus),
            downloadUrl: download.signedUrl,
            previousVersionId,
            slicerProfile,
            printPhoto,
          },
        };
      } catch (err) {
        app.log.error(err, "Version lookup threw");
        reply.code(502);
        return { success: false, error: "Failed to load version" };
      }
    },
  );

  app.delete<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId",
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
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: row, error: lookupError } = await supabase
          .from("versions")
          .select("file_path, uploaded_by_user_id, triangle_count, slicer_profile_path, print_photo_path")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (lookupError) {
          app.log.error(lookupError, "Failed to look up version for delete");
          reply.code(502);
          return { success: false, error: "Failed to delete version" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }
        const versionRow = row as {
          file_path: string;
          uploaded_by_user_id: string | null;
          triangle_count: number | null;
          slicer_profile_path: string | null;
          print_photo_path: string | null;
        };

        // Normally only an owner/admin can delete a version — but diffing
        // now happens client-side (see uploadVersion() in projectsApi.ts),
        // and a failed diff/finalize step leaves an allocated version row
        // behind with no triangle_count ("? tris" in the UI, permanently,
        // since nothing else ever retries or cleans it up). Anyone who
        // uploaded a version is allowed to delete their own still-
        // unfinalized attempt — this is strictly narrower than general
        // delete rights: it never applies once triangle_count is set.
        const isOwnUnfinalizedUpload =
          versionRow.triangle_count === null && versionRow.uploaded_by_user_id === request.userId;
        if (access.role !== "owner" && access.role !== "admin" && !isOwnUnfinalizedUpload) {
          reply.code(403);
          return { success: false, error: "Only project owners and team admins can delete versions" };
        }

        // comments and version_diffs cascade via FK; only the storage
        // object needs explicit cleanup.
        const { error: deleteError } = await supabase
          .from("versions")
          .delete()
          .eq("id", versionId);
        if (deleteError) {
          app.log.error(deleteError, "Failed to delete version");
          reply.code(502);
          return { success: false, error: "Failed to delete version" };
        }

        const pathsToRemove = [
          versionRow.file_path,
          versionRow.slicer_profile_path,
          versionRow.print_photo_path,
        ].filter((p): p is string => !!p);
        const { error: storageError } = await supabase.storage.from(BUCKET).remove(pathsToRemove);
        if (storageError) {
          app.log.warn(storageError, "Failed to remove version file from storage");
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Version delete threw");
        reply.code(502);
        return { success: false, error: "Failed to delete version" };
      }
    },
  );

  interface SlicerProfileUploadBody {
    fileName?: string;
    fileSize?: number;
  }

  app.post<{ Params: { projectId: string; versionId: string }; Body: SlicerProfileUploadBody }>(
    "/projects/:projectId/versions/:versionId/slicer-profile",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId } = request.params;
      const { fileName, fileSize } = request.body ?? {};
      const supabase = request.supabase!;

      if (typeof fileName !== "string" || !fileName) {
        reply.code(400);
        return { success: false, error: "fileName is required" };
      }
      if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_SLICER_PROFILE_BYTES) {
        reply.code(400);
        return { success: false, error: "Slicer profile must be under 2MB" };
      }

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: existing, error: lookupError } = await supabase
          .from("versions")
          .select("id, slicer_profile_path")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (lookupError) {
          app.log.error(lookupError, "Failed to look up version for slicer profile upload");
          reply.code(502);
          return { success: false, error: "Failed to attach slicer profile" };
        }
        if (!existing) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }
        const previousPath = (existing as { slicer_profile_path: string | null }).slicer_profile_path;

        const safeName = sanitizeFilename(fileName);
        const filePath = `${projectId}/${versionId}.slicer-profile.${Date.now()}`;

        const { data: upload, error: uploadError } = await supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(filePath);
        if (uploadError) {
          app.log.error(uploadError, "Failed to create signed upload URL for slicer profile");
          reply.code(502);
          return { success: false, error: "Failed to attach slicer profile" };
        }

        const { error: updateError } = await supabase
          .from("versions")
          .update({ slicer_profile_path: filePath, slicer_profile_file_name: safeName })
          .eq("id", versionId);
        if (updateError) {
          app.log.error(updateError, "Failed to record slicer profile");
          reply.code(502);
          return { success: false, error: "Failed to attach slicer profile" };
        }

        // Best-effort cleanup of whatever was there before — a failure here
        // just leaves an orphaned object, not a broken version.
        if (previousPath) {
          const { error: removeError } = await supabase.storage.from(BUCKET).remove([previousPath]);
          if (removeError) app.log.warn(removeError, "Failed to remove previous slicer profile");
        }

        return { success: true, data: { uploadUrl: upload.signedUrl } };
      } catch (err) {
        app.log.error(err, "Slicer profile upload threw");
        reply.code(502);
        return { success: false, error: "Failed to attach slicer profile" };
      }
    },
  );

  app.delete<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId/slicer-profile",
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
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: row, error: lookupError } = await supabase
          .from("versions")
          .select("slicer_profile_path")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (lookupError) {
          app.log.error(lookupError, "Failed to look up version for slicer profile removal");
          reply.code(502);
          return { success: false, error: "Failed to remove slicer profile" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }
        const path = (row as { slicer_profile_path: string | null }).slicer_profile_path;

        const { error: updateError } = await supabase
          .from("versions")
          .update({ slicer_profile_path: null, slicer_profile_file_name: null })
          .eq("id", versionId);
        if (updateError) {
          app.log.error(updateError, "Failed to clear slicer profile");
          reply.code(502);
          return { success: false, error: "Failed to remove slicer profile" };
        }

        if (path) {
          const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
          if (removeError) app.log.warn(removeError, "Failed to remove slicer profile from storage");
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Slicer profile removal threw");
        reply.code(502);
        return { success: false, error: "Failed to remove slicer profile" };
      }
    },
  );

  interface PrintPhotoUploadBody {
    fileName?: string;
    fileSize?: number;
    caption?: string;
  }

  app.post<{ Params: { projectId: string; versionId: string }; Body: PrintPhotoUploadBody }>(
    "/projects/:projectId/versions/:versionId/print-photo",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId, versionId } = request.params;
      const { fileName, fileSize, caption } = request.body ?? {};
      const supabase = request.supabase!;

      if (typeof fileName !== "string" || !fileName) {
        reply.code(400);
        return { success: false, error: "fileName is required" };
      }
      const extension = extensionOf(fileName);
      if (!PRINT_PHOTO_EXTENSIONS.has(extension)) {
        reply.code(400);
        return { success: false, error: "Photo must be a JPG, PNG, WEBP, or HEIC image" };
      }
      if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_PRINT_PHOTO_BYTES) {
        reply.code(400);
        return { success: false, error: "Photo must be under 10MB" };
      }
      if (caption !== undefined && typeof caption !== "string") {
        reply.code(400);
        return { success: false, error: "caption must be a string" };
      }

      try {
        const access = await getProjectAccess(supabase, projectId, request.userId!);
        if (!access.role) {
          reply.code(404);
          return { success: false, error: "Project not found" };
        }
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: existing, error: lookupError } = await supabase
          .from("versions")
          .select("id, print_photo_path")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (lookupError) {
          app.log.error(lookupError, "Failed to look up version for print photo upload");
          reply.code(502);
          return { success: false, error: "Failed to attach print photo" };
        }
        if (!existing) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }
        const previousPath = (existing as { print_photo_path: string | null }).print_photo_path;

        const safeName = sanitizeFilename(fileName);
        const filePath = `${projectId}/${versionId}.print-photo.${Date.now()}.${extension}`;

        const { data: upload, error: uploadError } = await supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(filePath);
        if (uploadError) {
          app.log.error(uploadError, "Failed to create signed upload URL for print photo");
          reply.code(502);
          return { success: false, error: "Failed to attach print photo" };
        }

        const { error: updateError } = await supabase
          .from("versions")
          .update({
            print_photo_path: filePath,
            print_photo_file_name: safeName,
            print_photo_caption: caption?.trim() || null,
          })
          .eq("id", versionId);
        if (updateError) {
          app.log.error(updateError, "Failed to record print photo");
          reply.code(502);
          return { success: false, error: "Failed to attach print photo" };
        }

        if (previousPath) {
          const { error: removeError } = await supabase.storage.from(BUCKET).remove([previousPath]);
          if (removeError) app.log.warn(removeError, "Failed to remove previous print photo");
        }

        return { success: true, data: { uploadUrl: upload.signedUrl } };
      } catch (err) {
        app.log.error(err, "Print photo upload threw");
        reply.code(502);
        return { success: false, error: "Failed to attach print photo" };
      }
    },
  );

  app.delete<{ Params: { projectId: string; versionId: string } }>(
    "/projects/:projectId/versions/:versionId/print-photo",
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
        if (!(await requireProjectWriteAccess(supabase, request.userId!, access, reply))) return;

        const { data: row, error: lookupError } = await supabase
          .from("versions")
          .select("print_photo_path")
          .eq("id", versionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (lookupError) {
          app.log.error(lookupError, "Failed to look up version for print photo removal");
          reply.code(502);
          return { success: false, error: "Failed to remove print photo" };
        }
        if (!row) {
          reply.code(404);
          return { success: false, error: "Version not found" };
        }
        const path = (row as { print_photo_path: string | null }).print_photo_path;

        const { error: updateError } = await supabase
          .from("versions")
          .update({ print_photo_path: null, print_photo_file_name: null, print_photo_caption: null })
          .eq("id", versionId);
        if (updateError) {
          app.log.error(updateError, "Failed to clear print photo");
          reply.code(502);
          return { success: false, error: "Failed to remove print photo" };
        }

        if (path) {
          const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
          if (removeError) app.log.warn(removeError, "Failed to remove print photo from storage");
        }

        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Print photo removal threw");
        reply.code(502);
        return { success: false, error: "Failed to remove print photo" };
      }
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/versions.zip",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId } = request.params;
      const supabase = request.supabase!;

      const access = await getProjectAccess(supabase, projectId, request.userId!);
      if (!access.role) {
        reply.code(404);
        return { success: false, error: "Project not found" };
      }
      // Downloading the existing versions as a zip is a read — unrestricted
      // for anyone with project access, including a downgraded former-Pro user.

      const { data: rows, error } = await supabase
        .from("versions")
        .select("id, version_number, file_name, file_path")
        .eq("project_id", projectId)
        .order("version_number", { ascending: true });
      if (error) {
        app.log.error(error, "Failed to list versions for zip");
        reply.code(502);
        return { success: false, error: "Failed to build archive" };
      }
      const versionRows = (rows ?? []) as Array<{
        id: string;
        version_number: number;
        file_name: string;
        file_path: string;
      }>;
      if (versionRows.length === 0) {
        reply.code(404);
        return { success: false, error: "No versions to download" };
      }

      const archive = archiver("zip", { zlib: { level: 9 } });
      reply.header("Content-Type", "application/zip");
      reply.header("Content-Disposition", `attachment; filename="project-${projectId}-versions.zip"`);
      reply.send(archive);

      archive.on("error", (err) => {
        app.log.error(err, "Archive stream error");
      });

      for (const version of versionRows) {
        const { data: blob, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .download(version.file_path);
        if (downloadError || !blob) {
          app.log.warn(downloadError, `Skipping version ${version.id} in zip — download failed`);
          continue;
        }
        const buffer = Buffer.from(await blob.arrayBuffer());
        archive.append(buffer, { name: `v${version.version_number}-${version.file_name}` });
      }

      await archive.finalize();
    },
  );

  // "What's the current default file" — the last approved version, or the
  // latest of any status if nothing's been approved yet. This is what
  // sharing/export should point to for Team projects (see plan); for
  // personal (Pro) projects it's just always the latest version, since
  // finalize() auto-approves there.
  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/stable-version",
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
        // Resolving the stable version is a read — unrestricted for anyone
        // with project access, including a downgraded former-Pro user.

        const stable = await getStableVersion(supabase, projectId);
        if (!stable) {
          reply.code(404);
          return { success: false, error: "No versions yet" };
        }

        const { data: download, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(stable.file_path, DOWNLOAD_URL_TTL_SECONDS);
        if (downloadError) {
          app.log.error(downloadError, "Failed to create signed download URL for stable version");
          reply.code(502);
          return { success: false, error: "The stable version's file is unavailable" };
        }

        return {
          success: true,
          data: {
            versionId: stable.id,
            versionNumber: stable.version_number,
            fileName: stable.file_name,
            approvalStatus: stable.approval_status,
            downloadUrl: download.signedUrl,
          },
        };
      } catch (err) {
        app.log.error(err, "Stable version lookup threw");
        reply.code(502);
        return { success: false, error: "Failed to load stable version" };
      }
    },
  );
}
