import { useState } from "react";
import { Link } from "react-router-dom";
import type { CloudTeam, ProjectSyncStatus } from "@meshdiff/shared/desktopBridge";
import type { LocalProject } from "@meshdiff/shared/localLibrary";
import ConfirmDialog from "../../components/ConfirmDialog";
import { errorMessage } from "../lib/library";
import { sync, timeAgo, useAccount, useSyncStatus } from "../lib/sync";

const BOX = "mt-4 rounded-lg border border-ink-800 bg-ink-900 px-4 py-3 text-sm";

function statusLine(status: ProjectSyncStatus): { text: string; tone: "ok" | "busy" | "warn" } {
  const waiting = status.pendingVersions + status.pendingComments;
  switch (status.phase) {
    case "syncing":
      return { text: "Syncing…", tone: "busy" };
    case "offline":
    case "signed_out":
    case "team_required":
    case "error":
      return { text: status.message ?? "Couldn't sync.", tone: "warn" };
    default:
      if (waiting > 0) {
        return { text: `${waiting} ${waiting === 1 ? "change" : "changes"} waiting to sync`, tone: "busy" };
      }
      return { text: status.lastSyncAt ? "In sync with your team" : "Ready to sync", tone: "ok" };
  }
}

/**
 * The project page's link to the cloud. Only shown when this build has a cloud
 * configured; a purely local project with nobody signed in just gets a quiet hint.
 */
export default function SyncPanel({ project, onChanged }: { project: LocalProject; onChanged: () => void }) {
  const { account } = useAccount();
  const connected = project.cloud !== undefined;
  const { status, syncNow, syncError } = useSyncStatus(project.id, connected && !!account?.signedIn, onChanged);
  const [teams, setTeams] = useState<CloudTeam[] | null>(null);
  const [teamId, setTeamId] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  if (!account || !account.configured) return null;

  async function run(action: () => Promise<unknown>) {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
    setIsBusy(false);
  }

  async function loadTeams() {
    await run(async () => {
      const list = await sync().listTeams();
      setTeams(list);
      setTeamId(list[0]?.id ?? "");
    });
  }

  // ---- not signed in --------------------------------------------------------
  if (!account.signedIn) {
    return (
      <div data-testid="sync-panel" className={BOX}>
        {connected ? (
          <p>
            Connected to <strong>{project.cloud!.teamName}</strong>. <Link to="/settings" className="text-accent-fg-400 underline">Sign in</Link> to keep syncing.
            Your work stays on this computer meanwhile.
          </p>
        ) : (
          <p className="text-ink-400">
            Working with a team? <Link to="/settings" className="text-accent-fg-400 underline">Sign in</Link> to sync this project and comments with them.
          </p>
        )}
      </div>
    );
  }

  // ---- signed in, but the plan doesn't include syncing --------------------------
  if (account.syncEnabled === false) {
    return (
      <div data-testid="sync-panel" className={BOX}>
        <p>Syncing with teammates is part of the Team plan. Everything else here stays free and works offline.</p>
        <button
          type="button"
          onClick={() => void sync().openWebsite("pricing")}
          className="mt-2 rounded-sm border border-ink-700 px-3 py-1.5 text-xs text-ink-200 hover:border-ink-500"
        >
          See plans
        </button>
      </div>
    );
  }

  // ---- connected ------------------------------------------------------------
  if (connected && status) {
    const line = statusLine(status);
    const toneClass = line.tone === "warn" ? "text-amber-fg-300" : line.tone === "busy" ? "text-ink-300" : "text-emerald-300";
    return (
      <div data-testid="sync-panel" className={BOX}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-500">Syncing with team <strong className="text-ink-300">{project.cloud!.teamName}</strong></p>
            <p data-testid="sync-status" data-phase={status.phase} className={`mt-0.5 ${toneClass}`}>{line.text}</p>
            {status.lastSyncAt && <p className="mt-0.5 text-xs text-ink-500">Last synced {timeAgo(status.lastSyncAt)}</p>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="sync-now"
              disabled={status.phase === "syncing"}
              onClick={() => void syncNow()}
              className="rounded-sm bg-accent-500 px-3 py-1.5 text-xs font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
            >
              {status.phase === "syncing" ? "Syncing…" : "Sync now"}
            </button>
            <button
              type="button"
              data-testid="disconnect"
              onClick={() => setConfirmDisconnect(true)}
              className="rounded-sm border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:border-ink-500"
            >
              Disconnect
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-500">Only stats, comments and a fingerprint of each model go to your team. The model files stay on this computer.</p>
        {(syncError || error) && <p role="alert" className="mt-2 text-xs text-red-300">{syncError ?? error}</p>}
        {confirmDisconnect && (
          <ConfirmDialog
            title="Stop syncing this project?"
            message="Your versions, files and comments stay on this computer and in your team's cloud project. Teammates' versions you only had stats for (no file) are removed from this copy."
            confirmLabel="Disconnect"
            onConfirm={() => {
              setConfirmDisconnect(false);
              void run(() => sync().disconnectProject(project.id));
            }}
            onCancel={() => setConfirmDisconnect(false)}
          />
        )}
      </div>
    );
  }

  // ---- signed in, not connected ---------------------------------------------
  return (
    <div data-testid="sync-panel" className={BOX}>
      {teams === null ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-300">Share this project with your team: sync its versions' stats and comments.</p>
          <button
            type="button"
            data-testid="connect-start"
            disabled={isBusy}
            onClick={() => void loadTeams()}
            className="rounded-sm border border-ink-700 px-3 py-1.5 text-xs text-ink-200 hover:border-ink-500 disabled:opacity-50"
          >
            {isBusy ? "Loading…" : "Connect to a team…"}
          </button>
        </div>
      ) : teams.length === 0 ? (
        <p className="text-ink-300">
          You're not on a team yet. Create one on the website (Team plan), then come back here.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-ink-400">
            Team
            <select
              data-testid="connect-team-select"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              className="mt-1 block rounded-sm border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm text-ink-100"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="connect-team"
            disabled={isBusy || !teamId}
            onClick={() => void run(() => sync().connectProject(project.id, teamId))}
            className="rounded-sm bg-accent-500 px-3 py-1.5 text-xs font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
          >
            {isBusy ? "Connecting…" : "Connect and sync"}
          </button>
          <button type="button" onClick={() => setTeams(null)} className="px-2 py-1.5 text-xs text-ink-400">Cancel</button>
          <p className="basis-full text-xs text-ink-500">
            Your model files are never uploaded. Teammates get the stats, comments and a fingerprint of each file, and can open their own copy.
          </p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
