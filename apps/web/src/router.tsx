import { createBrowserRouter } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import FeaturesPage from "./pages/FeaturesPage";
import LiveDiffToolPage from "./pages/LiveDiffToolPage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ProjectsListPage from "./pages/ProjectsListPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VersionDetailPage from "./pages/VersionDetailPage";
import CompareVersionsPage from "./pages/CompareVersionsPage";
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
      { path: "/live", element: <LiveDiffToolPage /> },
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
    ],
  },
]);
