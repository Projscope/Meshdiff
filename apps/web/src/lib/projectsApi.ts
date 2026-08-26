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
  latestFileName: string | null;
  versionCount: number;
  latestPrintabilityStatus: "pass" | "warn" | "fail" | null;
  thumbnailUrl: string | null;
}

export interface ProjectsPage {
  projects: ProjectSummary[];
  total: number;
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
  approvalStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  createdAt: string;
  uploaderEmail: string | null;
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
  approvalStatus: "pending" | "approved" | "rejected";
  downloadUrl: string;
}

export interface CommentSummary {
  id: string;
  authorUserId: string | null;
  authorEmail: string | null;
  parentCommentId: string | null;
  body: string;
  position: [number, number, number];
  normal: [number, number, number] | null;
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

export function getStableVersion(projectId: string): Promise<Result<StableVersion>> {
  return request(`/projects/${projectId}/stable-version`);
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
): Promise<Result<CommentSummary>> {
  return request(`/projects/${projectId}/versions/${versionId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, position, normal, parentCommentId }),
  });
}

export function deleteComment(projectId: string, versionId: string, commentId: string): Promise<Result<true>> {
  return request(`/projects/${projectId}/versions/${versionId}/comments/${commentId}`, { method: "DELETE" });
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
