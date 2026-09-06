import { useEffect, useState } from "react";

const STORAGE_KEY = "meshdiff_sample_tour_dismissed";
// Same "localStorage + custom event" pattern as shadingMode.ts/showGrid.ts
// — a per-browser preference, kept in sync across anything reading it on
// the current page without relying on localStorage's own cross-tab-only
// "storage" event.
const CHANGE_EVENT = "meshdiff:sample-tour-change";

function readStored(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setTourDismissed(dismissed: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(dismissed));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * Whether the first-login Sample Project walkthrough has already been
 * shown (or explicitly skipped) in this browser — SampleProjectTour.tsx
 * auto-starts once when this is false, then calls setTourDismissed(true).
 * The "Show me around" replay link calls setTourDismissed(false), which
 * this hook picks up via the change event so the tour can restart.
 */
export function useSampleTourDismissed(): [boolean, (dismissed: boolean) => void] {
  const [dismissed, setDismissed] = useState<boolean>(() => readStored());

  useEffect(() => {
    const onChange = () => setDismissed(readStored());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [dismissed, setTourDismissed];
}
