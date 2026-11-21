import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { LocalProjectSummary } from "@meshdiff/shared/localLibrary";
import ConfirmDialog from "../../components/ConfirmDialog";
import TeamProjectDialog from "../components/TeamProjectDialog";
import { errorMessage, formatDateTime, library } from "../lib/library";
import { useAccount } from "../lib/sync";

export default function LibraryPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<LocalProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LocalProjectSummary | null>(null);
  const [isOpeningTeamProject, setIsOpeningTeamProject] = useState(false);
  const { account } = useAccount();

  const load = useCallback(async () => {
    try {
      setProjects(await library().listProjects());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const project = await library().createProject(name);
      navigate(`/p/${project.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setIsCreating(false);
    }
  }

  async function handleDelete(project: LocalProjectSummary) {
    try {
      await library().deleteProject(project.id);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setPendingDelete(null);
      setError(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold">Projects</h1>
      <p className="mt-1 text-sm text-ink-400">
        Everything here is stored on this computer. Nothing is uploaded unless you connect a project to your team.
      </p>

      <form onSubmit={handleCreate} className="mt-6 flex gap-2">
        <input
          data-testid="new-project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name"
          maxLength={120}
          className="min-w-0 flex-1 rounded-sm border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500"
        />
        <button
          type="submit"
          data-testid="create-project"
          disabled={isCreating || !name.trim()}
          className="rounded-sm bg-accent-500 px-4 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
        >
          Create project
        </button>
      </form>

      {account?.signedIn && account.syncEnabled && (
        <button
          type="button"
          data-testid="open-team-project-start"
          onClick={() => setIsOpeningTeamProject(true)}
          className="mt-3 text-xs text-accent-fg-400 underline"
        >
          Open a team project…
        </button>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-sm border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {projects === null && !error && <p className="mt-6 text-sm text-ink-500">Loading…</p>}

      {projects?.length === 0 && (
        <p className="mt-8 rounded-lg border border-dashed border-ink-700 px-4 py-10 text-center text-sm text-ink-400">
          No projects yet. Create one, then add the versions of a model to see what changed between them.
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-2">
        {projects?.map((project) => (
          <li
            key={project.id}
            data-testid="project-row"
            className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-900 px-4 py-3"
          >
            <Link to={`/p/${project.id}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-ink-50">{project.name}</span>
                {project.cloud && (
                  <span data-testid="team-badge" className="shrink-0 rounded-sm bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                    {project.cloud.teamName}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-ink-500">
                {project.versionCount} {project.versionCount === 1 ? "version" : "versions"}
                {project.latestFileName && ` · latest ${project.latestFileName}`} · updated {formatDateTime(project.updatedAt)}
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setPendingDelete(project)}
              aria-label={`Delete ${project.name}`}
              className="rounded-sm px-2 py-1 text-xs text-ink-500 hover:bg-red-500/10 hover:text-red-400"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {isOpeningTeamProject && (
        <TeamProjectDialog
          onClose={() => setIsOpeningTeamProject(false)}
          onOpened={(projectId) => {
            setIsOpeningTeamProject(false);
            navigate(`/p/${projectId}`);
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete project?"
          message={`"${pendingDelete.name}" and all of its versions and comments will be permanently deleted from this computer. This can't be undone.`}
          confirmLabel="Delete"
          isDestructive
          onConfirm={() => void handleDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
