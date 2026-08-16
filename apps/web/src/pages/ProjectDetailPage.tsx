import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getProject,
  getVersion,
  listVersions,
  uploadVersion,
  downloadVersionFile,
  deleteVersion,
  deleteProject,
  getDiff,
  approveVersion,
  rejectVersion,
  listMyTeams,
  setProjectTeam,
  uploadProjectThumbnail,
  clearProjectThumbnail,
  type VersionSummary,
  type ProjectDetail,
} from "../lib/projectsApi";
import ApprovalBadge from "../components/ApprovalBadge";
import ConfirmDialog from "../components/ConfirmDialog";
import EditProjectModal from "../components/EditProjectModal";
import RejectVersionModal from "../components/RejectVersionModal";
import PrintabilityRulesTooltip from "../components/PrintabilityRulesTooltip";
import { useRefreshProjectsSidebar, useAccountStatus } from "../components/ProjectsLayout";
import { loadMeshGeometry } from "../engine/loadMesh";
import { renderMeshThumbnail } from "../engine/renderThumbnail";

const ALLOWED_EXTENSIONS = [".stl", ".3mf", ".obj"];
// Kept in sync with the server-side limit (apps/api/src/lib/fileSizeLimit.ts)
// — this is just an early UI check so an oversized file is rejected before
// spending time on a signed-upload-URL round trip; the server enforces the
// real boundary independently.
const MAX_FILE_BYTES = 50 * 1024 * 1024;

interface Comparison {
  fromVersion: VersionSummary;
  toVersion: VersionSummary;
  volumeDeltaPercent: number | null;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function StatCard({ label, value, accent }: { label: string; value: React.ReactNode; accent?: "amber" }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${accent === "amber" ? "text-amber-400" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { isPro } = useAccountStatus();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; versionNumber: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingReject, setPendingReject] = useState<{ id: string; versionNumber: number } | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [myTeams, setMyTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [isChangingTeam, setIsChangingTeam] = useState(false);
  const [compareAId, setCompareAId] = useState("");
  const [compareBId, setCompareBId] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshSidebar = useRefreshProjectsSidebar();

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [projectResult, versionsResult] = await Promise.all([
      getProject(projectId),
      listVersions(projectId),
    ]);
    if (projectResult.success) setProject(projectResult.data);
    // The sidebar's per-project status dot and version count come from this
    // same data — keep it in sync any time this page re-fetches (upload,
    // delete, approve/reject), not just on route changes.
    refreshSidebar();
    if (!versionsResult.success) return;

    const sorted = [...versionsResult.data].sort((a, b) => a.versionNumber - b.versionNumber);
    setVersions(sorted);
    if (sorted.length > 1) {
      setCompareAId((prev) => (prev && sorted.some((v) => v.id === prev) ? prev : sorted[sorted.length - 2].id));
      setCompareBId((prev) => (prev && sorted.some((v) => v.id === prev) ? prev : sorted[sorted.length - 1].id));
    }

    const pairs = sorted.slice(1).map((toVersion, index) => ({ fromVersion: sorted[index], toVersion }));
    const diffs = await Promise.all(
      pairs.map(({ fromVersion, toVersion }) => getDiff(fromVersion.id, toVersion.id)),
    );
    setComparisons(
      pairs.map((pair, index) => {
        const diffResult = diffs[index];
        return {
          ...pair,
          volumeDeltaPercent: diffResult.success ? diffResult.data.approxVolumeDeltaPercent : null,
        };
      }),
    );
    return sorted;
  }, [projectId, refreshSidebar]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-generate thumbnail for projects that have versions but no thumbnail yet
  // (e.g., sample projects created server-side on signup)
  useEffect(() => {
    if (!project || !projectId || project.thumbnailUrl || versions.length === 0) return;
    const latestVersion = versions[versions.length - 1];
    if (!latestVersion) return;
    void refreshProjectThumbnailFromVersion(projectId, latestVersion.id);
  }, [project?.id, project?.thumbnailUrl, versions.length, projectId]);

  useEffect(() => {
    listMyTeams().then((result) => {
      if (result.success) setMyTeams(result.data);
    });
  }, []);

  async function handleChangeTeam(teamId: string | null) {
    if (!projectId) return;
    setIsChangingTeam(true);
    const result = await setProjectTeam(projectId, teamId);
    setIsChangingTeam(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  async function handleFile(file: File) {
    if (!projectId) return;
    if (!isPro) {
      setError("Subscribe to Pro to upload new versions.");
      return;
    }
    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError("File must be an STL, 3MF, or OBJ file");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("File must be under 50MB");
      return;
    }

    setIsUploading(true);
    setError(null);
    const result = await uploadVersion(projectId, file);
    setIsUploading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    void refreshProjectThumbnail(projectId, file);
    await refresh();
  }

  // Best-effort: re-render the project list thumbnail from the model that
  // was just uploaded. Runs off the same File already in memory rather than
  // round-tripping through the server, and never blocks or fails the
  // upload flow that triggered it.
  async function refreshProjectThumbnail(targetProjectId: string, file: File) {
    const meshResult = await loadMeshGeometry(file);
    if (!meshResult.success) return;
    const blob = await renderMeshThumbnail(meshResult.data);
    if (!blob) return;
    await uploadProjectThumbnail(targetProjectId, blob);
  }

  // Same as above, but for when there's no local File in memory (e.g. after
  // deleting the version the thumbnail was rendered from) — downloads the
  // now-latest version's file to re-render from it instead.
  async function refreshProjectThumbnailFromVersion(targetProjectId: string, versionId: string) {
    const detailResult = await getVersion(targetProjectId, versionId);
    if (!detailResult.success) return;
    const response = await fetch(detailResult.data.downloadUrl);
    if (!response.ok) return;
    const blob = await response.blob();
    const meshResult = await loadMeshGeometry(new File([blob], detailResult.data.fileName));
    if (!meshResult.success) return;
    const thumbBlob = await renderMeshThumbnail(meshResult.data);
    if (!thumbBlob) return;
    await uploadProjectThumbnail(targetProjectId, thumbBlob);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  async function handleDownloadVersion(versionId: string) {
    if (!projectId) return;
    const result = await downloadVersionFile(projectId, versionId);
    if (!result.success) setError(result.error);
  }

  async function handleConfirmDelete() {
    if (!projectId || !pendingDelete) return;
    // The thumbnail was rendered from whichever version is "latest" — only
    // deleting that one can change what should be shown, so capture it
    // before the list is refreshed out from under us.
    const wasLatest = versions.length > 0 && versions[versions.length - 1].id === pendingDelete.id;

    setIsDeleting(true);
    const result = await deleteVersion(projectId, pendingDelete.id);
    setIsDeleting(false);
    setPendingDelete(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    const updated = await refresh();
    if (wasLatest) {
      if (updated && updated.length > 0) {
        void refreshProjectThumbnailFromVersion(projectId, updated[updated.length - 1].id);
      } else {
        void clearProjectThumbnail(projectId);
      }
    }
  }

  async function handleShare() {
    await navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  async function handleDeleteProject() {
    if (!projectId) return;
    setIsDeletingProject(true);
    const result = await deleteProject(projectId);
    setIsDeletingProject(false);
    if (!result.success) {
      setIsDeleteProjectOpen(false);
      setError(result.error);
      return;
    }
    navigate("/projects");
  }

  async function handleApprove(versionId: string) {
    if (!projectId) return;
    const result = await approveVersion(projectId, versionId);
    if (!result.success) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  async function handleConfirmReject(reason?: string) {
    if (!projectId || !pendingReject) return;
    setIsRejecting(true);
    const result = await rejectVersion(projectId, pendingReject.id, reason);
    setIsRejecting(false);
    setPendingReject(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  // Only a team admin/approver (or the owner, who can always review — see
  // canReviewVersions() server-side) sees approve/reject controls, and
  // only on Team projects; Pro projects auto-approve on upload so there's
  // never anything pending to review there. 'approver' is an "upgraded
  // member" — reviews only, no other admin-gated capability.
  const canReview =
    !!project?.teamId &&
    (project.myRole === "owner" || project.myRole === "admin" || project.myRole === "approver");

  // Mirrors the server's getStableVersion(): last approved version by
  // version_number, falling back to the latest of any status.
  const stableVersionId = (() => {
    const approvedVersions = versions.filter((v) => v.approvalStatus === "approved");
    const pool = approvedVersions.length > 0 ? approvedVersions : versions;
    return pool.length > 0 ? pool[pool.length - 1].id : null;
  })();

  const openReviews = versions.filter((v) => v.approvalStatus === "pending").length;
  const decided = versions.filter((v) => v.versionNumber > 1 && v.approvalStatus !== "pending").length;
  const approved = versions.filter((v) => v.versionNumber > 1 && v.approvalStatus === "approved").length;
  const approvalRate = decided === 0 ? null : Math.round((approved / decided) * 100);

  // Version comparison (diff history, "compare any two") is a Team feature —
  // Pro projects (no team_id) only track a flat model history.
  const isTeam = !!project?.teamId;

  // "Open Reviews"/"Approval Rate" are meaningless for Pro (every upload
  // auto-approves, so they'd always read 0/100%) — show the latest version's
  // printability and volume change instead, which is actually actionable.
  const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;
  const latestVolumeDeltaPercent = comparisons.length > 0 ? comparisons[comparisons.length - 1].volumeDeltaPercent : null;
  const PRINTABILITY_LABEL: Record<"pass" | "warn" | "fail", string> = { pass: "Pass", warn: "Warning", fail: "Fail" };
  const PRINTABILITY_COLOR: Record<"pass" | "warn" | "fail", string> = {
    pass: "text-emerald-400",
    warn: "text-amber-400",
    fail: "text-red-400",
  };

  return (
    <div
      className="mx-auto max-w-5xl px-6 py-8"
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl,.obj,.3mf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-neutral-500">
            <Link to="/projects" className="hover:text-neutral-300">
              Projects
            </Link>
            {project && <> / {project.name}</>}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">{project?.name ?? "…"}</h1>
            {project && (project.myRole === "owner" || project.myRole === "admin") && (
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                title="Edit project name and description"
                className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                </svg>
              </button>
            )}
          </div>
          {project?.description && <p className="mt-1 text-sm text-neutral-400">{project.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {project?.myRole === "owner" && myTeams.length > 0 && (
            <select
              value={project.teamId ?? ""}
              disabled={isChangingTeam}
              onChange={(event) => void handleChangeTeam(event.target.value || null)}
              title="Move this project into a team, or keep it personal"
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs text-neutral-300 disabled:opacity-50"
            >
              <option value="">Personal</option>
              {myTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}
          {project?.teamId && (
            <button
              type="button"
              onClick={() => void handleShare()}
              className="flex items-center gap-1.5 rounded border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-200 hover:border-neutral-500"
            >
              🔗 {shareCopied ? "Copied!" : "Share Project"}
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || !isPro}
            title={!isPro ? "Upgrade to Pro to upload new versions" : ""}
            className="flex items-center gap-2 rounded bg-emerald-500 px-3 py-2 text-xs font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {isUploading && (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-950/30 border-t-neutral-950" />
            )}
            {isUploading ? "Uploading" : "Upload"}
          </button>
          {project && (project.myRole === "owner" || project.myRole === "admin") && (
            <button
              type="button"
              onClick={() => setIsDeleteProjectOpen(true)}
              title="Delete this project"
              className="rounded border border-neutral-700 px-3 py-2 text-xs font-medium text-red-400 hover:border-red-500/60 hover:bg-red-500/10"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {isDragOver && (
        <div className="mt-4 rounded-lg border-2 border-dashed border-emerald-500 bg-emerald-500/5 py-4 text-center text-sm text-emerald-300">
          Drop STL, 3MF, or OBJ to upload a new version
        </div>
      )}

      {error && (
        <div className="mt-4 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-6 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        {project?.thumbnailUrl && (
          <div className="shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Latest Model</p>
            <img
              src={project.thumbnailUrl}
              alt={project.name}
              className="mt-3 h-64 w-64 rounded bg-neutral-950 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        <div className="flex-1 space-y-3">
        {isTeam ? (
          <>
            <StatCard label="Comparisons" value={comparisons.length} />
            <StatCard label="Open Reviews" value={openReviews} accent={openReviews > 0 ? "amber" : undefined} />
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Approval Rate</p>
              <p className="mt-1.5 text-2xl font-bold text-emerald-400">{approvalRate === null ? "—" : `${approvalRate}%`}</p>
              {approvalRate !== null && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-800">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${approvalRate}%` }} />
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <PrintabilityRulesTooltip className="block">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Last Model Printability</p>
                <p
                  className={`mt-1.5 text-2xl font-bold ${
                    latestVersion?.printabilityStatus ? PRINTABILITY_COLOR[latestVersion.printabilityStatus] : "text-neutral-500"
                  }`}
                >
                  {latestVersion?.printabilityStatus ? PRINTABILITY_LABEL[latestVersion.printabilityStatus] : "—"}
                </p>
              </div>
            </PrintabilityRulesTooltip>
            <StatCard
              label="Latest Volume Δ"
              value={
                latestVolumeDeltaPercent === null
                  ? "—"
                  : `${latestVolumeDeltaPercent >= 0 ? "+" : ""}${latestVolumeDeltaPercent.toFixed(1)}%`
              }
            />
          </>
        )}
        <StatCard label="Versions" value={versions.length} />
        </div>
      </div>

      {isTeam ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-800">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            <span>Comparison</span>
            <span className="text-right">Volume Δ</span>
            <span>Status</span>
            <span>Updated</span>
          </div>

          {comparisons.length === 0 && versions.length <= 1 && (
            <div className="px-4 py-10 text-center text-sm text-neutral-500">
              {versions.length === 0
                ? "No versions yet — drop a file or click \"Upload\" to get started."
                : "Upload a second version to see your first comparison here."}
            </div>
          )}

          {comparisons
            .slice()
            .reverse()
            .map((comparison) => (
              <Link
                key={comparison.toVersion.id}
                to={`/projects/${projectId}/compare/${comparison.fromVersion.id}/${comparison.toVersion.id}`}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-neutral-800 bg-neutral-950 px-4 py-3 text-sm last:border-b-0 hover:bg-neutral-900"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-neutral-800 text-[10px] text-neutral-400">
                    ◈
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-semibold text-white">
                      v{comparison.fromVersion.versionNumber} → v{comparison.toVersion.versionNumber}
                    </span>
                    <span
                      className="block truncate text-xs text-neutral-500"
                      title={comparison.toVersion.changeSummary ?? undefined}
                    >
                      {comparison.toVersion.changeSummary ?? "Version uploaded"}
                    </span>
                  </span>
                </span>
                <span
                  className={`whitespace-nowrap text-right font-mono text-xs ${
                    comparison.volumeDeltaPercent === null
                      ? "text-neutral-600"
                      : comparison.volumeDeltaPercent >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                  }`}
                >
                  {comparison.volumeDeltaPercent === null
                    ? "—"
                    : `${comparison.volumeDeltaPercent >= 0 ? "+" : ""}${comparison.volumeDeltaPercent.toFixed(1)}%`}
                </span>
                <ApprovalBadge status={comparison.toVersion.approvalStatus} />
                <span className="whitespace-nowrap text-xs text-neutral-500">{timeAgo(comparison.toVersion.createdAt)}</span>
              </Link>
            ))}
        </div>
      ) : versions.length === 0 ? (
        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-10 text-center text-sm text-neutral-500">
          No models yet — drop a file or click "Upload" to get started.
        </div>
      ) : null}

      {versions.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-xs">
          <span className="font-semibold uppercase tracking-widest text-neutral-500">Compare any two</span>
          <select
            value={compareAId}
            onChange={(event) => setCompareAId(event.target.value)}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-200"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNumber} — {v.fileName}
              </option>
            ))}
          </select>
          <span className="text-neutral-600">→</span>
          <select
            value={compareBId}
            onChange={(event) => setCompareBId(event.target.value)}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-200"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNumber} — {v.fileName}
              </option>
            ))}
          </select>
          <Link
            to={
              compareAId && compareBId && compareAId !== compareBId
                ? `/projects/${projectId}/compare/${compareAId}/${compareBId}`
                : "#"
            }
            aria-disabled={!compareAId || !compareBId || compareAId === compareBId}
            className={`ml-auto rounded px-3 py-1.5 font-medium ${
              compareAId && compareBId && compareAId !== compareBId
                ? "bg-emerald-500 text-neutral-950 hover:bg-emerald-400"
                : "cursor-not-allowed bg-neutral-800 text-neutral-600"
            }`}
          >
            Compare
          </Link>
        </div>
      )}

      {versions.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              All versions ({versions.length})
            </h2>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {versions
              .slice()
              .reverse()
              .map((version) => (
                <div
                  key={version.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm"
                >
                <div className="flex items-center gap-3">
                  <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-300">
                    v{version.versionNumber}
                  </span>
                  {version.id === stableVersionId && (
                    <span className="shrink-0 rounded border border-emerald-800 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                      Stable
                    </span>
                  )}
                  {project?.teamId && version.approvalStatus !== "approved" && (
                    <ApprovalBadge status={version.approvalStatus} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-neutral-300">{version.fileName}</span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {version.triangleCount ?? "?"} tris · {version.fileFormat.toUpperCase()}
                  </span>
                  {/* Both actions stay available after a decision, not just
                      while pending — the backend has no "final" state, so a
                      reviewer can change their mind (e.g. un-reject a
                      version once a fix lands) rather than being stuck with
                      whatever was clicked first. Only the action that would
                      actually change the current status is shown. */}
                  {canReview && version.approvalStatus !== "approved" && (
                    <button
                      type="button"
                      onClick={() => void handleApprove(version.id)}
                      className="shrink-0 rounded border border-emerald-700 px-2.5 py-1 text-xs text-emerald-400 hover:border-emerald-500"
                    >
                      Approve
                    </button>
                  )}
                  {canReview && version.approvalStatus !== "rejected" && (
                    <button
                      type="button"
                      onClick={() => setPendingReject({ id: version.id, versionNumber: version.versionNumber })}
                      className="shrink-0 rounded border border-red-800 px-2.5 py-1 text-xs text-red-400 hover:border-red-600"
                    >
                      Reject
                    </button>
                  )}
                  <Link
                    to={`/projects/${projectId}/versions/${version.id}`}
                    className="shrink-0 rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:border-neutral-500"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleDownloadVersion(version.id)}
                    title="Download this version"
                    className="shrink-0 rounded border border-neutral-700 p-1.5 text-neutral-200 hover:border-neutral-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete({ id: version.id, versionNumber: version.versionNumber })}
                    title="Delete this version"
                    className="shrink-0 rounded border border-neutral-700 p-1.5 text-neutral-400 hover:border-red-700 hover:text-red-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
                {version.approvalStatus === "rejected" && version.rejectionReason && (
                  <p className="pl-1 text-xs text-red-400">Rejected: {version.rejectionReason}</p>
                )}
                </div>
              ))}
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete v${pendingDelete.versionNumber}?`}
          message="This can't be undone. Its comments, cached diffs, and uploaded file will be deleted too."
          confirmLabel="Delete"
          isDestructive
          isConfirming={isDeleting}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingReject && (
        <RejectVersionModal
          versionLabel={`v${pendingReject.versionNumber}`}
          isSubmitting={isRejecting}
          onConfirm={(reason) => void handleConfirmReject(reason)}
          onCancel={() => setPendingReject(null)}
        />
      )}

      {isEditModalOpen && project && (
        <EditProjectModal
          projectId={project.id}
          initialName={project.name}
          initialDescription={project.description}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={(updates) => {
            setProject((prev) => (prev ? { ...prev, ...updates } : prev));
            setIsEditModalOpen(false);
            refreshSidebar();
          }}
        />
      )}

      {isDeleteProjectOpen && project && (
        <ConfirmDialog
          title={`Delete "${project.name}"?`}
          message="This can't be undone. Every version, comment, and cached comparison in this project will be permanently deleted."
          confirmLabel="Delete Project"
          isDestructive
          isConfirming={isDeletingProject}
          onConfirm={() => void handleDeleteProject()}
          onCancel={() => setIsDeleteProjectOpen(false)}
        />
      )}
    </div>
  );
}
