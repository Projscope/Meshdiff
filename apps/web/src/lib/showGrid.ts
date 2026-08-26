import { useEffect, useState } from "react";

const STORAGE_KEY = "meshdiff_show_grid";
// Same "localStorage + custom event" pattern as shadingMode.ts/controlScheme.ts
// — a single global preference, kept in sync across every viewer on the
// page without needing localStorage's own cross-tab-only "storage" event.
const CHANGE_EVENT = "meshdiff:show-grid-change";

function readStored(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

export function setShowGrid(show: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(show));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * Whether the ground grid (the model's "base") renders under the model,
 * shared across every viewer (and persisted across visits) — same pattern
 * as useShadingMode(). Defaults to on, matching the app's existing
 * always-on-grid behavior before this preference existed.
 */
export function useShowGrid(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState<boolean>(() => readStored());

  useEffect(() => {
    const onChange = () => setShow(readStored());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [show, setShowGrid];
}
