import { useEffect, useState } from "react";
import type { CloudProjectSummary, CloudTeam } from "@meshdiff/shared/desktopBridge";
import { errorMessage } from "../lib/library";
import { sync } from "../lib/sync";

interface TeamProjectDialogProps {
  onClose: () => void;
  /** Called with the new local project's id once it has been created and synced. */
  onOpened: (projectId: string) => void;
}

/** Picks a team and one of its cloud projects to open on this computer. */
export default function TeamProjectDialog({ onClose, onOpened }: TeamProjectDialogProps) {
  const [teams, setTeams] = useState<CloudTeam[] | null>(null);
  const [teamId, setTeamId] = useState("");
  const [projects, setProjects] = useState<CloudProjectSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    sync()
      .listTeams()
      .then((list) => {
        if (cancelled) return;
        setTeams(list);
        setTeamId(list[0]?.id ?? "");
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setProjects(null);
    sync()
      .listTeamProjects(teamId)
      .then((list) => !cancelled && setProjects(list))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  async function open(cloudProjectId: string) {
    setBusyId(cloudProjectId);
    setError(null);
    try {
      const project = await sync().openTeamProject(cloudProjectId, teamId);
      onOpened(project.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusyId(null);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Open a team project" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div data-testid="team-project-dialog" className="w-full max-w-md rounded-lg border border-ink-700 bg-ink-900 p-5 shadow-xl">
        <h2 className="text-base font-semibold text-ink-50">Open a team project</h2>
        <p className="mt-1 text-xs text-ink-400">
          You'll get its versions' stats and comments. Model files aren't shared: you can attach your own copy of each one.
        </p>

        {teams?.length === 0 && <p className="mt-4 text-sm text-ink-300">You're not on a team yet.</p>}
        {teams && teams.length > 1 && (
          <select
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className="mt-4 w-full rounded-sm border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm text-ink-100"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        )}
        {teams && teams.length === 1 && <p className="mt-4 text-xs text-ink-500">Team: {teams[0]!.name}</p>}

        {teamId && projects === null && !error && <p className="mt-3 text-sm text-ink-500">Loading…</p>}
        {projects?.length === 0 && <p className="mt-3 text-sm text-ink-300">This team has no projects yet.</p>}
        <ul className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
          {projects?.map((project) => (
            <li key={project.id} className="flex items-center justify-between gap-3 rounded-sm border border-ink-800 bg-ink-950 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-ink-100">{project.name}</div>
                <div className="text-xs text-ink-500">{project.versionCount} {project.versionCount === 1 ? "version" : "versions"}</div>
              </div>
              <button
                type="button"
                data-testid="open-team-project"
                disabled={busyId !== null}
                onClick={() => void open(project.id)}
                className="shrink-0 rounded-sm bg-accent-500 px-3 py-1.5 text-xs font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
              >
                {busyId === project.id ? "Opening…" : "Open"}
              </button>
            </li>
          ))}
        </ul>

        {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-sm px-3 py-1.5 text-sm text-ink-300 hover:text-ink-100">Close</button>
        </div>
      </div>
    </div>
  );
}
