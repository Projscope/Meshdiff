import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import LoadingCube from "./LoadingCube";

export default function RootLayout() {
  const location = useLocation();

  // index.html ships one static <link rel="canonical"> pointing at "/" —
  // fine for the very first paint, but every route past that (an SPA
  // serves the same index.html everywhere) inherited that same tag, so
  // Lighthouse flagged e.g. /projects as canonicalizing to the homepage
  // instead of itself. Query strings/hashes are dropped so query-param
  // variants of the same page (e.g. pagination) still canonicalize to one
  // URL, matching how the sitemap/SEO landing pages already treat routes.
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", `https://meshdiff.com${location.pathname}`);
  }, [location.pathname]);

  // The signed-in dashboard (ProjectsLayout) has its own sidebar with a
  // logo/link, so the marketing site's header and footer would just be
  // redundant chrome there. /admin is also wrapped in ProjectsLayout (see
  // router.tsx) — miss it here and the marketing SiteHeader stacks on top
  // of the dashboard sidebar's own logo/nav.
  const isDashboard = location.pathname.startsWith("/projects") || location.pathname.startsWith("/admin");

  return (
    <div className="flex min-h-screen flex-col bg-ink-950">
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
