import { useCallback, useEffect, useState } from "react";
import type { DesktopInfo, UpdateStatus } from "@meshdiff/shared/desktopBridge";
import type { LibraryInfo } from "@meshdiff/shared/localLibrary";
import CloudAccountSection from "../components/CloudAccountSection";
import { errorMessage, formatBytes, library } from "../lib/library";

function updateText(status: UpdateStatus | null): string {
  if (!status) return "";
  switch (status.state) {
    case "checking":
      return "Checking for updates…";
    case "available":
      return `Version ${status.version ?? ""} is available.`;
    case "downloading":
      return `Downloading version ${status.version ?? ""}… ${Math.round(status.percent ?? 0)}%`;
    case "ready":
      return `Version ${status.version ?? ""} is ready to install.`;
    case "error":
      return "Couldn't check for updates. Check your internet connection and try again.";
    case "unsupported":
      return "Updates are only available in the installed app.";
    default:
      return "You're on the latest version.";
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-ink-800 bg-ink-900 p-4">
      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{title}</h2>
      <div className="mt-3 text-sm text-ink-300">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const bridge = window.meshdiffDesktop;
  const [info, setInfo] = useState<LibraryInfo | null>(null);
  const [app, setApp] = useState<DesktopInfo | null>(null);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInfo = useCallback(async () => {
    try {
      setInfo(await library().getInfo());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadInfo();
    if (!bridge) return;
    void bridge.getInfo().then(setApp);
    void bridge.getUpdateStatus().then(setUpdate);
    return bridge.onUpdateStatus(setUpdate);
  }, [bridge, loadInfo]);

  async function openFolder() {
    try {
      await library().openFolder();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {error && (
        <div role="alert" className="rounded-sm border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      <Section title="Your library">
        {info ? (
          <>
            <p>Projects, versions and comments are stored in this folder on your computer:</p>
            <p data-testid="library-path" className="mt-2 break-all rounded-sm border border-ink-800 bg-ink-950 px-3 py-2 font-mono text-xs text-ink-200">
              {info.path}
            </p>
            <p data-testid="library-usage" className="mt-3">
              {info.projectCount} {info.projectCount === 1 ? "project" : "projects"} · {info.versionCount}{" "}
              {info.versionCount === 1 ? "version" : "versions"} · {info.commentCount}{" "}
              {info.commentCount === 1 ? "comment" : "comments"} · {formatBytes(info.modelBytes)} of model files
            </p>
            {info.unreadableProjects > 0 && (
              <p data-testid="library-unreadable" className="mt-2 rounded-sm bg-amber-500/10 px-3 py-2 text-xs text-amber-fg-300">
                {info.unreadableProjects} {info.unreadableProjects === 1 ? "project folder couldn't" : "project folders couldn't"} be
                read and {info.unreadableProjects === 1 ? "is" : "are"} hidden from your list. Nothing was changed or deleted: you can
                inspect or restore {info.unreadableProjects === 1 ? "it" : "them"} from the folder. Model files aren't cleaned up while a project can't be read.
              </p>
            )}
            <button
              type="button"
              data-testid="open-library-folder"
              onClick={() => void openFolder()}
              className="mt-4 rounded-sm border border-ink-700 px-3 py-2 text-sm text-ink-200 hover:border-ink-500"
            >
              Open folder
            </button>
          </>
        ) : (
          !error && <p className="text-ink-500">Loading…</p>
        )}
      </Section>

      <Section title="Team sync">
        <CloudAccountSection />
      </Section>

      <Section title="Updates">
        <p data-testid="update-text">{updateText(update)}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            data-testid="check-updates"
            disabled={!bridge || update?.state === "unsupported" || update?.state === "checking" || update?.state === "downloading"}
            onClick={() => void bridge?.checkForUpdates().then(setUpdate)}
            className="rounded-sm border border-ink-700 px-3 py-2 text-sm text-ink-200 hover:border-ink-500 disabled:opacity-40"
          >
            Check for updates
          </button>
          {update?.state === "ready" && bridge && (
            <button
              type="button"
              onClick={() => void bridge.installUpdate()}
              className="rounded-sm bg-accent-500 px-3 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400"
            >
              Restart to update
            </button>
          )}
        </div>
      </Section>

      <Section title="Privacy">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your model files never leave this computer, even when you sync.</li>
          <li>Nothing is sent anywhere unless you sign in and connect a project to a team. Then your team's cloud project receives only: each version's file name and size, a SHA-256 fingerprint of the file, the analysis results (stats and printability), and your comments.</li>
          <li>The app's window cannot make network requests at all. Only the app's background process talks to Meshdiff (when you sign in or sync) and to GitHub (to check for updates).</li>
        </ul>
      </Section>

      <Section title="About">
        {app ? (
          <p data-testid="about-text">
            Meshdiff Desktop {app.appVersion} · Electron {app.electronVersion} · {app.platform}
          </p>
        ) : (
          <p className="text-ink-500">Loading…</p>
        )}
      </Section>
    </div>
  );
}
