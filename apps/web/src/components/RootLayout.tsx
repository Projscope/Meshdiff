import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import LoadingCube from "./LoadingCube";

export default function RootLayout() {
  const location = useLocation();
  // The signed-in dashboard (ProjectsLayout) has its own sidebar with a
  // logo/link, so the marketing site's header and footer would just be
  // redundant chrome there. /admin is also wrapped in ProjectsLayout (see
  // router.tsx) — miss it here and the marketing SiteHeader stacks on top
  // of the dashboard sidebar's own logo/nav.
  const isDashboard = location.pathname.startsWith("/projects") || location.pathname.startsWith("/admin");

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950">
      {!isDashboard && <SiteHeader />}
      {/* flex-1 stretches to fill leftover vertical space regardless of
          how tall the page's own content is (e.g. a short page like
          /embed) — without its own background, that leftover space
          shows through as the browser default (white) instead of the
          site's dark theme. One Suspense boundary here covers every
          React.lazy()-loaded route (see router.tsx) — the 3D/Three.js
          pages are code-split out of the main bundle so the marketing
          landing page doesn't have to download them (a real Lighthouse
          finding: three.js was 77% unused JS on the landing page). */}
      <div className="flex-1">
        <Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center">
              <LoadingCube />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </div>
      {!isDashboard && <SiteFooter />}
    </div>
  );
}
