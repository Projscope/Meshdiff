import { useEffect, useState } from "react";

const STORAGE_KEY = "meshdiff_trial_tier_modal_dismissed";
// Same "localStorage + custom event" pattern as shadingMode.ts — a
// per-browser flag, kept in sync across anything reading it on the current
// page without relying on localStorage's own cross-tab-only "storage"
// event.
const CHANGE_EVENT = "meshdiff:trial-tier-modal-change";

function readDismissed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setTrialTierModalDismissed(dismissed: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(dismissed));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Whether the trial tier-choice modal (TrialTierChoiceModal.tsx) has
 * already auto-shown once — the "switch tier" control can still reopen it
 * anytime regardless of this flag. */
export function useTrialTierModalDismissed(): [boolean, (dismissed: boolean) => void] {
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());

  useEffect(() => {
    const onChange = () => setDismissed(readDismissed());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [dismissed, setTrialTierModalDismissed];
}
