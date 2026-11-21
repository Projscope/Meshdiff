import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudAccount, ProjectSyncStatus, SyncBridge } from "@meshdiff/shared/desktopBridge";
import { errorMessage } from "./library";

/** The cloud account and Team sync, exposed by the Electron preload script. */
export function sync(): SyncBridge {
  const bridge = window.meshdiffDesktop?.sync;
  if (!bridge) throw new Error("Syncing is only available in the Meshdiff desktop app.");
  return bridge;
}

export interface UseAccount {
  /** null until first loaded. */
  account: CloudAccount | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAccount(): UseAccount {
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await sync().getAccount();
      if (mounted.current) {
        setAccount(next);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { account, error, refresh };
}

export interface UseSyncStatus {
  status: ProjectSyncStatus | null;
  /** Runs a sync now. Resolves with the outcome; never rejects for expected problems (offline etc). */
  syncNow: () => Promise<void>;
  syncError: string | null;
}

/**
 * The live sync status of one project. `onChanged` is called when a sync has brought
 * something new in (or finished), so the page can reload the project from disk.
 */
export function useSyncStatus(projectId: string, enabled: boolean, onChanged?: () => void): UseSyncStatus {
  const [status, setStatus] = useState<ProjectSyncStatus | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void sync()
      .getProjectStatus(projectId)
      .then((s) => {
        if (cancelled) return;
        lastSeen.current = s.lastSyncAt;
        setStatus(s);
      })
      .catch((e) => !cancelled && setSyncError(errorMessage(e)));
    const unsubscribe = sync().onStatus((id, next) => {
      if (id !== projectId || cancelled) return;
      setStatus(next);
      // A finished sync stamps lastSyncAt; that is the cue to reload what it pulled in.
      if (next.lastSyncAt !== lastSeen.current && next.phase !== "syncing") {
        lastSeen.current = next.lastSyncAt;
        onChangedRef.current?.();
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId, enabled]);

  const syncNow = useCallback(async () => {
    setSyncError(null);
    try {
      setStatus(await sync().syncProject(projectId));
      onChangedRef.current?.();
    } catch (e) {
      setSyncError(errorMessage(e));
    }
  }, [projectId]);

  return { status, syncNow, syncError };
}

/** "2 minutes ago", "yesterday"... for the "last synced" line. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
