import { BrowserWindow } from "electron";
import type { ProjectSyncStatus } from "../../../../shared/src/desktopBridge";
import { handle } from "../library/ipc";
import type { SyncService } from "./service";

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
  h("sync:signIn", ([email, password]) => service.signIn(email as string, password as string));
  h("sync:signOut", () => service.signOut());
  h("sync:openWebsite", async ([page]) => service.openWebsite(page === "pricing" ? "pricing" : "signup"));

  h("sync:listTeams", () => service.listTeams());
  h("sync:listTeamProjects", ([teamId]) => service.listTeamProjects(teamId as string));
  h("sync:connectProject", ([projectId, teamId]) => service.connectProject(projectId as string, teamId as string));
  h("sync:openTeamProject", ([cloudProjectId, teamId]) => service.openTeamProject(cloudProjectId as string, teamId as string));
  h("sync:disconnectProject", ([projectId]) => service.disconnectProject(projectId as string));

  h("sync:syncProject", ([projectId]) => service.syncProject(projectId as string));
  h("sync:getProjectStatus", ([projectId]) => service.getProjectStatus(projectId as string));
}
