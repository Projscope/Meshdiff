import { getVersion, uploadProjectThumbnail } from "./projectsApi";
import { loadMeshGeometry } from "../engine/loadMesh";
import { renderMeshThumbnail } from "../engine/renderThumbnail";

/**
 * Downloads the given version's mesh, renders a fresh list/detail thumbnail
 * from it client-side, and uploads it — used both by ProjectDetailPage (a
 * project with versions but no thumbnail, e.g. a server-seeded Sample
 * Project) and ProjectsListPage (same gap, before the user has ever opened
 * the project once). Returns an object URL for immediate optimistic
 * display, or null on any failure — a missing thumbnail is cosmetic, never
 * worth surfacing an error for.
 */
export async function generateThumbnailFromVersion(projectId: string, versionId: string): Promise<string | null> {
  const detailResult = await getVersion(projectId, versionId);
  if (!detailResult.success) return null;
  // A version kept on its owner's computer has no file to render from.
  if (!detailResult.data.downloadUrl) return null;
  const response = await fetch(detailResult.data.downloadUrl);
  if (!response.ok) return null;
  const blob = await response.blob();
  const meshResult = await loadMeshGeometry(new File([blob], detailResult.data.fileName));
  if (!meshResult.success) return null;
  const thumbBlob = await renderMeshThumbnail(meshResult.data);
  if (!thumbBlob) return null;
  await uploadProjectThumbnail(projectId, thumbBlob);
  return URL.createObjectURL(thumbBlob);
}
