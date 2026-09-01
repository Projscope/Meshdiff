import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  listProjects,
  listMyTeams,
  getWorkspace,
  getSubscription,
  openBillingPortal,
  startProCheckout,
  startTeamCheckout,
  type ProjectSummary,
  type SubscriptionStatus,
} from "../lib/projectsApi";
import { consumePendingCheckout } from "../lib/pendingCheckout";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthProvider";
import NewProjectModal from "./NewProjectModal";
import TeamModal from "./TeamModal";
import UpgradeToTeamModal from "./UpgradeToTeamModal";
import ManagePlanModal from "./ManagePlanModal";
import EditWorkspaceModal from "./EditWorkspaceModal";
import ConfirmDialog from "./ConfirmDialog";
import LanguageSelect from "./LanguageSelect";
import NotificationBell from "./NotificationBell";

// UI convenience only — hides the sidebar link for everyone else. The real
// admin boundary is server-side (requireAdmin.ts's ADMIN_EMAILS), so a
// non-admin typing /admin directly still gets a 403 from the API.
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

const STATUS_DOT: Record<"pass" | "warn" | "fail", string> = {
  pass: "bg-accent-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
};

function ProjectStatusDot({ status }: { status: "pass" | "warn" | "fail" | null }) {
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status ? STATUS_DOT[status] : "bg-ink-600"}`} />;
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
// GET /billing/subscription call of their own. Despite the name, isPro
// means "has full paid access" — true for Pro, for a Team subscription's
// owner, and for a team member riding the owner's seats (mirrors the
// backend's getAccountAccess().status==='pro', not a raw tier check —
// see ProjectDetailPage.tsx/ProjectsListPage.tsx's upload/create gating).
const AccountStatusContext = createContext<{ isRestricted: boolean; isPro: boolean }>({ isRestricted: false, isPro: false });
export function useAccountStatus(): { isRestricted: boolean; isPro: boolean } {
  return useContext(AccountStatusContext);
}

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
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
  // TeamModal is create-only now — managing an existing team is a full page
  // at /teams/:teamId (see TeamDashboardPage.tsx) instead of this popup.
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showManagePlan, setShowManagePlan] = useState(false);
  const [pendingSignOut, setPendingSignOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("My Workspace");
  const [isEditWorkspaceOpen, setIsEditWorkspaceOpen] = useState(false);
  // Persisted so the sidebar doesn't reset to expanded on every reload —
  // lazy-initialized from localStorage to avoid a flash of the wrong state.
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(
    () => localStorage.getItem("meshdiff_projects_expanded") !== "false",
  );
  const [isAdminExpanded, setIsAdminExpanded] = useState(
    () => localStorage.getItem("meshdiff_admin_expanded") !== "false",
  );
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Creating a team is a Team-plan feature, gated on the real subscription
  // tier — a non-Team user (Free or Pro) gets prompted to upgrade instead
  // of a create form.
  function handleCreateTeamClick() {
    if (subscription?.tier !== "team") {
      setShowUpgrade(true);
    } else {
      setShowCreateTeam(true);
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
    localStorage.setItem("meshdiff_projects_expanded", String(isProjectsExpanded));
  }, [isProjectsExpanded]);

  useEffect(() => {
    localStorage.setItem("meshdiff_admin_expanded", String(isAdminExpanded));
  }, [isAdminExpanded]);

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
      // The pricing page's "Subscribe to Pro/Team" sends a signed-in-but-
      // not-yet-subscribed visitor straight here and sets this flag (see
      // PricingCards.tsx's handleCheckout) — resume the actual Stripe
      // redirect now that we know for sure they're not already on that
      // tier (re-checked here, not just trusted from the pricing page, in
      // case something changed in another tab in between).
      const pendingTier = consumePendingCheckout();
      if (pendingTier && result.data.tier !== pendingTier) {
        void handleAutoResumeCheckout(pendingTier);
      }
    });
  }, []);

  async function handleAutoResumeCheckout(tier: "pro" | "team") {
    const result = tier === "team" ? await startTeamCheckout() : await startProCheckout();
    if (result.success) {
      window.location.href = result.data.url;
    } else {
      setNotice({ type: "error", message: result.error });
    }
  }

  // Stripe Checkout redirects back to /projects?checkout=success|cancelled
  // (see ManagePlanModal's checkout redirect). Only depends on
  // location.search, not location.pathname, so stripping the param via
  // navigate() below doesn't re-trigger the sidebar's project/team refetch
  // effect above.
  useEffect(() => {
    const checkout = new URLSearchParams(location.search).get("checkout");
    if (!checkout) return;

    if (checkout === "success") {
      // Which tier this checkout was for isn't known from the redirect URL
      // alone (Stripe's success_url is the same for both — see
      // billing.ts's /billing/checkout) — show a tier-neutral message until
      // the subscription poll below resolves the real tier.
      setNotice({ type: "success", message: "Activating your plan…" });
      // The Stripe webhook that records the subscription can take several
      // seconds. Retry aggressively for up to 10 seconds with exponential backoff.
      const retryGetSubscription = async () => {
        const delays = [1000, 2000, 2000, 2000, 3000];
        for (let i = 0; i < delays.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, delays[i]));
          const result = await getSubscription();
          if (result.success && (result.data.tier === "pro" || result.data.tier === "team")) {
            setSubscription(result.data);
            setNotice({
              type: "success",
              message: result.data.tier === "team" ? "You're now on the Team plan." : "You're now on the Pro plan.",
            });
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
    setIsSigningOut(true);
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

  const emailInitial = user?.email?.[0]?.toUpperCase() ?? "?";

  // isTeamMember is a display-only signal, true for the paying owner AND
  // any invited member riding their seats. It's OR'd with
  // subscription.tier==='team' below because a fresh Team subscriber isn't
  // a team_members row yet until they actually create their team (teams
  // and subscriptions are separate — see billing.ts) — without the OR,
  // someone who just paid for Team but hasn't created a team yet would
  // wrongly show as "Free".
  const isTeamMember = teams.length > 0 || subscription?.tier === "team";
  const isPro = subscription?.tier === "pro";
  const isTrialing = !!subscription?.isTrialing;
  // A free signup gets full ("pro") access for their first 14 days — see
  // getAccountAccess() in apps/api/src/lib/subscription.ts. Stays false
  // until the subscription fetch resolves, so the sidebar doesn't flash a
  // locked state on first load.
  const isRestricted = subscription?.accountStatus === "restricted";
  // Distinct from isTeamMember: a regular team member (not the owner) has
  // no subscription/stripe_customers row of their own, so /billing/portal
  // would 404 for them — only the actual subscriber (Pro or Team) gets the
  // "Payment method & invoices" link and the full ManagePlanModal below.
  const isBillingOwner = subscription?.tier === "pro" || subscription?.tier === "team";
  // Hide the plan-management trigger only for someone riding a team owner's
  // seats with no subscription of their own — everyone else (not yet
  // subscribed, or the actual payer) has a plan to manage.
  const canManagePlan = !isTeamMember || isBillingOwner;
  const planTextClass = isTeamMember
    ? "text-violet-400"
    : isPro || isTrialing
      ? "text-accent-400"
      : isRestricted
        ? "text-red-400"
        : "text-ink-300";

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
    <AccountStatusContext.Provider value={{ isRestricted, isPro: subscription?.accountStatus === "pro" }}>
      <div className="flex min-h-screen flex-col bg-ink-950 text-ink-100 md:flex-row">
        {/* Mobile-only top bar — the sidebar below becomes a hidden overlay
            under the md breakpoint, so this is the only way to open it or
            see the logo on a phone-width screen. */}
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3 md:hidden">
          <Link to="/" className="flex items-center gap-2">
            <div aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-500 text-chrome-950">
              <span className="text-sm font-bold leading-none">^</span>
            </div>
            <h1 className="font-display text-sm font-semibold text-ink-50">Meshdiff</h1>
          </Link>
          <button
            type="button"
            onClick={() => setIsSidebarOpen((open) => !open)}
            aria-label="Toggle navigation menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-800 text-ink-400 hover:bg-ink-800 hover:text-ink-50"
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
          className={`${isSidebarOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 w-64 flex-col border-r border-ink-800 bg-ink-950 md:static md:z-auto md:flex md:w-64 md:shrink-0`}
        >
          <Link to="/" className="flex items-center gap-2 border-b border-ink-800 px-4 py-3">
            <div aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-500 text-chrome-950">
              <span className="text-sm font-bold leading-none">^</span>
            </div>
            <h1 className="truncate font-display text-sm font-semibold text-ink-50">Meshdiff</h1>
          </Link>

          <div className="border-b border-ink-800 px-4 py-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsProjectsExpanded((expanded) => !expanded)}
                className="flex min-w-0 flex-1 items-center gap-1 text-left"
                title={isProjectsExpanded ? t("sidebar.collapseProjects") : t("sidebar.expandProjects")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-3 w-3 shrink-0 text-ink-600 transition-transform ${isProjectsExpanded ? "rotate-90" : ""}`}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-widest text-ink-600">
                  {workspaceName}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditWorkspaceOpen(true)}
                title={t("sidebar.renameWorkspace")}
                className="shrink-0 rounded p-0.5 text-ink-600 hover:bg-ink-800 hover:text-ink-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3 pr-1">
            {isProjectsExpanded && (
              // A tinted background groups this block visually under the
              // workspace header above it (parent/child), instead of a
              // connector line.
              <div className="rounded-md bg-ink-900/40 py-1">
                <div className="flex items-center justify-between px-2">
                  <Link
                    to="/projects"
                    className="text-[10px] font-semibold uppercase tracking-widest text-ink-600 hover:text-ink-300"
                  >
                    {t("sidebar.projects")}
                  </Link>
                  {!isRestricted && (
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      title={t("sidebar.newProject")}
                      className="flex h-5 w-5 items-center justify-center rounded text-ink-500 hover:bg-ink-800 hover:text-ink-50"
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
                      placeholder={t("sidebar.searchPlaceholder")}
                      className="w-full rounded border border-ink-800 bg-ink-900 px-2 py-1 text-xs text-ink-300 placeholder:text-ink-600 focus:border-ink-600 focus:outline-none"
                    />
                  </div>
                )}

                <div className="mt-2 flex flex-col gap-0.5">
                  {sortedProjects === null && (
                    <p className="px-2 py-1.5 text-xs text-ink-600">{t("sidebar.loading")}</p>
                  )}
                  {sortedProjects?.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-ink-600">{t("sidebar.noProjectsYet")}</p>
                  )}
                  {sortedProjects !== null && sortedProjects.length > 0 && visibleProjects?.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-ink-600">
                      {t("sidebar.noProjectsMatch", { query: projectSearch })}
                    </p>
                  )}
                  {visibleProjects?.map((project) => {
                    const isActive = project.id === projectId;
                    return (
                      <Link
                        key={project.id}
                        to={`/projects/${project.id}`}
                        className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                          isActive ? "bg-ink-800 text-ink-50" : "text-ink-400 hover:bg-ink-900 hover:text-ink-200"
                        }`}
                      >
                        <ProjectStatusDot status={project.latestPrintabilityStatus} />
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                        <span className="shrink-0 text-[11px] text-ink-600">{project.versionCount}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Team billing is real now — anyone (Free, Pro, or already on
                a team) can click "+" to buy Team directly, so the section
                is always shown; the button itself just gates on whether
                they're already the Team subscriber (in which case "+"
                opens the create-team form instead of a checkout prompt). */}
            <>
                <div className="mt-4 flex items-center justify-between px-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-600">{t("sidebar.teams")}</span>
                  <button
                    type="button"
                    onClick={handleCreateTeamClick}
                    title={subscription?.tier === "team" ? t("sidebar.newTeam") : t("sidebar.upgradeToCreateTeam")}
                    className="flex h-5 w-5 items-center justify-center rounded text-ink-500 hover:bg-ink-800 hover:text-ink-50"
                  >
                    +
                  </button>
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  {teams.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-ink-600">{t("sidebar.noTeamsYet")}</p>
                  )}
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => navigate(`/teams/${team.id}`)}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink-400 hover:bg-ink-900 hover:text-ink-200"
                    >
                      <span className="min-w-0 flex-1 truncate">{team.name}</span>
                      <span className="shrink-0 rounded bg-ink-800 px-1.5 py-0.5 text-[9px] uppercase text-ink-500">
                        {team.myRole}
                      </span>
                    </button>
                  ))}
                </div>
              </>

            {isAdmin && (
              <>
                <div className="mt-4 px-2">
                  <button
                    type="button"
                    onClick={() => setIsAdminExpanded((expanded) => !expanded)}
                    className="flex items-center gap-1 text-left"
                    title={isAdminExpanded ? "Collapse admin" : "Expand admin"}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`h-3 w-3 shrink-0 text-ink-600 transition-transform ${isAdminExpanded ? "rotate-90" : ""}`}
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-600">Admin</span>
                  </button>
                </div>
                {isAdminExpanded && (
                <div className="mt-2 rounded-md bg-ink-900/40 py-1">
                  <div className="flex flex-col gap-0.5">
                    <Link
                      to="/admin"
                      className="rounded px-2 py-1.5 text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/admin/users"
                      className="rounded px-2 py-1.5 text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                    >
                      Users
                    </Link>
                    <Link
                      to="/admin/analytics"
                      className="rounded px-2 py-1.5 text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                    >
                      Analytics
                    </Link>
                    <Link
                      to="/admin/blog"
                      className="rounded px-2 py-1.5 text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                    >
                      Blog
                    </Link>
                  </div>
                </div>
                )}
              </>
            )}
          </nav>

          {/* Mobile-only: the desktop top bar below (md:flex) covers this
              account cluster on wider screens, but the mobile sidebar
              overlay needs its own way to reach billing/language/sign-out. */}
          <div className="border-t border-ink-800 px-4 py-3 md:hidden">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold ${planTextClass}`}>
                {isTeamMember
                  ? t("billing.teamPlan")
                  : isPro
                    ? t("billing.proPlan")
                    : isTrialing
                      ? t("billing.freeTrialPlan")
                      : t("billing.freePlan")}{" "}
                {t("billing.planSuffix")}
              </span>
              {canManagePlan && (
                <button
                  type="button"
                  onClick={() => setShowManagePlan(true)}
                  className={`shrink-0 text-[11px] font-medium ${
                    isRestricted ? "text-red-400 hover:text-red-300" : "text-accent-400 hover:text-accent-300"
                  }`}
                >
                  {isBillingOwner ? t("billing.managePlan") : t("billing.upgrade")}
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
              {isBillingOwner
                ? subscription?.cancelAtPeriodEnd
                  ? t("billing.endsReadOnly", {
                      date: subscription.currentPeriodEnd
                        ? formatRenewalDate(subscription.currentPeriodEnd)
                        : t("billing.endsAtPeriodEnd"),
                    })
                  : subscription?.currentPeriodEnd
                    ? t("billing.renewsOn", { date: formatRenewalDate(subscription.currentPeriodEnd) })
                    : t("billing.renewsAutomatically")
                : isTeamMember
                  ? t("billing.accessViaTeam")
                  : isTrialing
                    ? t("billing.trialActive", { count: subscription?.trialDaysRemaining ?? 0 })
                    : isRestricted
                      ? t("billing.trialEnded")
                      : t("billing.freeBlurb")}
            </p>
            {isBillingOwner && (
              <button
                type="button"
                onClick={() => void handleManageBilling()}
                className="mt-2 text-[11px] font-medium text-ink-400 hover:text-ink-200"
              >
                {t("billing.paymentAndInvoices")}
              </button>
            )}
            <div className="mt-2">
              <LanguageSelect />
            </div>
          </div>

          <div className="relative border-t border-ink-800 p-3 md:hidden">
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-ink-900"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[11px] font-semibold text-ink-200">
                {emailInitial}
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-ink-400">{user?.email ?? ""}</span>
            </button>
            {isMenuOpen && (
              <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border border-ink-800 bg-ink-900 shadow-xl">
                <button
                  type="button"
                  onClick={() => setPendingSignOut(true)}
                  className="w-full px-3 py-2 text-left text-xs text-ink-300 hover:bg-ink-800"
                >
                  {t("sidebar.signOut")}
                </button>
              </div>
            )}
          </div>

          {/* Desktop-only footer — just a direct sign-out, no dropdown.
              Identity/billing/language/notifications live in the top bar
              now (see the <header> below), so this doesn't repeat them. */}
          <div className="hidden border-t border-ink-800 px-4 py-3 md:block">
            <button
              type="button"
              onClick={() => setPendingSignOut(true)}
              className="text-xs font-medium text-ink-400 hover:text-ink-200"
            >
              {t("sidebar.signOut")}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop top bar — everything account-scoped (billing, language,
              notifications, sign-out) lives here now instead of the
              sidebar footer, so it's visible without scrolling the nav all
              the way down. Hidden on mobile: the sidebar's own header covers
              the logo there, and this cluster reappears inside the mobile
              sidebar overlay instead (see the <aside> footer above). */}
          <header className="hidden items-center justify-end gap-4 border-b border-ink-800 px-6 py-2.5 md:flex">
            <div className="flex items-center gap-2 text-xs">
              <span className={`font-semibold ${planTextClass}`}>
                {isTeamMember
                  ? t("billing.teamPlan")
                  : isPro
                    ? t("billing.proPlan")
                    : isTrialing
                      ? t("billing.freeTrialPlan")
                      : t("billing.freePlan")}{" "}
                {t("billing.planSuffix")}
              </span>
              {canManagePlan && (
                <button
                  type="button"
                  onClick={() => setShowManagePlan(true)}
                  className={`font-medium ${
                    isRestricted ? "text-red-400 hover:text-red-300" : "text-accent-400 hover:text-accent-300"
                  }`}
                >
                  {isBillingOwner ? t("billing.managePlan") : t("billing.upgrade")}
                </button>
              )}
            </div>

            <div className="h-4 w-px bg-ink-800" />

            <LanguageSelect />

            <NotificationBell />

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-ink-900"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[11px] font-semibold text-ink-200">
                  {emailInitial}
                </div>
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-lg border border-ink-800 bg-ink-900 shadow-xl">
                  <div className="border-b border-ink-800 px-3 py-2">
                    <p className="truncate text-xs text-ink-400">{user?.email ?? ""}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                      {isBillingOwner
                        ? subscription?.cancelAtPeriodEnd
                          ? t("billing.endsReadOnly", {
                              date: subscription.currentPeriodEnd
                                ? formatRenewalDate(subscription.currentPeriodEnd)
                                : t("billing.endsAtPeriodEnd"),
                            })
                          : subscription?.currentPeriodEnd
                            ? t("billing.renewsOn", { date: formatRenewalDate(subscription.currentPeriodEnd) })
                            : t("billing.renewsAutomatically")
                        : isTeamMember
                          ? t("billing.accessViaTeam")
                          : isTrialing
                            ? t("billing.trialActive", { count: subscription?.trialDaysRemaining ?? 0 })
                            : isRestricted
                              ? t("billing.trialEnded")
                              : t("billing.freeBlurb")}
                    </p>
                  </div>
                  {isBillingOwner && (
                    <button
                      type="button"
                      onClick={() => void handleManageBilling()}
                      className="block w-full px-3 py-2 text-left text-xs text-ink-300 hover:bg-ink-800"
                    >
                      {t("billing.paymentAndInvoices")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingSignOut(true)}
                    className="block w-full px-3 py-2 text-left text-xs text-ink-300 hover:bg-ink-800"
                  >
                    {t("sidebar.signOut")}
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>

        {notice && (
          <div
            className={`fixed right-4 top-4 z-40 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
              notice.type === "success"
                ? "border-accent-800 bg-accent-950/90 text-accent-300"
                : notice.type === "error"
                  ? "border-red-800 bg-red-950/90 text-red-300"
                  : "border-ink-700 bg-ink-900/95 text-ink-300"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span>{notice.message}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="shrink-0 text-ink-500 hover:text-ink-300"
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

        {showCreateTeam && (
          <TeamModal
            onClose={() => setShowCreateTeam(false)}
            onCreated={(team) => {
              setTeams((prev) => [...prev, { ...team, myRole: "admin" }]);
              setShowCreateTeam(false);
              navigate(`/teams/${team.id}`);
            }}
          />
        )}

        {showUpgrade && <UpgradeToTeamModal onClose={() => setShowUpgrade(false)} />}

        {showManagePlan && subscription && (
          <ManagePlanModal
            subscription={subscription}
            onClose={() => setShowManagePlan(false)}
            onSubscriptionChange={(updates) => setSubscription((prev) => (prev ? { ...prev, ...updates } : prev))}
            onNotice={setNotice}
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

        {pendingSignOut && (
          <ConfirmDialog
            title={t("sidebar.signOutConfirmTitle")}
            message={t("sidebar.signOutConfirmMessage")}
            confirmLabel={t("sidebar.signOut")}
            cancelLabel={t("common.cancel")}
            isConfirming={isSigningOut}
            onConfirm={() => void handleSignOut()}
            onCancel={() => setPendingSignOut(false)}
          />
        )}
      </div>
    </AccountStatusContext.Provider>
    </ProjectsSidebarRefreshContext.Provider>
  );
}
