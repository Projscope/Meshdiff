import { useState } from "react";

export default function RoadmapPage() {
  const [expandedVersion, setExpandedVersion] = useState<string | null>("v1.1.2");

  const handleScrollToPricing = () => {
    window.location.href = "/#pricing";
  };

  const roadmapItems = {
    planned: [
      {
        icon: "🎯",
        title: "Bidirectional comment pin highlighting",
        description: "Click a pin in the list to highlight it in the 3D viewport, and vice versa for easier navigation.",
      },
      {
        icon: "🔐",
        title: "Forgot password & OAuth",
        description: "Self-serve password reset and login with Google OAuth for simpler account recovery and authentication.",
      },
      {
        icon: "👥",
        title: "Team billing",
        description: "Manage subscriptions for entire teams with per-seat pricing and admin controls.",
      },
      {
        icon: "📊",
        title: "Magnitude diff visualization",
        description: "Show precise amount of change (scale/rotation/shift) rather than binary added/removed regions.",
      },
    ],
  };

  const changelog = [
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
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Hero */}
      <section className="border-b border-neutral-800 px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Roadmap</h1>
          <h2 className="mt-4 text-2xl font-light text-neutral-300">Where Meshdiff is headed.</h2>
          <p className="mt-6 text-base leading-relaxed text-neutral-400">
            Features we're actively building to improve your 3D comparison and design review workflow.
          </p>
        </div>
      </section>

      {/* Roadmap Sections & Changelog */}
      <section className="border-t border-neutral-800 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-16">
          {/* Coming Soon */}
          <div>
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Coming Soon</p>
              <p className="mt-2 text-2xl font-light text-neutral-200">What's Next</p>
            </div>
            <div className="space-y-4">
              {roadmapItems.planned.map((item) => (
                <div key={item.title} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white">{item.title}</h3>
                      <p className="mt-2 text-sm text-neutral-400">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Changelog */}
          <div className="mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Changelog</p>
            <p className="mt-2 text-3xl font-light text-neutral-200">What's shipped so far.</p>
          </div>

          <div className="space-y-6">
            {changelog.map((release) => {
              const isExpanded = expandedVersion === release.version;
              return (
                <div key={release.version} className="border-l border-neutral-800 pl-6">
                  <button
                    onClick={() => setExpandedVersion(isExpanded ? null : release.version)}
                    className="mb-4 flex w-full items-start justify-between gap-4 text-left hover:opacity-75 transition-opacity"
                  >
                    <div>
                      <p className="text-sm font-semibold text-neutral-500">{release.version}</p>
                      <p className="text-xs text-neutral-600">{release.date}</p>
                    </div>
                    <span className={`flex-shrink-0 text-neutral-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </button>
                  <h3 className="mb-4 text-lg font-semibold text-white">{release.title}</h3>

                  {isExpanded && (
                    <div className="space-y-6">
                      {release.items.new && release.items.new.length > 0 && (
                        <div>
                          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-400">New</p>
                          <ul className="space-y-2">
                            {release.items.new.map((item) => (
                              <li key={item} className="flex gap-3 text-sm text-neutral-300">
                                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
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
                              <li key={item} className="flex gap-3 text-sm text-neutral-300">
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
                              <li key={item} className="flex gap-3 text-sm text-neutral-300">
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
      <section className="border-t border-neutral-800 px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-light text-white">Ready to start comparing?</h2>
          <p className="mt-4 text-neutral-400">Try the free diff tool or explore our pricing plans.</p>
          <div className="mt-8 flex justify-center gap-4">
            <a
              href="/live"
              className="rounded border border-neutral-700 px-6 py-3 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:text-white transition-colors"
            >
              Free Diff Tool
            </a>
            <button
              onClick={handleScrollToPricing}
              className="rounded bg-emerald-700 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-800 transition-colors cursor-pointer"
            >
              View Pricing
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
