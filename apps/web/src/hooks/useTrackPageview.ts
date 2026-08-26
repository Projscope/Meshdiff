import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageview } from "../lib/analytics";

/** Fires the self-hosted pageview beacon on initial mount AND on every
 * client-side route change — unlike the existing GA setup (initAnalytics()
 * in main.tsx), which only ever tracks the very first document load, since
 * React Router navigation never triggers a fresh page load for it to hook
 * into. Mount this once near the router root (see RootLayout.tsx). */
export function useTrackPageview(): void {
  const location = useLocation();

  useEffect(() => {
    // Admin's own navigation around /admin/* isn't real site traffic — it'd
    // otherwise pollute the visitor/pageview stats the dashboard is meant
    // to report on with the admin's own repeated visits. /projects/* is
    // the signed-in app itself (project/version IDs in the URL, not public
    // marketing/content pages) — not meaningful "which page did visitors
    // read" analytics, and every distinct project ID would otherwise show
    // up as its own noisy Top Pages row.
    if (location.pathname.startsWith("/admin") || location.pathname.startsWith("/projects")) return;

    trackPageview();
    // Deliberately keyed on pathname only, not the full location object —
    // a query-string-only change (e.g. a filter param) isn't a new "page"
    // for this purpose.
  }, [location.pathname]);
}
