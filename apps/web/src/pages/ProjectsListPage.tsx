import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects, type ProjectSummary } from "../lib/projectsApi";
import NewProjectModal from "../components/NewProjectModal";

const PAGE_SIZE = 10;

const STATUS_DOT: Record<"pass" | "warn" | "fail", string> = {
  pass: "bg-emerald-500",
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
    <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-t-lg bg-neutral-950">
      {showImage ? (
        <img
          src={project.thumbnailUrl!}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-neutral-700">
          <FolderIcon />
          <span className="text-[11px] text-neutral-600">No model yet</span>
        </div>
      )}
      {project.latestPrintabilityStatus && (
        <span
          className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ${STATUS_DOT[project.latestPrintabilityStatus]}`}
          title={`Latest printability: ${project.latestPrintabilityStatus}`}
        />
      )}
    </div>
  );
}

export default function ProjectsListPage() {
  const [page, setPage] = useState(1);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    setProjects(null);
    listProjects(page, PAGE_SIZE).then((result) => {
      if (result.success) {
        setProjects(result.data.projects);
        setTotal(result.data.total);
      } else {
        setError(result.error);
      }
    });
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="mt-1 text-sm text-neutral-400">Track and review 3D model versions</p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
        >
          + New Project
        </button>
      </div>

      {error && (
        <div className="mt-6 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {projects === null && !error && (
        <div className="mt-6 text-sm text-neutral-500">Loading…</div>
      )}

      {projects && projects.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-neutral-800 py-16 text-center text-sm text-neutral-500">
          No projects yet. Create one to start tracking versions.
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 hover:border-neutral-600"
            >
              <ProjectThumbnail project={project} />
              <div className="p-4">
                <h3 className="truncate font-semibold text-white">{project.name}</h3>
                {project.latestFileName && (
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{project.latestFileName}</p>
                )}
                {project.description && (
                  <p className="mt-2 line-clamp-2 text-xs text-neutral-400">{project.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-600">
                  <span>{project.versionCount} version{project.versionCount === 1 ? "" : "s"}</span>
                  <span>{formatDate(project.updatedAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {projects && total > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-neutral-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
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
    </div>
  );
}
