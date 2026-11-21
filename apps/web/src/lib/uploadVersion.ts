import { loadMeshGeometry, extensionOf } from "../engine/loadMesh";
import { computeVoxelDiffOffThread } from "./voxelDiffWorkerClient";
import {
  createVersion,
  uploadVersionBytes,
  deleteVersion,
  getVersion,
  finalizeVersion,
  type Result,
  type VersionDetail,
} from "./projectsApi";

// Kept out of projectsApi.ts deliberately: loadMesh.ts and
// voxelDiffWorkerClient.ts both statically import "three", and
// projectsApi.ts is imported by nearly every page (including plain CRUD
// pages with no 3D viewer at all — ProjectsListPage, AdminDashboardPage,
// etc.) for things like listProjects()/getProject(). Before this split, a
// Lighthouse audit found three.js's vendor chunk being pulled into every
// page's bundle graph purely because of this one function living in the
// same file — even pages with zero mesh rendering paid for it. Splitting
// upload's mesh-diffing logic into its own module means only the one page
// that actually calls uploadVersion (ProjectDetailPage, already
// route-level lazy-loaded — see router.tsx) pulls this weight in.

/**
 * Orchestrates the upload flow: allocate -> PUT bytes -> diff client-side ->
 * finalize (store the result). The diff itself (parse + voxelize + BVH)
 * runs entirely in this browser tab, off the main thread — same engine the
 * free Live Diff tool already uses — rather than on the shared server. That
 * used to happen server-side in finalize(), which was the actual driver
 * behind a series of out-of-memory crashes on Render: one process's memory
 * was shared across every concurrent upload, so a single large or
 * malformed mesh (or several diffs firing at once) could take down every
 * user's request, not just the uploader's own. Computing it client-side
 * means a large file can only ever affect that one user's tab.
 *
 * previousVersionId is the version this upload should be diffed against
 * (i.e. whatever was the latest version before this upload) — null for a
 * project's first version, in which case the mesh is diffed against itself
 * (matching the old server behavior) so wall-thickness/overhang/
 * printability stats still come out real, just with zero deltas.
 */
export async function uploadVersion(
  projectId: string,
  file: File,
  previousVersionId: string | null,
): Promise<Result<{ versionId: string }>> {
  // The diff needs the previous version's file. One synced from the desktop app
  // keeps its model on its owner's computer, so there is nothing to download:
  // say so now, before allocating a version and uploading this file for nothing.
  let previousVersion: VersionDetail | null = null;
  if (previousVersionId) {
    const previous = await getVersion(projectId, previousVersionId);
    if (!previous.success) return previous;
    if (!previous.data.downloadUrl) {
      return {
        success: false,
        error:
          "The previous version was synced from the desktop app and its file isn't stored here, so this upload can't be compared with it. Add new versions from the desktop app, or ask its owner.",
      };
    }
    previousVersion = previous.data;
  }

  const allocated = await createVersion(projectId, file);
  if (!allocated.success) return allocated;
  const versionId = allocated.data.versionId;

  // Any failure after this point rolls back the allocated row — otherwise
  // a failed diff/upload leaves an unfinalized version (triangleCount still
  // null, shown as "? tris") sitting in the list forever, since nothing
  // else ever retries or cleans it up. The server allows deleting your own
  // still-unfinalized upload specifically for this (see versions.ts's
  // DELETE handler — normally owner/admin-only).
  async function fail(error: string): Promise<Result<{ versionId: string }>> {
    await deleteVersion(projectId, versionId);
    return { success: false, error };
  }

  const uploaded = await uploadVersionBytes(allocated.data.uploadUrl, file);
  if (!uploaded.success) return fail(uploaded.error);

  const currentGeoResult = await loadMeshGeometry(file);
  if (!currentGeoResult.success) {
    return fail(currentGeoResult.error);
  }
  const currentFormat = extensionOf(file.name);

  let previousGeometry = currentGeoResult.data;
  let previousFormat = currentFormat;
  if (previousVersion?.downloadUrl) {
    let previousBlob: Blob;
    try {
      const response = await fetch(previousVersion.downloadUrl);
      if (!response.ok) throw new Error();
      previousBlob = await response.blob();
    } catch {
      return fail("Failed to read previous version file");
    }
    const previousGeoResult = await loadMeshGeometry(
      new File([previousBlob], previousVersion.fileName),
    );
    if (!previousGeoResult.success) {
      return fail(previousGeoResult.error);
    }
    previousGeometry = previousGeoResult.data;
    previousFormat = previousVersion.fileFormat;
  }

  const diffResult = await computeVoxelDiffOffThread(previousGeometry, currentGeoResult.data, {
    fileFormatA: previousFormat,
    fileFormatB: currentFormat,
  });
  if (!diffResult.success) {
    return fail(diffResult.error);
  }

  const finalized = await finalizeVersion(projectId, versionId, diffResult.data.stats);
  if (!finalized.success) return fail(finalized.error);

  return { success: true, data: { versionId } };
}
