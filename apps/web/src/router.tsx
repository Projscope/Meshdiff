import { createBrowserRouter } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import FeaturesPage from "./pages/FeaturesPage";
import LiveDiffToolPage from "./pages/LiveDiffToolPage";
import CompareStlFilesPage from "./pages/CompareStlFilesPage";
import StlDiffToolPage from "./pages/StlDiffToolPage";
import Compare3mfFilesPage from "./pages/Compare3mfFilesPage";
import EmbedBadgePage from "./pages/EmbedBadgePage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import RoadmapPage from "./pages/RoadmapPage";
import ProjectsListPage from "./pages/ProjectsListPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VersionDetailPage from "./pages/VersionDetailPage";
import CompareVersionsPage from "./pages/CompareVersionsPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import ProtectedRoute from "./components/ProtectedRoute";
import ProjectsLayout from "./components/ProjectsLayout";
import RootLayout from "./components/RootLayout";

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
    ],
  },
]);
