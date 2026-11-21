import { useEffect, useState } from "react";
import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import type { DesktopInfo, UpdateStatus } from "@meshdiff/shared/desktopBridge";
import ErrorBoundary from "./ErrorBoundary";
import ComparePage from "./pages/ComparePage";
import LibraryPage from "./pages/LibraryPage";
import ProjectPage from "./pages/ProjectPage";
import QuickViewPage from "./pages/QuickViewPage";
import SettingsPage from "./pages/SettingsPage";
import VersionPage from "./pages/VersionPage";

function updateLabel(status: UpdateStatus | null): string {
  if (!status) return "";
  switch (status.state) {
    case "checking":
      return "Checking for updates…";
    case "available":
      return `Update ${status.version ?? ""} found`;
    case "downloading":
      return `Downloading update… ${Math.round(status.percent ?? 0)}%`;
    case "ready":
      return `Update ${status.version ?? ""} ready`;
    case "error":
      return "Update check failed";
    case "unsupported":
      return "Updates are off in this build";
    default:
      return "Up to date";
  }
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2 py-1 text-xs ${isActive ? "bg-ink-800 text-ink-50" : "text-ink-400 hover:text-ink-200"}`;

/** The routed pages, wrapped so a page that fails to render shows a recovery screen instead of a blank window. */
function Pages() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/quick" element={<QuickViewPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/p/:projectId" element={<ProjectPage />} />
        <Route path="/p/:projectId/v/:versionId" element={<VersionPage />} />
        <Route path="/p/:projectId/compare/:aId/:bId" element={<ComparePage />} />
        <Route path="*" element={<LibraryPage />} />
      </Routes>
    </ErrorBoundary>
  );
}

/** The desktop shell: a local-first client. Projects live on this computer; the
 * renderer has no network access (see the CSP in apps/desktop/src/main/index.ts). */
export default function DesktopApp() {
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const bridge = window.meshdiffDesktop;

  useEffect(() => {
    if (!bridge) return;
    void bridge.getInfo().then(setInfo);
    void bridge.getUpdateStatus().then(setUpdate);
    return bridge.onUpdateStatus(setUpdate);
  }, [bridge]);

  return (
    <HashRouter>
      <div className="flex h-screen flex-col bg-ink-950 text-ink-50">
        <header className="flex items-center justify-between border-b border-ink-800 px-4 py-2 text-sm">
          <div className="flex items-center gap-4">
            <span className="font-semibold">Meshdiff</span>
            <nav className="flex gap-1">
              <NavLink to="/" end className={navClass}>Projects</NavLink>
              <NavLink to="/quick" className={navClass}>Quick view</NavLink>
              <NavLink to="/settings" className={navClass}>Settings</NavLink>
            </nav>
            {info && (
              <span data-testid="app-info" className="text-xs text-ink-500">
                v{info.appVersion} · {info.platform}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span data-testid="update-status">{updateLabel(update)}</span>
            {update?.state === "ready" && bridge && (
              <button
                type="button"
                onClick={() => void bridge.installUpdate()}
                className="rounded bg-accent-500 px-2 py-1 font-medium text-chrome-950 hover:bg-accent-400"
              >
                Restart to update
              </button>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <Pages />
        </main>
      </div>
    </HashRouter>
  );
}
