import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import FeaturesPage from "./pages/FeaturesPage";
import EmbedBadgePage from "./pages/EmbedBadgePage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import RoadmapPage from "./pages/RoadmapPage";
import StlDiffPage from "./pages/StlDiffPage";
import ThreeMfDiffPage from "./pages/ThreeMfDiffPage";
import ObjDiffPage from "./pages/ObjDiffPage";
import VersionControlPage from "./pages/VersionControlPage";
import VsManualComparisonPage from "./pages/VsManualComparisonPage";
import DocsPage from "./pages/DocsPage";
import PricingPage from "./pages/PricingPage";
import BlogIndexPage from "./pages/BlogIndexPage";
import BlogPostPage from "./pages/BlogPostPage";
import ProjectsListPage from "./pages/ProjectsListPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminAnalyticsPage from "./pages/AdminAnalyticsPage";
import AdminBlogPage from "./pages/AdminBlogPage";
import AdminBlogEditorPage from "./pages/AdminBlogEditorPage";
import ProtectedRoute from "./components/ProtectedRoute";
import ProjectsLayout from "./components/ProjectsLayout";
import RootLayout from "./components/RootLayout";

// Lazy-loaded: every page here pulls in three.js/@react-three (directly, or
// via engine/loadMesh.ts + engine/renderThumbnail.ts) — a Lighthouse audit
// of the production landing page found the three.js vendor chunk (231KB)
// and most of the main app bundle were 77-82% unused on `/`, because
// nothing on the marketing page actually needs them. Splitting these into
// their own chunks means `/` (and other static-content routes) never
// download this weight at all — only a route that's actually reached pays
// for it. RootLayout.tsx's single <Suspense> boundary covers all of these.
const LiveDiffToolPage = lazy(() => import("./pages/LiveDiffToolPage"));
const CompareStlFilesPage = lazy(() => import("./pages/CompareStlFilesPage"));
const StlDiffToolPage = lazy(() => import("./pages/StlDiffToolPage"));
const Compare3mfFilesPage = lazy(() => import("./pages/Compare3mfFilesPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const VersionDetailPage = lazy(() => import("./pages/VersionDetailPage"));
const CompareVersionsPage = lazy(() => import("./pages/CompareVersionsPage"));
const TeamDashboardPage = lazy(() => import("./pages/TeamDashboardPage"));

/**
 * The landing page (marketing) and the actual interactive diff tool are
 * separate routes — Live Diff stays the unauthenticated entry point
 * (Free tier's only no-signup path — see plan), reached via "/live" links
 * from the landing page rather than embedded inline. Projects routes
 * require a Supabase Auth session (see project memory
 * "auth_provider_supabase_not_clerk") and share the sidebar shell
 * (logo/nav) from ProjectsLayout. Every route is nested under RootLayout
 * so the site-wide footer (SiteFooter) renders on every page, present
 * and future, without each page having to include it itself.
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/features", element: <FeaturesPage /> },
      { path: "/roadmap", element: <RoadmapPage /> },
      { path: "/live", element: <LiveDiffToolPage /> },
      // SEO landing pages — same tool as /live, keyword-specific H1/meta,
      // opened straight into Compare mode (see LiveDiffToolPage.tsx).
      { path: "/compare-stl-files", element: <CompareStlFilesPage /> },
      { path: "/stl-diff-tool", element: <StlDiffToolPage /> },
      { path: "/compare-3mf-files", element: <Compare3mfFilesPage /> },
      // Long-form content/SEO pages (500-800 words each, internal-linked,
      // one CTA back to the tool) — distinct from the thin tool-variant
      // pages above, which open straight into the Compare UI.
      { path: "/stl-diff", element: <StlDiffPage /> },
      { path: "/3mf-diff", element: <ThreeMfDiffPage /> },
      { path: "/obj-diff", element: <ObjDiffPage /> },
      { path: "/3d-print-version-control", element: <VersionControlPage /> },
      { path: "/vs-manual-comparison", element: <VsManualComparisonPage /> },
      { path: "/docs", element: <DocsPage /> },
      { path: "/pricing", element: <PricingPage /> },
      { path: "/blog", element: <BlogIndexPage /> },
      { path: "/blog/:slug", element: <BlogPostPage /> },
      { path: "/embed", element: <EmbedBadgePage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      {
        path: "/projects",
        element: (
          <ProtectedRoute>
            <ProjectsLayout>
              <ProjectsListPage />
            </ProjectsLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: "/projects/:projectId",
        element: (
          <ProtectedRoute>
            <ProjectsLayout>
              <ProjectDetailPage />
            </ProjectsLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: "/projects/:projectId/versions/:versionId",
        element: (
          <ProtectedRoute>
            <ProjectsLayout>
              <VersionDetailPage />
            </ProjectsLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: "/projects/:projectId/compare/:versionAId/:versionBId",
        element: (
          <ProtectedRoute>
            <ProjectsLayout>
              <CompareVersionsPage />
            </ProjectsLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: "/teams/:teamId",
        element: (
          <ProtectedRoute>
            <ProjectsLayout>
              <TeamDashboardPage />
            </ProjectsLayout>
          </ProtectedRoute>
        ),
      },
      {
        // Any logged-in user can reach these routes — enforcement is
        // entirely server-side via requireAdmin.ts; a non-admin gets an
        // in-page 403 from the page component, not a redirect.
        path: "/admin",
        element: (
          <ProtectedRoute>
            <ProjectsLayout>
              <AdminDashboardPage />
            </ProjectsLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: "/admin/users",
        element: (
          <ProtectedRoute>
            <ProjectsLayout>
              <AdminUsersPage />
            </ProjectsLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: "/admin/analytics",
        element: (
          <ProtectedRoute>
            <ProjectsLayout>
              <AdminAnalyticsPage />
            </ProjectsLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: "/admin/blog",
        element: (
          <ProtectedRoute>
            <ProjectsLayout>
              <AdminBlogPage />
            </ProjectsLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: "/admin/blog/:id",
        element: (
          <ProtectedRoute>
            <ProjectsLayout>
              <AdminBlogEditorPage />
            </ProjectsLayout>
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
