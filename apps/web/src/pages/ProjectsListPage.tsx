import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createProject, listProjects, type ProjectSummary } from "../lib/projectsApi";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthProvider";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: ProjectSummary) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const result = await createProject(name, description);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onCreated(result.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white">New Project</h3>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
          <input
            type="text"
            required
            autoFocus
            placeholder="Project name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSubmitting ? "Creating…" : "Create Project"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
            >
              Cancel
            </button>
          </div>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </form>
      </div>
    </div>
  );
}

export default function ProjectsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    listProjects().then((result) => {
      if (result.success) {
        setProjects(result.data);
      } else {
        setError(result.error);
      }
    });
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="mt-1 text-sm text-neutral-400">Track and review 3D model versions</p>
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="text-xs text-neutral-500">{user.email}</span>}
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Sign Out
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
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
        <div className="mt-6 text-sm text-neutral-500">Loading…</div>
      )}

      {projects && projects.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-neutral-800 py-16 text-center text-sm text-neutral-500">
          No projects yet. Create one to start tracking versions.
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-500/20 text-indigo-400">
                ◈
              </div>
              <h3 className="mt-3 font-semibold text-white">{project.name}</h3>
              {project.latestFileName && (
                <p className="mt-0.5 text-xs text-neutral-500">{project.latestFileName}</p>
              )}
              {project.description && (
                <p className="mt-2 line-clamp-2 text-xs text-neutral-400">{project.description}</p>
              )}
              <p className="mt-3 text-[11px] text-neutral-600">{formatDate(project.updatedAt)}</p>
            </Link>
          ))}
        </div>
      )}

      {isModalOpen && (
        <NewProjectModal
          onClose={() => setIsModalOpen(false)}
          onCreated={(project) => {
            setProjects((prev) => [project, ...(prev ?? [])]);
            setIsModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
