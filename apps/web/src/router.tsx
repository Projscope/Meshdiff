import { createBrowserRouter } from "react-router-dom";
import LiveDiffPage from "./pages/LiveDiffPage";
import ProjectsListPage from "./pages/ProjectsListPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VersionDetailPage from "./pages/VersionDetailPage";

/**
 * Live Diff stays the unauthenticated entry point (Free tier's only
 * no-signup path — see plan). Projects routes are unguarded for now;
 * Clerk gating is a later phase.
 */
export const router = createBrowserRouter([
  { path: "/", element: <LiveDiffPage /> },
  { path: "/live", element: <LiveDiffPage /> },
  { path: "/projects", element: <ProjectsListPage /> },
  { path: "/projects/:projectId", element: <ProjectDetailPage /> },
  { path: "/projects/:projectId/versions/:versionId", element: <VersionDetailPage /> },
]);
