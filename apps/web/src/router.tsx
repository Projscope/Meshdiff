import { createBrowserRouter } from "react-router-dom";
import LiveDiffPage from "./pages/LiveDiffPage";
import LoginPage from "./pages/LoginPage";
import ProjectsListPage from "./pages/ProjectsListPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VersionDetailPage from "./pages/VersionDetailPage";
import ProtectedRoute from "./components/ProtectedRoute";

/**
 * Live Diff stays the unauthenticated entry point (Free tier's only
 * no-signup path — see plan). Projects routes require a Supabase Auth
 * session (see project memory "auth_provider_supabase_not_clerk").
 */
export const router = createBrowserRouter([
  { path: "/", element: <LiveDiffPage /> },
  { path: "/live", element: <LiveDiffPage /> },
  { path: "/login", element: <LoginPage /> },
  {
    path: "/projects",
    element: (
      <ProtectedRoute>
        <ProjectsListPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/projects/:projectId",
    element: (
      <ProtectedRoute>
        <ProjectDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/projects/:projectId/versions/:versionId",
    element: (
      <ProtectedRoute>
        <VersionDetailPage />
      </ProtectedRoute>
    ),
  },
]);
