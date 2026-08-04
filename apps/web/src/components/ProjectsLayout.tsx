import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isProjectsActive = location.pathname.startsWith("/projects");

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800">
        <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-500/20 text-indigo-400">
            ◈
          </div>
          <div>
            <div className="text-sm font-bold text-white">PartTree</div>
            <div className="text-[11px] text-neutral-500">3D Diff &amp; Review</div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3">
          <Link
            to="/projects"
            className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${
              isProjectsActive
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            }`}
          >
            🗂 Projects
          </Link>
        </nav>

        <div className="border-t border-neutral-800 px-4 py-3 text-[11px] text-neutral-600">
          FDM Print Pipeline · v0.1
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
