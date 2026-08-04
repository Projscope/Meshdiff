import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getProject,
  listVersions,
  uploadVersion,
  downloadAllVersionsZip,
  downloadVersionFile,
  deleteVersion,
  type VersionSummary,
} from "../lib/projectsApi";
import PrintabilityBadge from "../components/PrintabilityBadge";
import ApprovalBadge from "../components/ApprovalBadge";
import ConfirmDialog from "../components/ConfirmDialog";

const ALLOWED_EXTENSIONS = [".stl", ".3mf", ".obj"];
const MAX_FILE_BYTES = 200 * 1024 * 1024;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<{ name: string; description: string | null } | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; versionNumber: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [projectResult, versionsResult] = await Promise.all([
      getProject(projectId),
      listVersions(projectId),
    ]);
    if (projectResult.success) setProject(projectResult.data);
    if (versionsResult.success) setVersions(versionsResult.data);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleFile(file: File) {
    if (!projectId) return;
    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError("File must be an STL, 3MF, or OBJ file");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("File must be under 200MB");
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
    await refresh();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  async function handleDownloadAll() {
    if (!projectId) return;
    const result = await downloadAllVersionsZip(projectId);
    if (!result.success) setError(result.error);
  }

  async function handleDownloadVersion(versionId: string) {
    if (!projectId) return;
    const result = await downloadVersionFile(projectId, versionId);
    if (!result.success) setError(result.error);
  }

  async function handleConfirmDelete() {
    if (!projectId || !pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteVersion(projectId, pendingDelete.id);
    setIsDeleting(false);
    setPendingDelete(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link to="/projects" className="text-xs text-neutral-500 hover:text-neutral-300">
        ← All Projects
      </Link>

      {project && (
        <>
          <h1 className="mt-2 text-2xl font-bold text-white">{project.name}</h1>
          {project.description && <p className="mt-1 text-sm text-neutral-400">{project.description}</p>}
        </>
      )}

      <div
        className={`mt-6 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 text-center ${
          isDragOver ? "border-indigo-500 bg-indigo-500/5" : "border-neutral-800"
        }`}
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
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400">
          ↑
        </div>
        {isUploading ? (
          <p className="text-sm text-neutral-300">Uploading and analyzing…</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm font-medium text-neutral-200 hover:text-white"
            >
              Drop STL, 3MF, or OBJ file here
            </button>
            <p className="text-xs text-neutral-500">or click to browse · max 200MB</p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">
          Version History <span className="text-neutral-600">({versions.length})</span>
        </h2>
        {projectId && versions.length > 0 && (
          <button
            type="button"
            onClick={handleDownloadAll}
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
          >
            Download All (ZIP)
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {versions.length === 0 && (
          <div className="rounded border border-neutral-800 bg-neutral-900 px-4 py-8 text-center text-sm text-neutral-500">
            No versions yet — upload a file above to get started.
          </div>
        )}
        {versions.map((version, index) => (
          <div
            key={version.id}
            className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded bg-neutral-800 text-xs font-semibold text-neutral-300">
              v{version.versionNumber}
              {index < versions.length - 1 && (
                <div className="absolute left-1/2 top-full h-2 w-px -translate-x-1/2 bg-neutral-700" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {version.changeSummary?.split(".")[0] ?? "Version uploaded"}
              </p>
              {version.changeSummary && (
                <p className="mt-0.5 truncate text-xs text-neutral-500">{version.changeSummary}</p>
              )}
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-500">
                <PrintabilityBadge status={version.printabilityStatus} />
                <ApprovalBadge status={version.approvalStatus} />
                <span>{version.triangleCount ?? "?"} tris · {version.fileFormat.toUpperCase()}</span>
                <span>{formatDate(version.createdAt)}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              {version.versionNumber > 1 && (
                <Link
                  to={`/projects/${projectId}/versions/${version.id}/compare`}
                  className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:border-neutral-500"
                >
                  Compare
                </Link>
              )}
              <button
                type="button"
                onClick={() => void handleDownloadVersion(version.id)}
                title="Download this version"
                className="rounded border border-neutral-700 p-1.5 text-neutral-200 hover:border-neutral-500"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <Link
                to={`/projects/${projectId}/versions/${version.id}`}
                className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:border-neutral-500"
              >
                View
              </Link>
              <button
                type="button"
                onClick={() => setPendingDelete({ id: version.id, versionNumber: version.versionNumber })}
                title="Delete this version"
                className="rounded border border-neutral-700 p-1.5 text-neutral-400 hover:border-red-700 hover:text-red-400"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

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
    </div>
  );
}
