import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects, deleteProject, type ProjectSummary } from "../lib/projectsApi";
import NewProjectModal from "../components/NewProjectModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useAccountStatus } from "../components/ProjectsLayout";

const PAGE_SIZE = 10;

const STATUS_DOT: Record<"pass" | "warn" | "fail", string> = {
  pass: "bg-accent-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-10 w-10">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function ProjectThumbnail({ project }: { project: ProjectSummary }) {
  const [failed, setFailed] = useState(false);
  const showImage = project.thumbnailUrl && !failed;

  return (
    <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-t-lg bg-ink-950">
      {showImage ? (
        <img
          src={project.thumbnailUrl!}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-ink-700">
          <FolderIcon />
          <span className="text-[11px] text-ink-600">No model yet</span>
        </div>
      )}
      {project.latestPrintabilityStatus && (
        <span
          className={`absolute left-2 top-2 h-2.5 w-2.5 rounded-full ${STATUS_DOT[project.latestPrintabilityStatus]}`}
          title={`Latest printability: ${project.latestPrintabilityStatus}`}
        />
      )}
    </div>
  );
}

export default function ProjectsListPage() {
  const { isPro } = useAccountStatus();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"name" | "date-newest" | "date-oldest">("date-newest");
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteProject(pendingDelete.id);
    setIsDeleting(false);
    if (result.success) {
      setProjects((prev) => (prev ? prev.filter((p) => p.id !== pendingDelete.id) : prev));
      setTotal((prev) => Math.max(0, prev - 1));
      setPendingDelete(null);
    } else {
      setError(result.error);
    }
  }

  useEffect(() => {
    setProjects(null);
    listProjects(page, PAGE_SIZE, sort).then((result) => {
      if (result.success) {
        setProjects(result.data.projects);
        setTotal(result.data.total);
      } else {
        setError(result.error);
      }
    });
  }, [page, sort]);

  function handleSortChange(newSort: "name" | "date-newest" | "date-oldest") {
    if (newSort !== sort) {
      setSort(newSort);
      setPage(1);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-50">Projects</h1>
          <p className="mt-1 text-sm text-ink-400">Track and review 3D model versions</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {projects && projects.length > 0 && (
            <select
              aria-label="Sort projects"
              value={sort}
              onChange={(e) => handleSortChange(e.target.value as "name" | "date-newest" | "date-oldest")}
              className="rounded border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-ink-300 hover:border-ink-500"
            >
              <option value="date-newest">Newest first</option>
              <option value="date-oldest">Oldest first</option>
              <option value="name">Name (A-Z)</option>
            </select>
          )}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            disabled={!isPro}
            className={`rounded px-4 py-2 text-sm font-medium ${
              isPro
                ? "bg-accent-500 text-chrome-950 hover:bg-accent-400"
                : "bg-ink-700 text-ink-500 cursor-not-allowed"
            }`}
            title={!isPro ? "Upgrade to Pro to create projects" : ""}
          >
            + New Project
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {projects === null && !error && (
        <div className="mt-6 text-sm text-ink-500">Loading…</div>
      )}

      {projects && projects.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-ink-800 py-16 text-center text-sm text-ink-500">
          No projects yet. Create one to start tracking versions.
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.id} className="group relative overflow-hidden rounded-lg border border-ink-800 bg-ink-900 hover:border-ink-600">
              <Link to={`/projects/${project.id}`}>
                <ProjectThumbnail project={project} />
                <div className="p-4">
                  <h3 className="truncate pr-6 font-semibold text-ink-50">{project.name}</h3>
                  {project.latestFileName && (
                    <p className="mt-0.5 truncate text-xs text-ink-500">{project.latestFileName}</p>
                  )}
                  {project.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-ink-400">{project.description}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-ink-600">
                    <span>{project.versionCount} version{project.versionCount === 1 ? "" : "s"}</span>
                    <span>{formatDate(project.updatedAt)}</span>
                  </div>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setPendingDelete(project)}
                title="Delete project"
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink-950/70 text-ink-400 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {projects && total > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-ink-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {isModalOpen && (
        <NewProjectModal
          onClose={() => setIsModalOpen(false)}
          onCreated={(project) => {
            setIsModalOpen(false);
            // Prepend the project the create call already returned instead
            // of re-fetching page 1 — a re-fetch immediately after create
            // is a race (nothing guarantees it lands after the write is
            // visible), so it could momentarily come back without the new
            // project or in the wrong order. This is instant and exact.
            if (page === 1) {
              setProjects((prev) => [project, ...(prev ?? [])].slice(0, PAGE_SIZE));
              setTotal((prev) => prev + 1);
            } else {
              setPage(1);
            }
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.name}"?`}
          message="This permanently deletes the project and every version, comment, and file in it. This can't be undone."
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
