import { BrowserWindow } from "electron";
import type { ProjectSyncStatus } from "../../../../shared/src/desktopBridge";
import { handle } from "../library/ipc";
import { LibraryError } from "../library/store";
import type { SyncService } from "./service";

/** An argument from the renderer, which is untrusted: it must be a string of sensible length. */
export function text(value: unknown, max = 500): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) throw new LibraryError("That request wasn't valid.");
  return value;
}

/** A sync status changed: tell every open window. */
export function broadcastStatus(projectId: string, status: ProjectSyncStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("sync:status", projectId, status);
  }
}

/** Registers the `sync:*` channels. Same rules as the library's: only our own page may
 * call them, and failures reach the renderer as plain messages. */
export function registerSyncIpc(service: SyncService, appOrigin: string): void {
  const h = <T>(channel: string, run: (args: unknown[]) => Promise<T>) => handle(channel, appOrigin, (_event, args) => run(args));

  h("sync:getAccount", () => service.getAccount());
  h("sync:signIn", ([email, password]) => service.signIn(text(email, 320), text(password, 1000)));
  h("sync:signOut", () => service.signOut());
  h("sync:openWebsite", async ([page]) => service.openWebsite(page === "pricing" ? "pricing" : "signup"));

  h("sync:listTeams", () => service.listTeams());
  h("sync:listTeamProjects", ([teamId]) => service.listTeamProjects(text(teamId, 100)));
  h("sync:connectProject", ([projectId, teamId]) => service.connectProject(text(projectId, 100), text(teamId, 100)));
  h("sync:openTeamProject", ([cloudProjectId, teamId]) => service.openTeamProject(text(cloudProjectId, 100), text(teamId, 100)));
  h("sync:disconnectProject", ([projectId]) => service.disconnectProject(text(projectId, 100)));

  h("sync:syncProject", ([projectId]) => service.syncProject(text(projectId, 100)));
  h("sync:getProjectStatus", ([projectId]) => service.getProjectStatus(text(projectId, 100)));
}
