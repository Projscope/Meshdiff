import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import fs from "node:fs";
import path from "node:path";
import { types } from "node:util";
import type {
  LocalAnalysis,
  LocalCommentStatus,
  LocalVersion,
  NewLocalComment,
} from "../../../../shared/src/localLibrary";
import { LibraryError, LibraryStore, MAX_MODEL_BYTES } from "./store";
import { SyncError } from "../sync/errors";

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

const MODEL_FILTER = { name: "3D models", extensions: ["stl", "obj", "3mf"] };

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  // A copy, so the renderer never receives a view onto Node's shared buffer pool.
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function toBuffer(value: unknown): Buffer {
  if (types.isAnyArrayBuffer(value)) return Buffer.from(value as ArrayBuffer);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new LibraryError("The file's contents were not received.");
}

/** Registers one `library:*` channel. Only our own app:// page may call it, input
 * is validated by the store, and anything unexpected becomes a generic message
 * rather than leaking a stack trace or file path to the renderer. */
export function handle<T>(
  channel: string,
  appOrigin: string,
  run: (event: IpcMainInvokeEvent, args: unknown[]) => Promise<T>,
): void {
  ipcMain.handle(channel, async (event, ...args): Promise<Reply<T>> => {
    try {
      const sender = event.senderFrame?.url ?? "";
      if (!sender.startsWith(`${appOrigin}/`)) throw new LibraryError("Request refused.");
      return { ok: true, data: await run(event, args) };
    } catch (error) {
      // Both carry messages written for the user; anything else is logged, not shown.
      if (error instanceof LibraryError || error instanceof SyncError) return { ok: false, error: error.message };
      console.error(`[library] ${channel} failed:`, error);
      return { ok: false, error: "Something went wrong reading or writing your library." };
    }
  });
}

async function addFile(store: LibraryStore, projectId: string, file: string): Promise<LocalVersion> {
  const name = path.basename(file);
  const stat = await fs.promises.stat(file);
  if (!stat.isFile()) throw new LibraryError(`${name} isn't a file.`);
  if (stat.size > MAX_MODEL_BYTES) {
    throw new LibraryError(`${name} is larger than ${Math.round(MAX_MODEL_BYTES / (1024 * 1024))} MB.`);
  }
  return store.addVersion(projectId, name, await fs.promises.readFile(file));
}

export function registerLibraryIpc(store: LibraryStore, appOrigin: string): void {
  const h = <T>(channel: string, run: (event: IpcMainInvokeEvent, args: unknown[]) => Promise<T>) =>
    handle(channel, appOrigin, run);

  h("library:getInfo", () => store.getInfo());
  h("library:openFolder", async () => {
    await fs.promises.mkdir(store.root, { recursive: true });
    const failure = await shell.openPath(store.root);
    if (failure) throw new LibraryError("Couldn't open the library folder.");
  });
  h("library:listProjects", () => store.listProjects());
  h("library:createProject", (_e, [name]) => store.createProject(name as string));
  h("library:renameProject", (_e, [id, name]) => store.renameProject(id as string, name as string));
  h("library:deleteProject", (_e, [id]) => store.deleteProject(id as string));
  h("library:getProject", (_e, [id]) => store.getProject(id as string));

  h("library:addVersionsFromDialog", async (event, [projectId]) => {
    const options: OpenDialogOptions = {
      title: "Add model versions",
      properties: ["openFile", "multiSelections"],
      filters: [MODEL_FILTER],
    };
    const window = BrowserWindow.fromWebContents(event.sender);
    const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (picked.canceled) return [];
    const added: LocalVersion[] = [];
    for (const file of picked.filePaths) added.push(await addFile(store, projectId as string, file));
    return added;
  });
  h("library:addVersionFromBytes", (_e, [projectId, fileName, bytes]) =>
    store.addVersion(projectId as string, fileName as string, toBuffer(bytes)),
  );
  h("library:readVersionBytes", async (_e, [projectId, versionId]) =>
    toArrayBuffer(await store.readVersionBytes(projectId as string, versionId as string)),
  );
  h("library:saveAnalysis", (_e, [projectId, versionId, analysis]) =>
    store.saveAnalysis(projectId as string, versionId as string, analysis as LocalAnalysis),
  );
  h("library:deleteVersion", (_e, [projectId, versionId]) => store.deleteVersion(projectId as string, versionId as string));

  h("library:addComment", (_e, [projectId, comment]) => store.addComment(projectId as string, comment as NewLocalComment));
  h("library:setCommentStatus", (_e, [projectId, commentId, status]) =>
    store.setCommentStatus(projectId as string, commentId as string, status as LocalCommentStatus),
  );
  h("library:deleteComment", (_e, [projectId, commentId]) => store.deleteComment(projectId as string, commentId as string));
  h("library:attachVersionFile", (_e, [projectId, versionId, bytes]) =>
    store.attachVersionFile(projectId as string, versionId as string, toBuffer(bytes)),
  );
}
