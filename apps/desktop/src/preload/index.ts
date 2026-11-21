import { contextBridge, ipcRenderer } from "electron";
import type { MeshdiffDesktopBridge, UpdateStatus } from "../../../shared/src/desktopBridge";
import type { LibraryBridge } from "../../../shared/src/localLibrary";

// The only surface the renderer gets. Everything goes through named IPC
// channels the main process explicitly handles; no Node, no `ipcRenderer`.

/** Library calls reply `{ ok, data | error }`; turn a failure back into a normal
 * rejected promise carrying just the user-readable message. */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const reply = (await ipcRenderer.invoke(channel, ...args)) as { ok: true; data: T } | { ok: false; error: string };
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}

const library: LibraryBridge = {
  listProjects: () => call("library:listProjects"),
  createProject: (name) => call("library:createProject", name),
  renameProject: (projectId, name) => call("library:renameProject", projectId, name),
  deleteProject: (projectId) => call("library:deleteProject", projectId),
  getProject: (projectId) => call("library:getProject", projectId),
  addVersionsFromDialog: (projectId) => call("library:addVersionsFromDialog", projectId),
  addVersionFromBytes: (projectId, fileName, bytes) => call("library:addVersionFromBytes", projectId, fileName, bytes),
  readVersionBytes: (projectId, versionId) => call("library:readVersionBytes", projectId, versionId),
  saveAnalysis: (projectId, versionId, analysis) => call("library:saveAnalysis", projectId, versionId, analysis),
  deleteVersion: (projectId, versionId) => call("library:deleteVersion", projectId, versionId),
  addComment: (projectId, comment) => call("library:addComment", projectId, comment),
  setCommentStatus: (projectId, commentId, status) => call("library:setCommentStatus", projectId, commentId, status),
  deleteComment: (projectId, commentId) => call("library:deleteComment", projectId, commentId),
};

const bridge: MeshdiffDesktopBridge = {
  library,
  getInfo: () => ipcRenderer.invoke("desktop:getInfo"),
  getUpdateStatus: () => ipcRenderer.invoke("desktop:getUpdateStatus"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:checkForUpdates"),
  installUpdate: () => ipcRenderer.invoke("desktop:installUpdate"),
  onUpdateStatus(callback) {
    const listener = (_event: unknown, status: UpdateStatus) => callback(status);
    ipcRenderer.on("desktop:update-status", listener);
    return () => {
      ipcRenderer.removeListener("desktop:update-status", listener);
    };
  },
};

contextBridge.exposeInMainWorld("meshdiffDesktop", bridge);
