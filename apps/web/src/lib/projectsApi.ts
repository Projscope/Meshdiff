import { API_BASE_URL } from "./api";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";

export type Result<T> = { success: true; data: T } | { success: false; error: string };

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  latestFileName: string | null;
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
  approvalStatus: "pending" | "approved";
  createdAt: string;
}

export interface VersionDetail extends VersionSummary {
  downloadUrl: string;
  previousVersionId: string | null;
}

export interface CommentSummary {
  id: string;
  body: string;
  position: [number, number, number];
  normal: [number, number, number] | null;
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const body = (await response.json()) as Result<T>;
    return body;
  } catch {
    return { success: false, error: "Network error, please try again" };
  }
}

export function listProjects(): Promise<Result<ProjectSummary[]>> {
  return request("/projects");
}

export function getProject(projectId: string): Promise<Result<{ id: string; name: string; description: string | null }>> {
  return request(`/projects/${projectId}`);
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

export function createVersion(
  projectId: string,
  file: File,
): Promise<Result<{ versionId: string; versionNumber: number; uploadUrl: string }>> {
  return request(`/projects/${projectId}/versions`, {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
  });
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
): Promise<Result<{ versionId: string; triangleCount: number; changeSummary: string; printabilityStatus: string }>> {
  return request(`/projects/${projectId}/versions/${versionId}/finalize`, { method: "POST" });
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
): Promise<Result<CommentSummary>> {
  return request(`/projects/${projectId}/versions/${versionId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, position, normal }),
  });
}

/** Orchestrates the 3-step upload flow: allocate -> PUT bytes -> finalize (diff + summary). */
export async function uploadVersion(
  projectId: string,
  file: File,
): Promise<Result<{ versionId: string }>> {
  const allocated = await createVersion(projectId, file);
  if (!allocated.success) return allocated;

  const uploaded = await uploadVersionBytes(allocated.data.uploadUrl, file);
  if (!uploaded.success) return uploaded;

  const finalized = await finalizeVersion(projectId, allocated.data.versionId);
  if (!finalized.success) return finalized;

  return { success: true, data: { versionId: allocated.data.versionId } };
}
