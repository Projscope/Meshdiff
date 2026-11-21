import { useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { LocalVersion } from "@meshdiff/shared/localLibrary";
import ConfirmDialog from "../../components/ConfirmDialog";
import PrintabilityBadge from "../../components/PrintabilityBadge";
import { errorMessage, formatBytes, formatDateTime, library } from "../lib/library";
import { useProject } from "../lib/useProject";

const MODEL_EXTENSIONS = [".stl", ".obj", ".3mf"];

export default function ProjectPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const { detail, loadError, analyzingVersionId, analysisErrors, refresh } = useProject(projectId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<LocalVersion | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  async function addVersions(add: () => Promise<unknown>) {
    setIsAdding(true);
    setActionError(null);
    try {
      await add();
    } catch (e) {
      setActionError(errorMessage(e));
    }
    await refresh();
    setIsAdding(false);
  }

  const handleAddClick = () => addVersions(() => library().addVersionsFromDialog(projectId));

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer.files).filter((f) =>
      MODEL_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)),
    );
    if (files.length === 0) {
      setActionError("Drop STL, OBJ or 3MF files to add them as versions.");
      return;
    }
    void addVersions(async () => {
      for (const file of files) await library().addVersionFromBytes(projectId, file.name, await file.arrayBuffer());
    });
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (renaming === null) return;
    try {
      await library().renameProject(projectId, renaming);
      setRenaming(null);
      await refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function handleDeleteVersion(version: LocalVersion) {
    setPendingDelete(null);
    try {
      await library().deleteVersion(projectId, version.id);
      setSelected((current) => current.filter((id) => id !== version.id));
      await refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  function toggleSelected(versionId: string) {
    setSelected((current) =>
      current.includes(versionId) ? current.filter((id) => id !== versionId) : [...current.slice(-1), versionId],
    );
  }

  if (loadError) return <p role="alert" className="p-6 text-sm text-red-300">{loadError}</p>;
  if (detail === undefined) return <p className="p-6 text-sm text-ink-500">Loading…</p>;
  if (detail === null) {
    return (
      <div className="p-6 text-sm text-ink-400">
        This project no longer exists. <Link to="/" className="text-accent-fg-400 underline">Back to projects</Link>
      </div>
    );
  }

  const { project, versions } = detail;
  const newestFirst = [...versions].reverse();
  const ordered = selected.map((id) => versions.find((v) => v.id === id)).filter((v): v is LocalVersion => !!v);
  ordered.sort((a, b) => a.number - b.number);

  return (
    <div
      className="mx-auto max-w-4xl px-6 py-8"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <Link to="/" className="text-xs text-ink-500 hover:text-ink-300">← Projects</Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        {renaming === null ? (
          <h1 data-testid="project-name" className="text-2xl font-bold">
            {project.name}
            <button type="button" onClick={() => setRenaming(project.name)} className="ml-3 align-middle text-xs font-normal text-ink-500 hover:text-ink-300">
              Rename
            </button>
          </h1>
        ) : (
          <form onSubmit={handleRename} className="flex gap-2">
            <input
              autoFocus
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              maxLength={120}
              className="rounded-sm border border-ink-700 bg-ink-900 px-2 py-1 text-lg text-ink-100"
            />
            <button type="submit" className="rounded-sm bg-accent-500 px-3 text-sm font-medium text-chrome-950">Save</button>
            <button type="button" onClick={() => setRenaming(null)} className="px-2 text-sm text-ink-400">Cancel</button>
          </form>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="compare-selected"
            disabled={ordered.length !== 2}
            onClick={() => ordered.length === 2 && navigate(`/p/${projectId}/compare/${ordered[0]!.id}/${ordered[1]!.id}`)}
            className="rounded-sm border border-ink-700 px-3 py-2 text-sm text-ink-200 hover:border-ink-500 disabled:opacity-40"
          >
            Compare selected{ordered.length === 2 ? ` (v${ordered[0]!.number} vs v${ordered[1]!.number})` : ""}
          </button>
          <button
            type="button"
            data-testid="add-versions"
            disabled={isAdding}
            onClick={() => void handleAddClick()}
            className="rounded-sm bg-accent-500 px-4 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
          >
            {isAdding ? "Adding…" : "Add versions…"}
          </button>
        </div>
      </div>

      {isDragOver && (
        <div className="mt-4 rounded-lg border-2 border-dashed border-accent-500 bg-accent-500/5 py-4 text-center text-sm text-accent-fg-300">
          Drop STL, OBJ or 3MF files to add them as new versions
        </div>
      )}

      {actionError && (
        <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-sm border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss" className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {versions.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-ink-700 px-4 py-10 text-center text-sm text-ink-400">
          No versions yet. Add your first model (STL, OBJ or 3MF), or drag files here. Each new file is compared with the one before it.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {newestFirst.map((version) => {
            const analysis = version.analysis;
            const error = analysisErrors[version.id];
            const isAnalyzing = analyzingVersionId === version.id;
            return (
              <li key={version.id} data-testid="version-row" className="rounded-lg border border-ink-800 bg-ink-900 px-4 py-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select v${version.number} to compare`}
                    checked={selected.includes(version.id)}
                    onChange={() => toggleSelected(version.id)}
                    className="mt-1 accent-sky-400"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/p/${projectId}/v/${version.id}`} className="font-medium text-ink-50 hover:underline">
                        v{version.number} · {version.fileName}
                      </Link>
                      {analysis && <PrintabilityBadge status={analysis.printabilityStatus} />}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {formatBytes(version.sizeBytes)} · added {formatDateTime(version.createdAt)} · sha256 {version.sha256.slice(0, 12)}…
                    </div>
                    {analysis && (
                      <p data-testid="change-summary" className="mt-2 text-sm text-ink-300">{analysis.changeSummary}</p>
                    )}
                    {!analysis && !error && (
                      <p data-testid="analyzing" className="mt-2 text-sm text-ink-500">
                        {isAnalyzing ? "Analyzing…" : "Waiting to analyze…"}
                      </p>
                    )}
                    {error && <p className="mt-2 text-sm text-red-300">Couldn't analyze this file: {error}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(version)}
                    aria-label={`Delete v${version.number}`}
                    className="rounded-sm px-2 py-1 text-xs text-ink-500 hover:bg-red-500/10 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete version?"
          message={`v${pendingDelete.number} (${pendingDelete.fileName}) and its comments will be permanently deleted from this computer. This can't be undone.`}
          confirmLabel="Delete"
          isDestructive
          onConfirm={() => void handleDeleteVersion(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
