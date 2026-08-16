import { Outlet, useLocation } from "react-router-dom";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

export default function RootLayout() {
  const location = useLocation();
  // The signed-in dashboard (ProjectsLayout) has its own sidebar with a
  // logo/link, so the marketing site's header and footer would just be
  // redundant chrome there. /admin is also wrapped in ProjectsLayout (see
  // router.tsx) — miss it here and the marketing SiteHeader stacks on top
  // of the dashboard sidebar's own logo/nav.
  const isDashboard = location.pathname.startsWith("/projects") || location.pathname.startsWith("/admin");

  return (
    <div className="flex min-h-screen flex-col">
      {!isDashboard && <SiteHeader />}
      <div className="flex-1">
        <Outlet />
      </div>
      {!isDashboard && <SiteFooter />}
    </div>
  );
}
