import type { LibraryBridge } from "@meshdiff/shared/localLibrary";

/** The local library, exposed by the Electron preload script. */
export function library(): LibraryBridge {
  const bridge = window.meshdiffDesktop?.library;
  if (!bridge) throw new Error("The local library is only available in the Meshdiff desktop app.");
  return bridge;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
