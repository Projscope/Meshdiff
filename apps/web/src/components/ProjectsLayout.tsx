import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { listProjects, listMyTeams, getWorkspace, type ProjectSummary } from "../lib/projectsApi";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthProvider";
import NewProjectModal from "./NewProjectModal";
import TeamModal from "./TeamModal";
import UpgradeToTeamModal from "./UpgradeToTeamModal";
import EditWorkspaceModal from "./EditWorkspaceModal";

const STATUS_DOT: Record<"pass" | "warn" | "fail", string> = {
  pass: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
};

function ProjectStatusDot({ status }: { status: "pass" | "warn" | "fail" | null }) {
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status ? STATUS_DOT[status] : "bg-neutral-600"}`} />;
}

// The sidebar's project list (including each project's status dot) is only
// re-fetched when the route changes, so it goes stale after in-place
// mutations that don't navigate — e.g. deleting a project's last version.
// Pages nested under ProjectsLayout can call this to force a re-fetch.
const ProjectsSidebarRefreshContext = createContext<() => void>(() => {});
export function useRefreshProjectsSidebar(): () => void {
  return useContext(ProjectsSidebarRefreshContext);
}

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; myRole: "admin" | "approver" | "member" }>>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // null = closed, "new" = create-team modal, otherwise a team id to manage.
  const [teamModal, setTeamModal] = useState<"new" | string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("My Workspace");
  const [isEditWorkspaceOpen, setIsEditWorkspaceOpen] = useState(false);

  // Creating a team is a Team-plan feature. Until Stripe billing is wired up,
  // use existing team membership as a stand-in signal for "already on Team" —
  // a Pro user with no teams gets prompted to upgrade instead of a create form.
  function handleCreateTeamClick() {
    if (teams.length === 0) {
      setShowUpgrade(true);
    } else {
      setTeamModal("new");
    }
  }

  // The sidebar nav lists every project (unpaginated), unlike the main
  // Projects page — a large page size effectively means "all of them".
  const fetchProjects = useCallback(() => {
    listProjects(1, 200).then((result) => {
      if (result.success) setProjects(result.data.projects);
    });
  }, []);

  useEffect(() => {
    fetchProjects();
    listMyTeams().then((result) => {
      if (result.success) setTeams(result.data);
    });
  }, [location.pathname, fetchProjects]);

  // The workspace name is per-user, not per-route — fetch it once rather
  // than re-fetching on every navigation like the project/team lists above.
  useEffect(() => {
    getWorkspace().then((result) => {
      if (result.success) setWorkspaceName(result.data.name);
    });
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  const emailInitial = user?.email?.[0]?.toUpperCase() ?? "?";

  // No billing/subscriptions table exists yet (see CLAUDE.md — Stripe isn't
  // wired up), so there's no real "tier" to read. Team membership is the one
  // real, observable signal in the data model right now — same proxy
  // handleCreateTeamClick() above already uses to gate team creation.
  const planLabel = teams.length > 0 ? "Team" : "Pro";
  const planBadgeClass =
    teams.length > 0 ? "bg-violet-500/15 text-violet-400" : "bg-emerald-500/15 text-emerald-400";

  return (
    <ProjectsSidebarRefreshContext.Provider value={fetchProjects}>
      <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
        <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800">
          <Link to="/" className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
            <div aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-neutral-950">
              <span className="text-sm font-bold leading-none">^</span>
            </div>
            <h1 className="text-sm font-semibold text-white">Meshdiff</h1>
          </Link>

          <div className="border-b border-neutral-800 px-4 py-3">
            <div className="flex items-center gap-1">
              <p className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                {workspaceName}
              </p>
              <button
                type="button"
                onClick={() => setIsEditWorkspaceOpen(true)}
                title="Rename workspace"
                className="shrink-0 rounded p-0.5 text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-500/15 text-[11px] font-semibold text-emerald-400">
                {emailInitial}
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-neutral-300">{user?.email ?? "…"}</span>
              <span
                title={
                  planLabel === "Team"
                    ? "Belongs to a team — billing enforcement isn't wired up yet"
                    : "No team membership — billing enforcement isn't wired up yet"
                }
                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${planBadgeClass}`}
              >
                {planLabel}
              </span>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <div className="flex items-center justify-between px-2">
              <Link
                to="/projects"
                className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600 hover:text-neutral-300"
              >
                Projects
              </Link>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                title="New project"
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-white"
              >
                +
              </button>
            </div>

            <div className="mt-2 flex flex-col gap-0.5">
              {projects === null && (
                <p className="px-2 py-1.5 text-xs text-neutral-600">Loading…</p>
              )}
              {projects?.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-neutral-600">No projects yet.</p>
              )}
              {projects?.map((project) => {
                const isActive = project.id === projectId;
                return (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                      isActive ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                    }`}
                  >
                    <ProjectStatusDot status={project.latestPrintabilityStatus} />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <span className="shrink-0 text-[11px] text-neutral-600">{project.versionCount}</span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between px-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">Teams</span>
              <button
                type="button"
                onClick={handleCreateTeamClick}
                title="New team"
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-white"
              >
                +
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-0.5">
              {teams.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-neutral-600">No teams yet.</p>
              )}
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setTeamModal(team.id)}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                >
                  <span className="min-w-0 flex-1 truncate">{team.name}</span>
                  <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] uppercase text-neutral-500">
                    {team.myRole}
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <div className="relative border-t border-neutral-800 p-3">
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-neutral-900"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-[11px] font-semibold text-neutral-200">
                {emailInitial}
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-neutral-400">{user?.email ?? ""}</span>
            </button>
            {isMenuOpen && (
              <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="w-full px-3 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">{children}</main>

        {isModalOpen && (
          <NewProjectModal
            onClose={() => setIsModalOpen(false)}
            onCreated={(project) => {
              setProjects((prev) => [project, ...(prev ?? [])]);
              setIsModalOpen(false);
              navigate(`/projects/${project.id}`);
            }}
          />
        )}

        {teamModal && (
          <TeamModal
            teamId={teamModal === "new" ? null : teamModal}
            onClose={() => setTeamModal(null)}
            onCreated={(team) => {
              setTeams((prev) => [...prev, { ...team, myRole: "admin" }]);
              setTeamModal(null);
            }}
          />
        )}

        {showUpgrade && <UpgradeToTeamModal onClose={() => setShowUpgrade(false)} />}

        {isEditWorkspaceOpen && (
          <EditWorkspaceModal
            initialName={workspaceName}
            onClose={() => setIsEditWorkspaceOpen(false)}
            onSaved={(name) => {
              setWorkspaceName(name);
              setIsEditWorkspaceOpen(false);
            }}
          />
        )}
      </div>
    </ProjectsSidebarRefreshContext.Provider>
  );
}
