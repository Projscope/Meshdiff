import { API_BASE_URL } from "./api";
import { supabase } from "./supabaseClient";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";

export type Result<T> = { success: true; data: T } | { success: false; error: string };

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  teamId: string | null;
  /** Drives the walkthrough's list-page intro (SampleProjectIntro.tsx) —
   * same flag as ProjectDetail.isSample, just on the list shape too. */
  isSample: boolean;
  latestFileName: string | null;
  /** Used to lazily render a list-card thumbnail when one hasn't been
   * generated yet (see ProjectsListPage.tsx) — null once there are no
   * versions to render from. */
  latestVersionId: string | null;
  versionCount: number;
  latestPrintabilityStatus: "pass" | "warn" | "fail" | null;
  thumbnailUrl: string | null;
}

export interface ProjectsPage {
  projects: ProjectSummary[];
  total: number;
}

/** The 5-state review machine (see API migration 0027) — replaces the old
 * flat pending/approved/rejected. 'draft' is reachable only via an
 * explicit "save as draft" action (uploads still default straight to
 * 'in_review'); 'superseded' is set automatically when a newer version in
 * the same project is approved. */
export type ApprovalStatus = "draft" | "in_review" | "changes_requested" | "approved" | "superseded";

/** null on non-team (Pro) projects — gates don't apply there. */
export interface GateStatus {
  satisfiedCount: number;
  totalCount: number;
}

export interface VersionSummary {
  id: string;
  versionNumber: number;
  fileName: string;
  fileFormat: string;
  fileSizeBytes: number;
  triangleCount: number | null;
  changeSummary: string | null;
  printabilityStatus: "pass" | "warn" | "fail" | null;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  createdAt: string;
  uploaderEmail: string | null;
  gateStatus: GateStatus | null;
  /** Comments still in 'open' or 'reopened' status on this version — see
   * migration 0030. Not restricted to team projects; personal Pro projects
   * have comment threads too. */
  unresolvedCommentCount: number;
}

export interface ApprovalGate {
  id: string;
  label: string;
  sortOrder: number;
}

export interface ReviewHistoryEntry {
  id: string;
  actorEmail: string | null;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  createdAt: string;
}

export interface SlicerProfileAttachment {
  fileName: string;
  downloadUrl: string;
}

export interface PrintPhotoAttachment {
  fileName: string;
  caption: string | null;
  downloadUrl: string;
}

export interface VersionDetail extends VersionSummary {
  downloadUrl: string;
  previousVersionId: string | null;
  slicerProfile: SlicerProfileAttachment | null;
  printPhoto: PrintPhotoAttachment | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  teamId: string | null;
  thumbnailUrl: string | null;
  /** This user's access level for the project. 'approver' is an "upgraded
   * member" — can approve/reject versions, nothing else admin-gated. */
  myRole: "owner" | "admin" | "approver" | "member";
  /** True for the one auto-seeded project every new signup gets (see
   * seedSampleProject.ts) — drives the first-login walkthrough
   * (sampleProjectTour.ts / SampleProjectTour.tsx). Not derived from the
   * name/description client-side since both are user-editable. */
  isSample: boolean;
}

export interface TeamMember {
  userId: string;
  email: string | null;
  role: "admin" | "approver" | "member";
  joinedAt: string;
  isOwner: boolean;
}

export interface TeamDetail {
  id: string;
  name: string;
  myRole: "admin" | "approver" | "member";
  isOwner: boolean;
  seats: { purchased: number; used: number } | null;
  members: TeamMember[];
}

export interface StableVersion {
  versionId: string;
  versionNumber: number;
  fileName: string;
  approvalStatus: ApprovalStatus;
  downloadUrl: string;
}

export type CommentStatus = "open" | "resolved" | "reopened";
export type CommentPriority = "low" | "normal" | "high";

export interface CommentSummary {
  id: string;
  authorUserId: string | null;
  authorEmail: string | null;
  parentCommentId: string | null;
  body: string;
  position: [number, number, number];
  normal: [number, number, number] | null;
  status: CommentStatus;
  assigneeUserId: string | null;
  assigneeEmail: string | null;
  priority: CommentPriority | null;
  statusChangedAt: string | null;
  createdAt: string;
}

export async function request<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        // Fastify's JSON body parser rejects an empty body when this
        // header is present ("Body cannot be empty when content-type is
        // set to 'application/json'") — only send it when there's an
        // actual body, e.g. finalizeVersion()'s bodyless POST would 400.
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    const body = (await response.json()) as Result<T>;
    // The backend's own JWT check (requireAuth) rejects an expired/invalid
    // access token with 401 independently of Supabase-js's client-side
    // refresh timer — e.g. after a long-backgrounded tab whose refresh
    // didn't fire. Sign out here so the stale session doesn't just show
    // broken/failing pages; AuthProvider's onAuthStateChange listener picks
    // this up and ProtectedRoute redirects to /login on its own.
    if (response.status === 401) {
      await supabase.auth.signOut();
    }
    return body;
  } catch {
    return { success: false, error: "Network error, please try again" };
  }
}

export function listProjects(page = 1, pageSize = 10, sort: "name" | "date-newest" | "date-oldest" = "date-newest"): Promise<Result<ProjectsPage>> {
  return request(`/projects?page=${page}&pageSize=${pageSize}&sort=${sort}`);
}

export function getWorkspace(): Promise<Result<{ name: string }>> {
  return request("/workspace");
}

export function updateWorkspace(name: string): Promise<Result<{ name: string }>> {
  return request("/workspace", { method: "PATCH", body: JSON.stringify({ name }) });
}

export function getProjectThumbnailUploadUrl(projectId: string): Promise<Result<{ uploadUrl: string }>> {
  return request(`/projects/${projectId}/thumbnail-upload-url`, { method: "POST" });
}

/** Best-effort: renders a snapshot of the just-uploaded mesh and pushes it to
 * storage so the projects list picks up a fresh thumbnail. Never throws —
 * failures here shouldn't block the upload flow that triggered them. */
export async function uploadProjectThumbnail(projectId: string, geometryBlob: Blob): Promise<void> {
  const urlResult = await getProjectThumbnailUploadUrl(projectId);
  if (!urlResult.success) return;
  try {
    await fetch(urlResult.data.uploadUrl, {
      method: "PUT",
      body: geometryBlob,
      headers: { "Content-Type": "image/png" },
    });
  } catch {
    // best-effort — a stale/missing thumbnail is not worth surfacing an error for
  }
}

/** Best-effort: removes the project's thumbnail (e.g. its last version was
 * deleted, so there's no model left to depict). */
export async function clearProjectThumbnail(projectId: string): Promise<void> {
  await request(`/projects/${projectId}/thumbnail`, { method: "DELETE" });
}

export function getProject(projectId: string): Promise<Result<ProjectDetail>> {
  return request(`/projects/${projectId}`);
}

export function deleteProject(projectId: string): Promise<Result<true>> {
  return request(`/projects/${projectId}`, { method: "DELETE" });
}

export function setProjectTeam(projectId: string, teamId: string | null): Promise<Result<{ teamId: string | null }>> {
  return request(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ teamId }),
  });
}

export function updateProject(
  projectId: string,
  updates: { name: string; description: string | null },
): Promise<Result<{ name: string; description: string | null }>> {
  return request(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function listMyTeams(): Promise<
  Result<Array<{ id: string; name: string; myRole: "admin" | "approver" | "member" }>>
> {
  return request("/teams");
}

export function createTeam(name: string): Promise<Result<{ id: string; name: string; createdAt: string }>> {
  return request("/teams", { method: "POST", body: JSON.stringify({ name }) });
}

export function getTeam(teamId: string): Promise<Result<TeamDetail>> {
  return request(`/teams/${teamId}`);
}

export interface TeamPendingVersion extends VersionSummary {
  projectId: string;
  projectName: string;
}

export function getTeamPendingVersions(teamId: string): Promise<Result<TeamPendingVersion[]>> {
  return request(`/teams/${teamId}/pending-versions`);
}

export interface TeamAuditLogEntry {
  id: string;
  actorEmail: string | null;
  action: "team_created" | "member_invited" | "member_removed" | "version_approved" | "version_rejected";
  summary: string;
  createdAt: string;
}

export function getTeamAuditLog(teamId: string): Promise<Result<TeamAuditLogEntry[]>> {
  return request(`/teams/${teamId}/audit-log`);
}

export function addTeamMember(
  teamId: string,
  email: string,
  role: "admin" | "approver" | "member",
): Promise<Result<{ userId: string; role: string }>> {
  return request(`/teams/${teamId}/members`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export function removeTeamMember(teamId: string, userId: string): Promise<Result<true>> {
  return request(`/teams/${teamId}/members/${userId}`, { method: "DELETE" });
}

export function updateTeamMemberRole(
  teamId: string,
  userId: string,
  role: "admin" | "approver" | "member",
): Promise<Result<{ userId: string; role: string }>> {
  return request(`/teams/${teamId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export interface SubscriptionStatus {
  tier: "free" | "pro" | "team";
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** "pro" (real subscription, access via a Team owner's seats, or still
   * within the 14-day free-signup trial) | "restricted" (no subscription,
   * no team access, trial expired — most routes 403). */
  accountStatus: "pro" | "restricted";
  /** true for the first 14 days after a free signup — full access with no
   * subscription. See getAccountAccess() in apps/api/src/lib/subscription.ts. */
  isTrialing: boolean;
  /** Whole days left in the trial window, or null when not trialing. */
  trialDaysRemaining: number | null;
  /** Only populated for a Team subscription's owner — a member riding the
   * owner's seats has no purchased/used figure of their own. */
  seats: { purchased: number; used: number } | null;
}

export function getSubscription(): Promise<Result<SubscriptionStatus>> {
  return request("/billing/subscription");
}

/** Returns a Stripe Checkout URL to redirect the browser to — Checkout is a
 * Stripe-hosted page, not Stripe Elements (see CLAUDE.md), so there's
 * nothing to render here beyond the redirect itself. */
function startCheckout(tier: "pro" | "team", couponCode?: string): Promise<Result<{ url: string }>> {
  return request("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ tier, ...(couponCode ? { couponCode } : {}) }),
  });
}

export const startProCheckout = (couponCode?: string) => startCheckout("pro", couponCode);
export const startTeamCheckout = () => startCheckout("team");

export interface ActiveCoupon {
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  durationMonths: number | null;
}

/** The general-availability coupon, if any is currently active — see
 * GET /billing/coupons on the backend for why the hand-emailed
 * 50%-off-3-months code never appears here. */
export function listActiveCoupons(): Promise<Result<ActiveCoupon[]>> {
  return request("/billing/coupons");
}

/** Same shape as startProCheckout() — a URL to redirect to, this time for
 * Stripe's hosted Billing Portal (manage payment method, view invoices). */
export function openBillingPortal(): Promise<Result<{ url: string }>> {
  return request("/billing/portal", { method: "POST" });
}

/** Cancels at the end of the current billing period — Pro access continues
 * through what's already been paid for. */
export function cancelSubscription(): Promise<Result<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string }>> {
  return request("/billing/cancel", { method: "POST" });
}

/** Undoes a pending cancel-at-period-end, before the period actually ends. */
export function resumeSubscription(): Promise<Result<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string }>> {
  return request("/billing/resume", { method: "POST" });
}

/** Lets a free-tier trial user pick which plan to trial — see
 * TrialTierChoiceModal.tsx. Only takes effect while actually trialing; a
 * harmless no-op otherwise (see PATCH /billing/trial-tier). */
export function setTrialTier(tier: "pro" | "team"): Promise<Result<{ tier: string }>> {
  return request("/billing/trial-tier", { method: "PATCH", body: JSON.stringify({ tier }) });
}

/** Switches an EXISTING Pro/Team subscription to the other tier in place
 * (prorated) — distinct from startProCheckout()/startTeamCheckout(), which
 * always start a brand-new subscription and would double-bill someone who
 * already has one. Only valid when already on the other paid tier. */
export function changePlan(tier: "pro" | "team"): Promise<Result<{ tier: "pro" | "team" }>> {
  return request("/billing/change-plan", { method: "POST", body: JSON.stringify({ tier }) });
}

export function approveVersion(projectId: string, versionId: string): Promise<Result<VersionSummary>> {
  return request(`/projects/${projectId}/versions/${versionId}/approve`, { method: "POST" });
}

/** Kept as "reject" (route + name) for backward compatibility with the
 * existing two-button UI — the server treats this identically to the
 * newer /request-changes route (see versions.ts's handleRequestChanges). */
export function rejectVersion(
  projectId: string,
  versionId: string,
  reason?: string,
): Promise<Result<VersionSummary>> {
  return request(`/projects/${projectId}/versions/${versionId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function submitVersionForReview(projectId: string, versionId: string): Promise<Result<VersionSummary>> {
  return request(`/projects/${projectId}/versions/${versionId}/submit-for-review`, { method: "POST" });
}

export function getVersionReviewHistory(
  projectId: string,
  versionId: string,
): Promise<Result<ReviewHistoryEntry[]>> {
  return request(`/projects/${projectId}/versions/${versionId}/review-history`);
}

export function getStableVersion(projectId: string): Promise<Result<StableVersion>> {
  return request(`/projects/${projectId}/stable-version`);
}

export interface VersionGateFulfillment extends ApprovalGate {
  satisfied: boolean;
}

export function listApprovalGates(projectId: string): Promise<Result<ApprovalGate[]>> {
  return request(`/projects/${projectId}/approval-gates`);
}

export function listVersionApprovalGates(
  projectId: string,
  versionId: string,
): Promise<Result<VersionGateFulfillment[]>> {
  return request(`/projects/${projectId}/versions/${versionId}/approval-gates`);
}

export function createApprovalGate(projectId: string, label: string): Promise<Result<ApprovalGate>> {
  return request(`/projects/${projectId}/approval-gates`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function deleteApprovalGate(projectId: string, gateId: string): Promise<Result<true>> {
  return request(`/projects/${projectId}/approval-gates/${gateId}`, { method: "DELETE" });
}

export function setGateFulfillment(
  projectId: string,
  versionId: string,
  gateId: string,
  satisfied: boolean,
): Promise<Result<true>> {
  return request(`/projects/${projectId}/versions/${versionId}/approval-gates/${gateId}`, {
    method: "PATCH",
    body: JSON.stringify({ satisfied }),
  });
}

// In-app only for this milestone — no email delivery (see plan). Polled by
// NotificationBell rather than pushed.
export interface NotificationSummary {
  id: string;
  type:
    | "mention"
    | "comment_assigned"
    | "version_state_changed"
    | "review_requested"
    | "gate_completed"
    | "comment_status_changed"
    | "feedback_submitted";
  projectId: string | null;
  versionId: string | null;
  commentId: string | null;
  feedbackId: string | null;
  summary: string;
  readAt: string | null;
  createdAt: string;
}

export function listNotifications(unreadOnly = false): Promise<Result<NotificationSummary[]>> {
  return request(`/notifications${unreadOnly ? "?unreadOnly=true" : ""}`);
}

export function getUnreadNotificationCount(): Promise<Result<{ count: number }>> {
  return request("/notifications/unread-count");
}

export function markNotificationRead(id: string): Promise<Result<true>> {
  return request(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<Result<true>> {
  return request("/notifications/mark-all-read", { method: "POST" });
}

export function createProject(name: string, description: string): Promise<Result<ProjectSummary>> {
  return request("/projects", {
    method: "POST",
    body: JSON.stringify({ name, description: description || undefined }),
  });
}

export function listVersions(projectId: string): Promise<Result<VersionSummary[]>> {
  return request(`/projects/${projectId}/versions`);
}

export function getVersion(projectId: string, versionId: string): Promise<Result<VersionDetail>> {
  return request(`/projects/${projectId}/versions/${versionId}`);
}

export function getDiff(versionAId: string, versionBId: string): Promise<Result<VoxelDiffStats>> {
  return request(`/diff/${versionAId}/${versionBId}`);
}

export function deleteVersion(projectId: string, versionId: string): Promise<Result<true>> {
  return request(`/projects/${projectId}/versions/${versionId}`, { method: "DELETE" });
}

export function createVersion(
  projectId: string,
  file: File,
): Promise<Result<{ versionId: string; versionNumber: number; uploadUrl: string }>> {
  return request(`/projects/${projectId}/versions`, {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
  });
}

export function getSlicerProfileUploadUrl(
  projectId: string,
  versionId: string,
  file: File,
): Promise<Result<{ uploadUrl: string }>> {
  return request(`/projects/${projectId}/versions/${versionId}/slicer-profile`, {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
  });
}

export function deleteSlicerProfile(projectId: string, versionId: string): Promise<Result<true>> {
  return request(`/projects/${projectId}/versions/${versionId}/slicer-profile`, { method: "DELETE" });
}

export function getPrintPhotoUploadUrl(
  projectId: string,
  versionId: string,
  file: File,
  caption?: string,
): Promise<Result<{ uploadUrl: string }>> {
  return request(`/projects/${projectId}/versions/${versionId}/print-photo`, {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, fileSize: file.size, caption }),
  });
}

export function deletePrintPhoto(projectId: string, versionId: string): Promise<Result<true>> {
  return request(`/projects/${projectId}/versions/${versionId}/print-photo`, { method: "DELETE" });
}

export async function uploadVersionBytes(uploadUrl: string, file: File): Promise<Result<true>> {
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": "application/octet-stream" },
    });
    if (!response.ok) {
      return { success: false, error: `Upload failed (${response.status})` };
    }
    return { success: true, data: true };
  } catch {
    return { success: false, error: "Upload failed, please try again" };
  }
}

export function finalizeVersion(
  projectId: string,
  versionId: string,
  stats: VoxelDiffStats,
): Promise<Result<{ versionId: string; triangleCount: number; changeSummary: string; printabilityStatus: string }>> {
  return request(`/projects/${projectId}/versions/${versionId}/finalize`, {
    method: "POST",
    body: JSON.stringify({ stats }),
  });
}

export function listComments(projectId: string, versionId: string): Promise<Result<CommentSummary[]>> {
  return request(`/projects/${projectId}/versions/${versionId}/comments`);
}

export function createComment(
  projectId: string,
  versionId: string,
  body: string,
  position: [number, number, number],
  normal?: [number, number, number],
  parentCommentId?: string,
  assigneeUserId?: string,
  priority?: CommentPriority,
): Promise<Result<CommentSummary>> {
  return request(`/projects/${projectId}/versions/${versionId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, position, normal, parentCommentId, assigneeUserId, priority }),
  });
}

export function deleteComment(projectId: string, versionId: string, commentId: string): Promise<Result<true>> {
  return request(`/projects/${projectId}/versions/${versionId}/comments/${commentId}`, { method: "DELETE" });
}

export function updateComment(
  projectId: string,
  versionId: string,
  commentId: string,
  updates: { status?: CommentStatus; assigneeUserId?: string | null; priority?: CommentPriority | null },
): Promise<Result<CommentSummary>> {
  return request(`/projects/${projectId}/versions/${versionId}/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/** Fetches the zip with the auth header attached (a plain <a href> can't send one) and triggers a browser download. */
export async function downloadAllVersionsZip(projectId: string): Promise<Result<true>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/versions.zip`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      if (response.status === 401) await supabase.auth.signOut();
      const body = (await response.json().catch(() => null)) as Result<never> | null;
      return { success: false, error: body?.success === false ? body.error : `Download failed (${response.status})` };
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project-${projectId}-versions.zip`;
    link.click();
    URL.revokeObjectURL(url);
    return { success: true, data: true };
  } catch {
    return { success: false, error: "Download failed, please try again" };
  }
}

/** Downloads a single version's file (distinct from downloadAllVersionsZip, which bundles every version). */
export async function downloadVersionFile(projectId: string, versionId: string): Promise<Result<true>> {
  const result = await getVersion(projectId, versionId);
  if (!result.success) return result;

  try {
    const response = await fetch(result.data.downloadUrl);
    if (!response.ok) {
      return { success: false, error: `Download failed (${response.status})` };
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.data.fileName;
    link.click();
    URL.revokeObjectURL(url);
    return { success: true, data: true };
  } catch {
    return { success: false, error: "Download failed, please try again" };
  }
}

// uploadVersion() lives in ./uploadVersion.ts, not here — it needs
// loadMeshGeometry/computeVoxelDiffOffThread, which statically import
// "three", and this file is imported by nearly every page (including
// plain CRUD pages with no 3D viewer) for things like
// listProjects()/getProject(). See that file's doc comment for why.

/** Create a shareable comparison link from project versions. */
export async function createComparisonShare(
  projectId: string,
  versionAId: string,
  versionBId: string,
  mode: "voxel" | "surface",
  toleranceMm: number,
  expiresInDays: 1 | 3 | 7,
): Promise<Result<{ id: string; url: string; expiresAt: string }>> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) {
    return { success: false, error: "Not authenticated" };
  }

  const response = await fetch(`${API_BASE_URL}/comparison-share`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.session.access_token}`,
    },
    body: JSON.stringify({
      projectId,
      versionAId,
      versionBId,
      mode,
      toleranceMm,
      expiresInDays,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return { success: false, error: data.error ?? "Failed to create share" };
  }
  return data as Result<{ id: string; url: string; expiresAt: string }>;
}
