import ReactDOMServer from "react-dom/server";
import { StaticRouter } from "react-router";
import SiteHeader from "./components/SiteHeader";
import SiteFooter from "./components/SiteFooter";
import { AuthProvider } from "./lib/AuthProvider";
import LandingPage from "./pages/LandingPage";
import FeaturesPage, { META_TITLE as FEATURES_TITLE, META_DESCRIPTION as FEATURES_DESC } from "./pages/FeaturesPage";
import RoadmapPage, { META_TITLE as ROADMAP_TITLE, META_DESCRIPTION as ROADMAP_DESC } from "./pages/RoadmapPage";
import StlDiffPage, { META_TITLE as STL_DIFF_TITLE, META_DESCRIPTION as STL_DIFF_DESC } from "./pages/StlDiffPage";
import ThreeMfDiffPage, {
  META_TITLE as THREE_MF_DIFF_TITLE,
  META_DESCRIPTION as THREE_MF_DIFF_DESC,
} from "./pages/ThreeMfDiffPage";
import ObjDiffPage, { META_TITLE as OBJ_DIFF_TITLE, META_DESCRIPTION as OBJ_DIFF_DESC } from "./pages/ObjDiffPage";
import VersionControlPage, {
  META_TITLE as VERSION_CONTROL_TITLE,
  META_DESCRIPTION as VERSION_CONTROL_DESC,
} from "./pages/VersionControlPage";
import VsManualComparisonPage, {
  META_TITLE as VS_MANUAL_TITLE,
  META_DESCRIPTION as VS_MANUAL_DESC,
} from "./pages/VsManualComparisonPage";
import DocsPage, { META_TITLE as DOCS_TITLE, META_DESCRIPTION as DOCS_DESC } from "./pages/DocsPage";
import BlogIndexPage, { META_TITLE as BLOG_INDEX_TITLE, META_DESCRIPTION as BLOG_INDEX_DESC } from "./pages/BlogIndexPage";

/**
 * Routes this entry knows how to prerender at build time (see
 * scripts/prerender.mjs). Deliberately a small, hand-picked subset of the
 * full router (router.tsx) — only static marketing/content pages that
 * don't need WebGL, auth state, or per-request data. The interactive diff
 * tool (/live and its keyword variants) stays 100% client-rendered, per
 * the "nothing uploaded, client-side only" product requirement — those
 * routes are unaffected by this file.
 */
export const PRERENDER_ROUTES: Record<string, React.ComponentType> = {
  "/": LandingPage,
  "/features": FeaturesPage,
  "/roadmap": RoadmapPage,
  "/stl-diff": StlDiffPage,
  "/3mf-diff": ThreeMfDiffPage,
  "/obj-diff": ObjDiffPage,
  "/3d-print-version-control": VersionControlPage,
  "/vs-manual-comparison": VsManualComparisonPage,
  "/docs": DocsPage,
  "/blog": BlogIndexPage,
};

/** Per-route <title>/<meta name="description"> for the static HTML shell —
 * duplicates each page's own useDocumentMeta() call (which only takes
 * effect client-side, after hydration) so the prerendered HTML has correct
 * head tags before any JS runs. "/" is omitted: it keeps index.html's own
 * baseline title/description as-is, matching current behavior. */
export const ROUTE_META: Record<string, { title: string; description: string }> = {
  "/features": { title: FEATURES_TITLE, description: FEATURES_DESC },
  "/roadmap": { title: ROADMAP_TITLE, description: ROADMAP_DESC },
  "/stl-diff": { title: STL_DIFF_TITLE, description: STL_DIFF_DESC },
  "/3mf-diff": { title: THREE_MF_DIFF_TITLE, description: THREE_MF_DIFF_DESC },
  "/obj-diff": { title: OBJ_DIFF_TITLE, description: OBJ_DIFF_DESC },
  "/3d-print-version-control": { title: VERSION_CONTROL_TITLE, description: VERSION_CONTROL_DESC },
  "/vs-manual-comparison": { title: VS_MANUAL_TITLE, description: VS_MANUAL_DESC },
  "/docs": { title: DOCS_TITLE, description: DOCS_DESC },
  "/blog": { title: BLOG_INDEX_TITLE, description: BLOG_INDEX_DESC },
};

/** Renders one route to a static HTML string of its body content (no
 * <html>/<head> — the prerender script splices this into the built
 * index.html template). Mirrors RootLayout's marketing-page chrome
 * (SiteHeader + page + SiteFooter) directly rather than reusing RootLayout
 * itself, since RootLayout also branches on dashboard routes that are
 * never part of this static set. */
export function renderRoute(pathname: string): string {
  const Page = PRERENDER_ROUTES[pathname];
  if (!Page) {
    throw new Error(`No prerender entry for route "${pathname}" — add it to PRERENDER_ROUTES in entry-server.tsx`);
  }

  return ReactDOMServer.renderToStaticMarkup(
    <StaticRouter location={pathname}>
      <AuthProvider>
        <div className="flex min-h-screen flex-col bg-ink-950">
          <SiteHeader />
          <div className="flex-1">
            <Page />
          </div>
          <SiteFooter />
        </div>
      </AuthProvider>
    </StaticRouter>,
  );
}
