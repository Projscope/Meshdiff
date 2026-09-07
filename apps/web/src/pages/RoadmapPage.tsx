import { useState } from "react";
import { Link } from "react-router-dom";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Roadmap & Changelog | Meshdiff";
export const META_DESCRIPTION =
  "What's shipped so far and what's next for Meshdiff's 3D model diff engine — version history, new features, and fixes.";

export default function RoadmapPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);
  const [expandedVersion, setExpandedVersion] = useState<string | null>("v1.5.0");

  const roadmapItems = {
    planned: [
      {
        icon: "📧",
        title: "Email notifications for reviews and mentions",
        description: "Get notified by email when you're mentioned, assigned a comment, or a version needs your review — not just in-app, so nothing gets missed when you're away from the dashboard.",
      },
      {
        icon: "🔐",
        title: "Forgot password & OAuth",
        description: "Self-serve password reset and login with Google OAuth for simpler account recovery and authentication.",
      },
      {
        icon: "📊",
        title: "Magnitude diff visualization",
        description: "Show precise amount of change (scale/rotation/shift) rather than binary added/removed regions.",
      },
      {
        icon: "👁️",
        title: "Colorblind-friendly status indicators",
        description: "Extend the colorblind-safe diff palette to approval badges, printability status, and other red/green indicators across the app.",
      },
    ],
  };

  const changelog = [
    {
      version: "v1.5.0",
      date: "2026-08-27",
      title: "Team review workflow and a repositioned homepage",
      items: {
        new: [
          "5-state version review workflow (Draft → In Review → Changes Requested → Approved → Superseded) with a full, auditable history of every transition",
          "Configurable per-project approval gates — Approve is blocked until every checked-off requirement is satisfied",
          "In-app notifications for review decisions, new submissions, and gate completion",
          "Comment lifecycle: Open/Resolved/Reopened status, assignees, priority, and @mentions that notify the mentioned teammate",
          "Persistent top bar in the Projects workspace with plan status, language, notifications, and account menu, replacing the old sidebar footer",
          "Signing out now asks for confirmation before ending your session",
        ],
        improved: [
          "Homepage repositioned around the team review/approval workflow instead of raw file comparison — new hero, workflow walkthrough, revision-history timeline, and an \"external review, no CAD software\" pitch moved up near the top",
          "Manage Plan dialog is now fully translated",
          "Projects list no longer leaves a large empty gap next to the sidebar on wide screens",
        ],
        fixed: [
          "Approval-status badges with longer labels (e.g. \"Changes Requested\") no longer wrap and break alignment in badge lists",
        ],
      },
    },
    {
      version: "v1.4.0",
      date: "2026-08-25",
      title: "Free trial and unified billing",
      items: {
        new: [
          "14-day full-access free trial for new signups, no card required — falls back to read-only after, same as a lapsed subscription",
          "Unified plan-management dialog — real in-app upgrade/downgrade between Free, Pro, and Team",
          "Ground-grid visibility toggle on every 3D viewer (Live Diff, Compare, Version detail)",
          "New /pricing comparison page; Free tier renamed to \"Base\" with a \"no credit card required\" badge",
        ],
        improved: [
          "Diff-report PDF export: screenshots fill their box instead of letterboxing, and every detailed-stats section is included",
          "Blog post links render in the brand accent color instead of plain white",
        ],
        fixed: [
          "A Team-tier subscriber's PDF export was incorrectly watermarked as Free",
          "New project creation was wrongly blocked for users still inside their trial window",
          "Personal (non-team) projects showed a stray \"Approved\" badge that doesn't apply to them",
          "Upgrade dialog buttons were unequal width and could render behind an open 3D comment popover",
          "Printability status dot moved to the project card's top-left corner",
        ],
      },
    },
    {
      version: "v1.3.0",
      date: "2026-08-22",
      title: "Blog CMS, print log, and SEO landing pages",
      items: {
        new: [
          "Admin-authored blog with Markdown, images, and embedded video — draft/publish workflow, paginated public index at /blog",
          "Slicer profile and print-result photo attachments per version, shown in a new Print Log section",
          "New SEO content pages: Docs, STL/3MF/OBJ diff, 3D print version control, and vs. manual comparison",
          "Server-rendered, prerendered marketing pages for faster first paint and better search indexing",
        ],
        improved: [
          "Radius/hole auto-detect on the version Details page now matches the reliable detection already on Compare — both share the same raw-surface-point search",
          "Distance tool shows dimension arrows with consistent, fixed sizing across every viewer",
          "Radius measurement on the Compare/Overlay view shows before → after diameter and delta for a matched hole change",
          "Header and footer link to the new Blog",
        ],
        fixed: [
          "Google Consent Mode default wasn't set, so GA4 undercounted real visitors",
          "Canonical/OG/sitemap URLs for prerendered routes' trailing-slash redirect",
        ],
      },
    },
    {
      version: "v1.2.0",
      date: "2026-08-20",
      title: "Team billing, light/dark theme, and a redesigned home page",
      items: {
        new: [
          "Team tier is live: per-seat billing, a team dashboard with a cross-project pending-approvals queue, and an audit log of every invite, approval, and rejection",
          "Light/dark theme toggle",
          "Manual alignment (None/Floor/Center) and colorblind-safe/high-contrast diff color palettes, plus an Overlay diff mode",
          "Hole inventory detection and automatic mesh repair on upload",
          "Distance and radius measuring tools on every viewer, including the Compare screen",
          "Threaded comment replies, drag-to-reposition, and delete",
          "Project History timeline showing added/removed stats and printability status for every version",
        ],
        improved: [
          "New visual identity across the whole app",
          "Home page rebuilt around a live, interactive diff demo",
          "Shading mode (smooth/flat/transparent) shared across every viewer",
          "Comment popovers show reply counts and stay a fixed readable size",
          "Compare toolbar decluttered — duplicate zoom/reset controls removed",
          "Faster, smaller landing page (compressed images, preloaded hero, more accessibility fixes)",
        ],
        fixed: [
          "Team subscribers were locked out of features they'd already paid for",
          "Two open-redirect security advisories in the routing library",
          "A security-header rollout that broke thumbnails, fonts, and some background processing in production",
          "Several text-contrast issues that fell short of accessibility guidelines",
        ],
      },
    },
    {
      version: "v1.1.2",
      date: "2026-08-18",
      title: "Control Scheme selector and faster page loads",
      items: {
        new: [
          "Control Scheme selector — switch between Meshdiff's native mouse bindings and CAD-style bindings (Fusion 360 / SolidWorks / AutoCAD) for orbit, pan, and zoom, with a shortcut legend",
        ],
        improved: [
          "Faster landing page load times",
          "Added extra security headers to protect against common web vulnerabilities",
        ],
        fixed: [
          "Right-click and Shift+middle-click drag not rotating the camera correctly in CAD control scheme",
        ],
      },
    },
    {
      version: "v1.1.0",
      date: "2026-08-16",
      title: "Creator growth tools, Reset View, and sidebar polish",
      items: {
        new: [
          "Reset View button for the Compare tool and both Measure tools",
          "Embeddable revision badge for Printables, MakerWorld, Thingiverse, and personal sites (/embed)",
          "SEO landing pages for STL and 3MF comparison search terms",
          "Search box for the sidebar project list",
          "Collapsible Projects and Admin sections in the sidebar",
        ],
        improved: [
          "Billing card moved below navigation, directly above the account footer",
          "Tinted panel styling for the Projects and Admin sidebar sections",
          "Teams section hidden for Pro users with no teams",
          "HTML and Markdown snippet formats with a clickable live preview and optional share-link input",
        ],
        fixed: [
          "Reset View wasn't restoring the original camera pose",
          "'Powered by Meshdiff' footer badge floated instead of staying static",
          "Nested scroll box causing the footer to overlap page content",
          "White background gap on short pages caused by an unstyled layout wrapper",
        ],
      },
    },
    {
      version: "v1.0.0",
      date: "2026-08-14",
      title: "Project workspaces launch",
      items: {
        new: [
          "Project management with version history and team collaboration",
          "Team creation and member invitations with role-based access",
          "Version approval workflows (Pending/Approved/Rejected)",
          "PDF diff reports with screenshots from Compare and Measure views",
          "Auto-generated sample projects for new workspace creation",
        ],
        improved: [
          "Redesigned landing page with feature showcase and pricing tiers",
          "Responsive properties panel in measure view",
          "Cleaner sidebar interface for project details",
        ],
        fixed: [
          "Email confirmation delivery for new signups",
          "Horizontal scrolling in sidebar panels",
          "PDF report download functionality",
          "Missing thumbnails for sample projects",
        ],
      },
    },
    {
      version: "v0.9.0",
      date: "2026-08-01",
      title: "Live diff tool and community features",
      items: {
        new: [
          "Free community diff tool with no signup required",
          "Drag-and-drop STL/OBJ/3MF comparison side-by-side",
          "Visual diff highlighting with color-coded changes",
          "Dimensional deviation analysis for model comparison",
          "Printability assessment (Pass/Warn/Fail)",
          "Demo models for one-click testing",
          "Share links with temporary expiration for team reviews",
        ],
        improved: [
          "Real-time diff updates as comparison settings change",
          "Fast rendering and computation for large models",
          "Responsive design for mobile and tablet browsers",
        ],
      },
    },
  ];

  return (
    <div className="min-h-screen bg-ink-950 text-ink-50">
      {/* Hero */}
      <section className="border-b border-ink-800 px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Roadmap</h1>
          <h2 className="mt-4 text-2xl font-light text-ink-300">Where Meshdiff is headed.</h2>
          <p className="mt-6 text-base leading-relaxed text-ink-400">
            Features we're actively building to improve your 3D comparison and design review workflow.
          </p>
        </div>
      </section>

      {/* Roadmap Sections & Changelog */}
      <section className="border-t border-ink-800 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-16">
          {/* Coming Soon */}
          <div>
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">Coming Soon</p>
              <p className="mt-2 text-2xl font-light text-ink-200">What's Next</p>
            </div>
            <div className="space-y-4">
              {roadmapItems.planned.map((item) => (
                <div key={item.title} className="rounded-lg border border-ink-800 bg-ink-900/50 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-ink-50">{item.title}</h3>
                      <p className="mt-2 text-sm text-ink-400">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Changelog */}
          <div className="mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">Changelog</p>
            <p className="mt-2 text-3xl font-light text-ink-200">What's shipped so far.</p>
          </div>

          <div className="space-y-6">
            {changelog.map((release) => {
              const isExpanded = expandedVersion === release.version;
              return (
                <div key={release.version} className="border-l border-ink-800 pl-6">
                  <button
                    onClick={() => setExpandedVersion(isExpanded ? null : release.version)}
                    className="mb-4 flex w-full items-start justify-between gap-4 text-left hover:opacity-75 transition-opacity"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink-500">{release.version}</p>
                      <p className="text-xs text-ink-600">{release.date}</p>
                    </div>
                    <span className={`flex-shrink-0 text-ink-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </button>
                  <h3 className="mb-4 text-lg font-semibold text-ink-50">{release.title}</h3>

                  {isExpanded && (
                    <div className="space-y-6">
                      {release.items.new && release.items.new.length > 0 && (
                        <div>
                          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent-fg-400">New</p>
                          <ul className="space-y-2">
                            {release.items.new.map((item) => (
                              <li key={item} className="flex gap-3 text-sm text-ink-300">
                                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-500" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {release.items.improved && release.items.improved.length > 0 && (
                        <div>
                          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-400">Improved</p>
                          <ul className="space-y-2">
                            {release.items.improved.map((item) => (
                              <li key={item} className="flex gap-3 text-sm text-ink-300">
                                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {release.items.fixed && release.items.fixed.length > 0 && (
                        <div>
                          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-purple-400">Fixed</p>
                          <ul className="space-y-2">
                            {release.items.fixed.map((item) => (
                              <li key={item} className="flex gap-3 text-sm text-ink-300">
                                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ink-800 px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-light text-ink-50">Ready to start comparing?</h2>
          <p className="mt-4 text-ink-400">Try the free diff tool or explore our pricing plans.</p>
          <div className="mt-8 flex justify-center gap-4">
            <a
              href="/live"
              className="rounded border border-ink-700 px-6 py-3 text-sm font-medium text-ink-200 hover:border-ink-500 hover:text-ink-50 transition-colors"
            >
              Free Diff Tool
            </a>
            <Link
              to="/pricing"
              className="rounded bg-accent-700 px-6 py-3 text-sm font-medium text-ink-50 hover:bg-accent-800 transition-colors cursor-pointer"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
