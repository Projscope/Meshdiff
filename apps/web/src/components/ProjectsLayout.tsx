import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  listProjects,
  listMyTeams,
  getWorkspace,
  getSubscription,
  openBillingPortal,
  cancelSubscription,
  resumeSubscription,
  startProCheckout,
  type ProjectSummary,
  type SubscriptionStatus,
} from "../lib/projectsApi";
import { consumePendingProCheckout } from "../lib/pendingCheckout";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthProvider";
import NewProjectModal from "./NewProjectModal";
import TeamModal from "./TeamModal";
import UpgradeToTeamModal from "./UpgradeToTeamModal";
import UpgradeToProModal from "./UpgradeToProModal";
import EditWorkspaceModal from "./EditWorkspaceModal";
import ConfirmDialog from "./ConfirmDialog";

// UI convenience only — hides the sidebar link for everyone else. The real
// admin boundary is server-side (requireAdmin.ts's ADMIN_EMAILS), so a
// non-admin typing /admin directly still gets a 403 from the API.
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

const STATUS_DOT: Record<"pass" | "warn" | "fail", string> = {
  pass: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
};

function ProjectStatusDot({ status }: { status: "pass" | "warn" | "fail" | null }) {
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status ? STATUS_DOT[status] : "bg-neutral-600"}`} />;
}

function formatRenewalDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// The sidebar's project list (including each project's status dot) is only
// re-fetched when the route changes, so it goes stale after in-place
// mutations that don't navigate — e.g. deleting a project's last version.
// Pages nested under ProjectsLayout can call this to force a re-fetch.
const ProjectsSidebarRefreshContext = createContext<() => void>(() => {});
export function useRefreshProjectsSidebar(): () => void {
  return useContext(ProjectsSidebarRefreshContext);
}

// Lets nested pages (currently just ProjectsListPage, the one page that
// still renders normally for a restricted account — see the route-level
// lock below) react to subscription state without a second
// GET /billing/subscription call of their own.
const AccountStatusContext = createContext<{ isRestricted: boolean; isPro: boolean }>({ isRestricted: false, isPro: false });
export function useAccountStatus(): { isRestricted: boolean; isPro: boolean } {
  return useContext(AccountStatusContext);
}

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
  // The sidebar is a full-screen overlay below the md breakpoint (see
  // <aside> below) — closed by default so it doesn't cover the page on
  // first load.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [teams, setTeams] = useState<Array<{ id: string; name: string; myRole: "admin" | "approver" | "member" }>>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // null = closed, "new" = create-team modal, otherwise a team id to manage.
  const [teamModal, setTeamModal] = useState<"new" | string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showUpgradeToPro, setShowUpgradeToPro] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("My Workspace");
  const [isEditWorkspaceOpen, setIsEditWorkspaceOpen] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

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
    // Close the mobile overlay sidebar on navigation — otherwise it stays
    // open covering the page the user just tapped through to.
    setIsSidebarOpen(false);
  }, [location.pathname, fetchProjects]);

  // The workspace name is per-user, not per-route — fetch it once rather
  // than re-fetching on every navigation like the project/team lists above.
  useEffect(() => {
    getWorkspace().then((result) => {
      if (result.success) setWorkspaceName(result.data.name);
    });
    getSubscription().then((result) => {
      if (!result.success) return;
      setSubscription(result.data);
      // Landing page's "Subscribe to Pro" sends a signed-in-but-not-Pro
      // visitor straight here and sets this flag (see
      // LandingPage.tsx's handleProCheckout) — resume the actual Stripe
      // redirect now that we know for sure they're not already Pro
      // (re-checked here, not just trusted from the landing page, in case
      // something changed in another tab in between).
      if (result.data.tier !== "pro" && consumePendingProCheckout()) {
        void handleAutoResumeCheckout();
      }
    });
  }, []);

  async function handleAutoResumeCheckout() {
    const result = await startProCheckout();
    if (result.success) {
      window.location.href = result.data.url;
    } else {
      setNotice({ type: "error", message: result.error });
    }
  }

  // Stripe Checkout redirects back to /projects?checkout=success|cancelled
  // (see UpgradeToProModal). Only depends on location.search, not
  // location.pathname, so stripping the param via navigate() below doesn't
  // re-trigger the sidebar's project/team refetch effect above.
  useEffect(() => {
    const checkout = new URLSearchParams(location.search).get("checkout");
    if (!checkout) return;

    if (checkout === "success") {
      setNotice({ type: "success", message: "You're now on the Pro plan." });
      // The Stripe webhook that records the subscription can take several
      // seconds. Retry aggressively for up to 10 seconds with exponential backoff.
      const retryGetSubscription = async () => {
        const delays = [1000, 2000, 2000, 2000, 3000];
        for (let i = 0; i < delays.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, delays[i]));
          const result = await getSubscription();
          if (result.success && result.data.tier === "pro") {
            setSubscription(result.data);
            return;
          }
        }
      };
      void retryGetSubscription();
    } else if (checkout === "cancelled") {
      setNotice({ type: "info", message: "Checkout cancelled — no charge was made." });
    }
    navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  async function handleManageBilling() {
    const result = await openBillingPortal();
    if (result.success) {
      window.location.href = result.data.url;
    } else {
      setNotice({ type: "error", message: result.error });
    }
  }

  async function handleConfirmCancel() {
    setIsCancelling(true);
    const result = await cancelSubscription();
    setIsCancelling(false);
    setShowCancelConfirm(false);
    if (result.success) {
      setSubscription((prev) => (prev ? { ...prev, cancelAtPeriodEnd: true, currentPeriodEnd: result.data.currentPeriodEnd } : prev));
      setNotice({
        type: "info",
        message: `Your Pro plan will end on ${formatRenewalDate(result.data.currentPeriodEnd)}. You can resume any time before then.`,
      });
    } else {
      setNotice({ type: "error", message: result.error });
    }
  }

  async function handleResume() {
    setIsResuming(true);
    const result = await resumeSubscription();
    setIsResuming(false);
    if (result.success) {
      setSubscription((prev) => (prev ? { ...prev, cancelAtPeriodEnd: false, currentPeriodEnd: result.data.currentPeriodEnd } : prev));
      setNotice({ type: "success", message: "Subscription resumed — your Pro plan will keep renewing." });
    } else {
      setNotice({ type: "error", message: result.error });
    }
  }

  const emailInitial = user?.email?.[0]?.toUpperCase() ?? "?";

  // Team membership is still a proxy for "Team plan" (Team billing isn't
  // built yet — see handleCreateTeamClick() above, same signal). Pro is now
  // real: subscription.tier comes straight from the subscriptions table via
  // GET /billing/subscription.
  const isTeamMember = teams.length > 0;
  const isPro = subscription?.tier === "pro";
  // No trial — a non-Pro, non-team account is restricted from day one (see
  // requireActiveAccess.ts). Stays false until the subscription fetch
  // resolves, so the sidebar doesn't flash a locked state on first load.
  const isRestricted = subscription?.accountStatus === "restricted";
  const planLabel = isTeamMember ? "Team" : isPro ? "Pro" : "Free";
  const planTextClass = isTeamMember
    ? "text-violet-400"
    : isPro
      ? "text-emerald-400"
      : isRestricted
        ? "text-red-400"
        : "text-neutral-300";

  // The sidebar's own nav is alphabetical (unlike the /projects grid page,
  // which is newest-first) — sort here at render time rather than in
  // fetchProjects/onCreated's state updates, so every path that touches
  // `projects` (fetch, optimistic prepend on create) stays correctly
  // ordered without having to remember to re-sort in each one.
  const sortedProjects = projects
    ? [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    : null;
  const visibleProjects = sortedProjects?.filter((project) =>
    project.name.toLowerCase().includes(projectSearch.trim().toLowerCase()),
  );

  return (
    <ProjectsSidebarRefreshContext.Provider value={fetchProjects}>
    <AccountStatusContext.Provider value={{ isRestricted, isPro }}>
      <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100 md:flex-row">
        {/* Mobile-only top bar — the sidebar below becomes a hidden overlay
            under the md breakpoint, so this is the only way to open it or
            see the logo on a phone-width screen. */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 md:hidden">
          <Link to="/" className="flex items-center gap-2">
            <div aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-neutral-950">
              <span className="text-sm font-bold leading-none">^</span>
            </div>
            <h1 className="text-sm font-semibold text-white">Meshdiff</h1>
          </Link>
          <button
            type="button"
            onClick={() => setIsSidebarOpen((open) => !open)}
            aria-label="Toggle navigation menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              {isSidebarOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside
          className={`${isSidebarOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 w-64 flex-col border-r border-neutral-800 bg-neutral-950 md:static md:z-auto md:flex md:w-64 md:shrink-0`}
        >
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
            </div>
          </div>

          <div className="border-b border-neutral-800 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">Billing</p>
            <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${planTextClass}`}>{planLabel} plan</span>
                {!isTeamMember && !isPro && (
                  <button
                    type="button"
                    onClick={() => setShowUpgradeToPro(true)}
                    className={`shrink-0 text-[11px] font-medium ${
                      isRestricted ? "text-red-400 hover:text-red-300" : "text-emerald-400 hover:text-emerald-300"
                    }`}
                  >
                    Upgrade
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
                {isTeamMember
                  ? "Belongs to a team — Team billing isn't wired up yet."
                  : isPro
                    ? subscription?.cancelAtPeriodEnd
                      ? `Cancels ${subscription.currentPeriodEnd ? formatRenewalDate(subscription.currentPeriodEnd) : "at period end"}.`
                      : `Renews ${subscription?.currentPeriodEnd ? formatRenewalDate(subscription.currentPeriodEnd) : "automatically"}.`
                    : isRestricted
                      ? "Subscribe to keep using Meshdiff — you can still sign in and delete projects."
                      : "Project workspaces, version history, and comment pins — $15/mo."}
              </p>
              {isPro && (
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleManageBilling()}
                    className="text-[11px] font-medium text-neutral-400 hover:text-neutral-200"
                  >
                    Manage
                  </button>
                  {subscription?.cancelAtPeriodEnd ? (
                    <button
                      type="button"
                      onClick={() => void handleResume()}
                      disabled={isResuming}
                      className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                    >
                      {isResuming ? "Resuming…" : "Resume"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(true)}
                      className="text-[11px] font-medium text-neutral-500 hover:text-red-400"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3 pr-1">
            <div className="flex items-center justify-between px-2">
              <Link
                to="/projects"
                className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600 hover:text-neutral-300"
              >
                Projects
              </Link>
              {!isRestricted && (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  title="New project"
                  className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-white"
                >
                  +
                </button>
              )}
            </div>

            {sortedProjects !== null && sortedProjects.length > 0 && (
              <div className="mt-2 px-2">
                <input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
                />
              </div>
            )}

            <div className="mt-2 flex flex-col gap-0.5">
              {sortedProjects === null && (
                <p className="px-2 py-1.5 text-xs text-neutral-600">Loading…</p>
              )}
              {sortedProjects?.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-neutral-600">No projects yet.</p>
              )}
              {sortedProjects !== null && sortedProjects.length > 0 && visibleProjects?.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-neutral-600">No projects match "{projectSearch}".</p>
              )}
              {visibleProjects?.map((project) => {
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
                disabled={!isPro}
                title={!isPro ? "Upgrade to Pro to create teams" : "New team"}
                className={`flex h-5 w-5 items-center justify-center rounded ${
                  isPro ? "text-neutral-500 hover:bg-neutral-800 hover:text-white" : "text-neutral-700 cursor-not-allowed"
                }`}
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

            {isAdmin && (
              <>
                <div className="mt-4 px-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">Admin</span>
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  <Link
                    to="/admin"
                    className="rounded px-2 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/admin/users"
                    className="rounded px-2 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                  >
                    Users
                  </Link>
                </div>
              </>
            )}
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

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        {notice && (
          <div
            className={`fixed right-4 top-4 z-40 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
              notice.type === "success"
                ? "border-emerald-800 bg-emerald-950/90 text-emerald-300"
                : notice.type === "error"
                  ? "border-red-800 bg-red-950/90 text-red-300"
                  : "border-neutral-700 bg-neutral-900/95 text-neutral-300"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span>{notice.message}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="shrink-0 text-neutral-500 hover:text-neutral-300"
              >
                ×
              </button>
            </div>
          </div>
        )}

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

        {showUpgradeToPro && <UpgradeToProModal onClose={() => setShowUpgradeToPro(false)} />}

        {showCancelConfirm && (
          <ConfirmDialog
            title="Cancel Pro plan?"
            message={
              subscription?.currentPeriodEnd
                ? `You'll keep Pro access until ${formatRenewalDate(subscription.currentPeriodEnd)}, then move to the Free plan. You can resume any time before then.`
                : "You'll keep Pro access until the end of the current billing period, then move to the Free plan."
            }
            confirmLabel="Cancel plan"
            cancelLabel="Keep Pro"
            isDestructive
            isConfirming={isCancelling}
            onConfirm={() => void handleConfirmCancel()}
            onCancel={() => setShowCancelConfirm(false)}
          />
        )}

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
    </AccountStatusContext.Provider>
    </ProjectsSidebarRefreshContext.Provider>
  );
}
