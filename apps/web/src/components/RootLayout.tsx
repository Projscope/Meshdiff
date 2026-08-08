import { Outlet, useLocation } from "react-router-dom";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

export default function RootLayout() {
  const location = useLocation();
  // The signed-in dashboard (ProjectsLayout) has its own sidebar with a
  // logo/link, so the marketing site's header and footer would just be
  // redundant chrome there.
  const isDashboard = location.pathname.startsWith("/projects");

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
