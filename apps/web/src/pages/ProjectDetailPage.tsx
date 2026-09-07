import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getProject,
  listVersions,
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
import { uploadVersion } from "../lib/uploadVersion";
import ApprovalBadge, { APPROVAL_DOT_COLOR } from "../components/ApprovalBadge";
import VersionActionButtons from "../components/VersionActionButtons";
import ApprovalGateChecklist from "../components/ApprovalGateChecklist";
import { useDiffColors } from "../lib/diffPalette";
import ConfirmDialog from "../components/ConfirmDialog";
import EditProjectModal from "../components/EditProjectModal";
import LoadingModal from "../components/LoadingModal";
import RejectVersionModal from "../components/RejectVersionModal";
import PrintabilityRulesTooltip from "../components/PrintabilityRulesTooltip";
import { useRefreshProjectsSidebar, useAccountStatus } from "../components/ProjectsLayout";
import { loadMeshGeometry } from "../engine/loadMesh";
import { renderMeshThumbnail } from "../engine/renderThumbnail";
import { generateThumbnailFromVersion } from "../lib/projectThumbnail";
import SampleProjectTour from "../components/SampleProjectTour";
import { setTourDismissed, setTourAwaitingCompare, getSampleTourStage } from "../lib/sampleProjectTour";

// Kept in sync with the server-side allowlist (apps/api/src/routes/versions.ts)
// — all three formats are safe again now that diffing runs client-side
// (see uploadVersion() in lib/uploadVersion.ts) rather than on the shared server.
const ALLOWED_EXTENSIONS = [".stl", ".3mf", ".obj"];
// Kept in sync with the server-side limit (apps/api/src/lib/fileSizeLimit.ts)
// — this is just an early UI check so an oversized file is rejected before
// spending time on a signed-upload-URL round trip; the server enforces the
// real boundary independently.
const MAX_FILE_BYTES = 50 * 1024 * 1024;

interface Comparison {
  fromVersion: VersionSummary | null;
  toVersion: VersionSummary;
  volumeDeltaPercent: number | null;
  addedCount: number | null;
  removedCount: number | null;
}

// Widths (%) for the two-segment insertions/deletions bar on a history row —
// same idea as GitHub's PR file-list diff bar, sized by each count's share
// of the total rather than an absolute scale, so a huge and a tiny change
// both read clearly at the same fixed bar width.
function changeBarWidths(added: number, removed: number): { addedPercent: number; removedPercent: number } {
  const total = added + removed;
  if (total <= 0) return { addedPercent: 0, removedPercent: 0 };
  return { addedPercent: (added / total) * 100, removedPercent: (removed / total) * 100 };
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
    <div className="h-full rounded-lg border border-ink-800 bg-ink-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${accent === "amber" ? "text-amber-fg-400" : "text-ink-50"}`}>
        {value}
      </p>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { isPro } = useAccountStatus();
  const diffColors = useDiffColors();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState("");
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
    // Sequential, not Promise.all — each of these is a real server-side
    // mesh diff (voxelization, BVH construction), and firing all of a
    // project's consecutive-pair diffs at once on every page load/upload
    // was piling up enough concurrent memory on the API server to crash it
    // outright, independent of any single file's size (see the API-side
    // computeLock.ts, which now also serializes this server-side as a
    // second line of defense).
    const diffs: Awaited<ReturnType<typeof getDiff>>[] = [];
    for (const { fromVersion, toVersion } of pairs) {
      diffs.push(await getDiff(fromVersion.id, toVersion.id));
    }
    const diffRows: Comparison[] = pairs.map((pair, index) => {
      const diffResult = diffs[index];
      return {
        ...pair,
        volumeDeltaPercent: diffResult.success ? diffResult.data.approxVolumeDeltaPercent : null,
        addedCount: diffResult.success ? diffResult.data.addedCount : null,
        removedCount: diffResult.success ? diffResult.data.removedCount : null,
      };
    });
    // v1 has no predecessor to diff against — represented as its own
    // leading history entry (no +/- stat) rather than omitted, so the
    // timeline shows the project's full history down to the initial upload.
    setComparisons(
      sorted.length > 0
        ? [
            {
              fromVersion: null,
              toVersion: sorted[0],
              volumeDeltaPercent: null,
              addedCount: null,
              removedCount: null,
            },
            ...diffRows,
          ]
        : [],
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
    setUploadingFileName(file.name);
    setError(null);
    // versions is sorted ascending by versionNumber (see refresh()) — the
    // last entry is whatever's currently latest, i.e. exactly what this
    // new upload should be diffed against.
    const previousVersionId = versions.length > 0 ? versions[versions.length - 1].id : null;
    const result = await uploadVersion(projectId, file, previousVersionId);
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
  // deleting the version the thumbnail was rendered from, or a project
  // that's never had its detail page opened before) — downloads the
  // now-latest version's file to re-render from it instead.
  async function refreshProjectThumbnailFromVersion(targetProjectId: string, versionId: string) {
    const url = await generateThumbnailFromVersion(targetProjectId, versionId);
    if (url) setProject((prev) => (prev ? { ...prev, thumbnailUrl: url } : prev));
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
  // canTransitionVersionState() server-side) sees approve/request-changes
  // controls, and only on Team projects; Pro projects auto-approve on
  // upload so there's never anything to review there. 'approver' is an
  // "upgraded member" — reviews only, no other admin-gated capability.
  const canTransitionVersionState =
    !!project?.teamId &&
    (project.myRole === "owner" || project.myRole === "admin" || project.myRole === "approver");

  // Mirrors the server's getStableVersion(): last approved version by
  // version_number, falling back to the latest of any status.
  const stableVersionId = (() => {
    const approvedVersions = versions.filter((v) => v.approvalStatus === "approved");
    const pool = approvedVersions.length > 0 ? approvedVersions : versions;
    return pool.length > 0 ? pool[pool.length - 1].id : null;
  })();

  const openReviews = versions.filter((v) => v.approvalStatus === "in_review").length;
  const decided = versions.filter((v) => v.versionNumber > 1 && v.approvalStatus !== "in_review" && v.approvalStatus !== "draft").length;
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
  // Across every version, not just the latest — comments exist on Pro
  // projects too, so this isn't gated behind isTeam like Open Reviews/
  // Approval Rate above.
  const totalUnresolvedComments = versions.reduce((sum, v) => sum + v.unresolvedCommentCount, 0);
  const PRINTABILITY_LABEL: Record<"pass" | "warn" | "fail", string> = {
    pass: t("projectDetail.printabilityPass"),
    warn: t("projectDetail.printabilityWarn"),
    fail: t("projectDetail.printabilityFail"),
  };
  const PRINTABILITY_COLOR: Record<"pass" | "warn" | "fail", string> = {
    pass: "text-accent-fg-400",
    warn: "text-amber-fg-400",
    fail: "text-red-400",
  };

  return (
    <div
      className="px-6 py-8"
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-ink-500">
            <Link to="/projects" className="hover:text-ink-300">
              {t("projectDetail.breadcrumbProjects")}
            </Link>
            {project && <> / {project.name}</>}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold text-ink-50">{project?.name ?? "…"}</h1>
            {project && (project.myRole === "owner" || project.myRole === "admin") && (
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                title={t("projectDetail.editProjectTooltip")}
                className="shrink-0 rounded p-1 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                </svg>
              </button>
            )}
            {project?.isSample && (
              <button
                type="button"
                onClick={() => setTourDismissed(false)}
                className="shrink-0 text-xs font-medium text-accent-fg-400 hover:text-accent-fg-300"
              >
                {t("sampleTour.replayLink")}
              </button>
            )}
          </div>
          {project?.description && <p className="mt-1 text-sm text-ink-400">{project.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          {project?.myRole === "owner" && myTeams.length > 0 && (
            <select
              value={project.teamId ?? ""}
              disabled={isChangingTeam}
              onChange={(event) => void handleChangeTeam(event.target.value || null)}
              title={t("projectDetail.teamSelectTooltip")}
              className="rounded border border-ink-700 bg-ink-950 px-2 py-2 text-xs text-ink-300 disabled:opacity-50"
            >
              <option value="">{t("projectDetail.personalOption")}</option>
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
              className="flex items-center gap-1.5 rounded border border-ink-700 px-3 py-2 text-xs font-medium text-ink-200 hover:border-ink-500"
            >
              🔗 {shareCopied ? t("projectDetail.shareCopied") : t("projectDetail.shareProject")}
            </button>
          )}
          <button
            type="button"
            data-tour="upload"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || !isPro}
            title={!isPro ? t("projectDetail.uploadUpgradeTooltip") : ""}
            className="flex items-center gap-2 rounded bg-accent-500 px-3 py-2 text-xs font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
          >
            {isUploading ? t("projectDetail.uploading") : t("projectDetail.upload")}
          </button>
          {project && (project.myRole === "owner" || project.myRole === "admin") && (
            <button
              type="button"
              onClick={() => setIsDeleteProjectOpen(true)}
              title={t("projectDetail.deleteProjectTooltip")}
              className="rounded border border-ink-700 px-3 py-2 text-xs font-medium text-red-400 hover:border-red-500/60 hover:bg-red-500/10"
            >
              {t("common.delete")}
            </button>
          )}
        </div>
      </div>

      {isDragOver && (
        <div className="mt-4 rounded-lg border-2 border-dashed border-accent-500 bg-accent-500/5 py-4 text-center text-sm text-accent-fg-300">
          {t("projectDetail.dropToUpload")}
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label={t("projectDetail.dismissError")}
            className="shrink-0 text-red-400 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      <div
        data-tour="stats"
        className={`mt-6 grid gap-6 rounded-lg border border-ink-800 bg-ink-900 p-6 ${
          project?.thumbnailUrl ? "lg:grid-cols-[280px_1fr]" : "grid-cols-1"
        }`}
      >
        {project?.thumbnailUrl && (
          <div className="shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{t("projectDetail.latestModel")}</p>
            <img
              src={project.thumbnailUrl}
              alt={project.name}
              className="mt-3 aspect-square w-full rounded bg-ink-950 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {isTeam ? (
          <>
            <StatCard label={t("projectDetail.comparisons")} value={Math.max(0, versions.length - 1)} />
            <StatCard label={t("projectDetail.openReviews")} value={openReviews} accent={openReviews > 0 ? "amber" : undefined} />
            <div className="h-full rounded-lg border border-ink-800 bg-ink-900 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{t("projectDetail.approvalRate")}</p>
              <p className="mt-1.5 text-2xl font-bold text-accent-fg-400">{approvalRate === null ? "—" : `${approvalRate}%`}</p>
              {approvalRate !== null && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-800">
                  <div className="h-full rounded-full bg-accent-500" style={{ width: `${approvalRate}%` }} />
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <PrintabilityRulesTooltip className="block h-full">
              <div className="h-full rounded-lg border border-ink-800 bg-ink-900 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{t("projectDetail.lastModelPrintability")}</p>
                <p
                  className={`mt-1.5 text-2xl font-bold ${
                    latestVersion?.printabilityStatus ? PRINTABILITY_COLOR[latestVersion.printabilityStatus] : "text-ink-500"
                  }`}
                >
                  {latestVersion?.printabilityStatus ? PRINTABILITY_LABEL[latestVersion.printabilityStatus] : "—"}
                </p>
              </div>
            </PrintabilityRulesTooltip>
            <StatCard
              label={t("projectDetail.latestVolumeDelta")}
              value={
                latestVolumeDeltaPercent === null
                  ? "—"
                  : `${latestVolumeDeltaPercent >= 0 ? "+" : ""}${latestVolumeDeltaPercent.toFixed(1)}%`
              }
            />
          </>
        )}
        <StatCard
          label={t("projectDetail.unresolvedComments")}
          value={totalUnresolvedComments}
          accent={totalUnresolvedComments > 0 ? "amber" : undefined}
        />
        <StatCard label={t("projectDetail.versions")} value={versions.length} />
        {latestVersion?.gateStatus && latestVersion.gateStatus.totalCount > 0 && (
          <StatCard
            label={t("projectDetail.latestVersionGates")}
            value={t("approvalGates.gateCount", {
              satisfied: latestVersion.gateStatus.satisfiedCount,
              total: latestVersion.gateStatus.totalCount,
            })}
          />
        )}
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="mt-6 rounded-lg border border-ink-800 bg-ink-900 px-4 py-10 text-center text-sm text-ink-500">
          {t("projectDetail.noModelsYet")}
        </div>
      ) : (
        <div data-tour="history" className="mt-6 overflow-hidden rounded-lg border border-ink-800">
          <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
            <span>{t("projectDetail.history")}</span>
            <span>{t("projectDetail.updated")}</span>
          </div>

          {comparisons
            .slice()
            .reverse()
            .map((comparison, index, rows) => {
              const isSynthetic = comparison.fromVersion === null;
              const isFirstRow = index === 0;
              const isLastRow = index === rows.length - 1;
              const bar =
                comparison.addedCount !== null && comparison.removedCount !== null
                  ? changeBarWidths(comparison.addedCount, comparison.removedCount)
                  : null;
              const printability = comparison.toVersion.printabilityStatus;

              return (
                <Link
                  key={comparison.toVersion.id}
                  data-tour={!isSynthetic && isFirstRow ? "latestDiff" : undefined}
                  onClick={() => {
                    // Following the walkthrough's last-step link (see
                    // SampleProjectTour) hands off to SampleCompareTour on
                    // the diff screen instead of ending here. Only while the
                    // walkthrough is still active on its first pass — a
                    // returning user just browsing their own history
                    // shouldn't resurrect a finished/skipped tour.
                    if (project?.isSample && getSampleTourStage() === "unseen") setTourAwaitingCompare();
                  }}
                  to={
                    isSynthetic
                      ? `/projects/${projectId}/versions/${comparison.toVersion.id}`
                      : `/projects/${projectId}/compare/${comparison.fromVersion!.id}/${comparison.toVersion.id}`
                  }
                  className="flex items-stretch gap-3 border-b border-ink-800 bg-ink-950 px-4 py-3 text-sm last:border-b-0 hover:bg-ink-900"
                >
                  {/* Rail: a colored dot per row (status color, same
                      convention as ApprovalBadge) on a connecting line —
                      the git-commit-graph visual language the user asked
                      for, kept purely linear per CLAUDE.md. */}
                  <div className="flex w-3 shrink-0 flex-col items-center">
                    <div className={`w-px flex-1 ${isFirstRow ? "bg-transparent" : "bg-ink-800"}`} />
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${APPROVAL_DOT_COLOR[comparison.toVersion.approvalStatus]}`} />
                    <div className={`w-px flex-1 ${isLastRow ? "bg-transparent" : "bg-ink-800"}`} />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5 py-0.5">
                    <div className="min-w-0 w-full flex-1 sm:w-auto">
                      <div className="flex items-center gap-1.5">
                        <span className="whitespace-nowrap font-mono text-sm font-semibold text-ink-50">
                          {isSynthetic
                            ? `v${comparison.toVersion.versionNumber}`
                            : `v${comparison.fromVersion!.versionNumber} → v${comparison.toVersion.versionNumber}`}
                        </span>
                        {(printability === "warn" || printability === "fail") && (
                          <span
                            title={printability === "fail" ? t("projectDetail.printabilityCheckFailed") : t("projectDetail.printabilityWarning")}
                            className={printability === "fail" ? "text-red-400" : "text-amber-fg-400"}
                          >
                            {printability === "fail" ? "✕" : "⚠"}
                          </span>
                        )}
                      </div>
                      <span
                        className="block truncate text-xs text-ink-500"
                        title={comparison.toVersion.changeSummary ?? undefined}
                      >
                        {isSynthetic ? t("projectDetail.initialUpload") : comparison.toVersion.changeSummary ?? t("projectDetail.versionUploaded")}
                        {comparison.toVersion.uploaderEmail && ` · ${comparison.toVersion.uploaderEmail}`}
                      </span>
                    </div>

                    <div className="flex w-full shrink-0 items-center gap-3 sm:w-auto">
                      <div className="text-right">
                        {bar ? (
                          <>
                            <div className="whitespace-nowrap font-mono text-xs">
                              <span className={diffColors.addedTextClass}>+{comparison.addedCount!.toLocaleString()}</span>{" "}
                              <span className={diffColors.removedTextClass}>-{comparison.removedCount!.toLocaleString()}</span>
                            </div>
                            <div className="mt-1 flex h-1 w-16 overflow-hidden rounded-full bg-ink-800">
                              <div className={diffColors.addedBgClass} style={{ width: `${bar.addedPercent}%` }} />
                              <div className={diffColors.removedBgClass} style={{ width: `${bar.removedPercent}%` }} />
                            </div>
                          </>
                        ) : (
                          <span className="whitespace-nowrap font-mono text-xs text-ink-500">
                            {isSynthetic ? `${comparison.toVersion.triangleCount ?? "?"} tris` : "—"}
                          </span>
                        )}
                      </div>
                      {project?.teamId && comparison.toVersion.approvalStatus !== "approved" && (
                        <ApprovalBadge status={comparison.toVersion.approvalStatus} />
                      )}
                      <span className="whitespace-nowrap text-xs text-ink-500">{timeAgo(comparison.toVersion.createdAt)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
        </div>
      )}

      {versions.length > 1 && (
        <div
          data-tour="compare"
          className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2.5 text-xs"
        >
          <span className="font-semibold uppercase tracking-widest text-ink-500">{t("projectDetail.compareAnyTwo")}</span>
          <select
            value={compareAId}
            onChange={(event) => setCompareAId(event.target.value)}
            className="rounded border border-ink-700 bg-ink-950 px-2 py-1.5 text-ink-200"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNumber} — {v.fileName}
              </option>
            ))}
          </select>
          <span className="text-ink-600">→</span>
          <select
            value={compareBId}
            onChange={(event) => setCompareBId(event.target.value)}
            className="rounded border border-ink-700 bg-ink-950 px-2 py-1.5 text-ink-200"
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
                ? "bg-accent-500 text-chrome-950 hover:bg-accent-400"
                : "cursor-not-allowed bg-ink-800 text-ink-600"
            }`}
          >
            {t("projectDetail.compare")}
          </Link>
        </div>
      )}

      {versions.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-500">
              {t("projectDetail.allVersions", { count: versions.length })}
            </h2>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {versions
              .slice()
              .reverse()
              .map((version) => (
                <div
                  key={version.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-4 py-2.5 text-sm"
                >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="shrink-0 rounded bg-ink-800 px-1.5 py-0.5 text-[11px] font-semibold text-ink-300">
                      v{version.versionNumber}
                    </span>
                    {version.id === stableVersionId && (
                      <span className="shrink-0 rounded border border-accent-800 bg-accent-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-fg-400">
                        {t("projectDetail.stable")}
                      </span>
                    )}
                    {project?.teamId && version.approvalStatus !== "approved" && (
                      <ApprovalBadge status={version.approvalStatus} />
                    )}
                    {version.gateStatus && version.gateStatus.totalCount > 0 && (
                      <span className="shrink-0 rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400">
                        {t("approvalGates.gateCount", {
                          satisfied: version.gateStatus.satisfiedCount,
                          total: version.gateStatus.totalCount,
                        })}
                      </span>
                    )}
                    {version.unresolvedCommentCount > 0 && (
                      <span
                        title={t("projectDetail.unresolvedTooltip", { count: version.unresolvedCommentCount })}
                        className="shrink-0 rounded border border-amber-800 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-fg-400"
                      >
                        {t("projectDetail.unresolvedCount", { count: version.unresolvedCommentCount })}
                      </span>
                    )}
                    <span className="min-w-0 truncate text-ink-300">{version.fileName}</span>
                    <span className="shrink-0 text-xs text-ink-500">
                      {version.triangleCount ?? "?"} tris · {version.fileFormat.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    <VersionActionButtons
                      status={version.approvalStatus}
                      canTransition={canTransitionVersionState}
                      onApprove={() => void handleApprove(version.id)}
                      onRequestChanges={() => setPendingReject({ id: version.id, versionNumber: version.versionNumber })}
                      gateStatus={version.gateStatus}
                    />
                    <Link
                      to={`/projects/${projectId}/versions/${version.id}`}
                      className="shrink-0 rounded border border-ink-700 px-2.5 py-1 text-xs text-ink-200 hover:border-ink-500"
                    >
                      {t("projectDetail.view")}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDownloadVersion(version.id)}
                      title={t("projectDetail.downloadVersionTooltip")}
                      className="shrink-0 rounded border border-ink-700 p-1.5 text-ink-200 hover:border-ink-500"
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
                      title={t("projectDetail.deleteVersionTooltip")}
                      className="shrink-0 rounded border border-ink-700 p-1.5 text-ink-400 hover:border-red-700 hover:text-red-400"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                </div>
                {version.approvalStatus === "changes_requested" && version.rejectionReason && (
                  <p className="pl-1 text-xs text-red-400">
                    {t("projectDetail.rejectedReason", { reason: version.rejectionReason })}
                  </p>
                )}
                {project?.teamId && version.approvalStatus !== "approved" && version.approvalStatus !== "superseded" && projectId && (
                  <ApprovalGateChecklist
                    projectId={projectId}
                    versionId={version.id}
                    canConfigure={project.myRole === "owner" || project.myRole === "admin"}
                    onChanged={() => void refresh()}
                  />
                )}
                </div>
              ))}
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t("projectDetail.deleteVersionTitle", { version: pendingDelete.versionNumber })}
          message={t("projectDetail.deleteVersionMessage")}
          confirmLabel={t("common.delete")}
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
          title={t("projectDetail.deleteProjectTitle", { name: project.name })}
          message={t("projectDetail.deleteProjectMessage")}
          confirmLabel={t("projectDetail.deleteProjectConfirm")}
          isDestructive
          isConfirming={isDeletingProject}
          onConfirm={() => void handleDeleteProject()}
          onCancel={() => setIsDeleteProjectOpen(false)}
        />
      )}

      {isUploading && (
        <LoadingModal
          title={t("projectDetail.uploadingTitle", { fileName: uploadingFileName })}
          subtitle={t("projectDetail.uploadingSubtitle")}
        />
      )}

      {project?.isSample && versions.length > 0 && <SampleProjectTour />}
    </div>
  );
}
