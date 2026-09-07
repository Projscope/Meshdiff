import { useEffect, useState } from "react";

// The walkthrough spans two components across two pages (SampleProjectTour
// on ProjectDetailPage, then SampleCompareTour on the diff screen) — shared
// here so both can render one continuous "X of 7" counter instead of each
// restarting its own "X of N".
export const PROJECT_TOUR_STEP_COUNT = 5;
export const COMPARE_TOUR_STEP_COUNT = 4;
export const TOTAL_TOUR_STEPS = PROJECT_TOUR_STEP_COUNT + COMPARE_TOUR_STEP_COUNT;

const STORAGE_KEY = "meshdiff_sample_tour_stage";
// Same "localStorage + custom event" pattern as shadingMode.ts/showGrid.ts
// — a per-browser preference, kept in sync across anything reading it on
// the current page without relying on localStorage's own cross-tab-only
// "storage" event.
const CHANGE_EVENT = "meshdiff:sample-tour-change";

/**
 * "unseen" — never shown, or replaying: SampleProjectTour auto-starts.
 * "compare" — the project-page tour's last step was followed through to a
 * real diff instead of Skip/Done; SampleCompareTour picks up there.
 * "done" — fully finished (or skipped) on either leg; nothing auto-starts.
 */
export type SampleTourStage = "unseen" | "compare" | "done";

function readStage(): SampleTourStage {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "compare" || raw === "done" ? raw : "unseen";
}

function writeStage(stage: SampleTourStage): void {
  localStorage.setItem(STORAGE_KEY, stage);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Ends the walkthrough outright (Skip/Done on either leg), or — passed
 * `false` — resets it for a replay via "Show me around". */
export function setTourDismissed(dismissed: boolean): void {
  writeStage(dismissed ? "done" : "unseen");
}

/** Hands the walkthrough off from the project-page tour to
 * SampleCompareTour.tsx, called only when the last step's own diff link is
 * followed (see ProjectDetailPage.tsx) rather than Skip/Done. */
export function setTourAwaitingCompare(): void {
  writeStage("compare");
}

/** Non-hook read for one-off checks (e.g. inside an onClick) where a
 * component re-render isn't needed. */
export function getSampleTourStage(): SampleTourStage {
  return readStage();
}

export function useSampleTourStage(): [SampleTourStage, (dismissed: boolean) => void] {
  const [stage, setStage] = useState<SampleTourStage>(() => readStage());

  useEffect(() => {
    const onChange = () => setStage(readStage());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [stage, setTourDismissed];
}

/** Convenience for call sites that only care whether the project-page tour
 * should stay hidden — true for both "compare" (handed off) and "done". */
export function useSampleTourDismissed(): [boolean, (dismissed: boolean) => void] {
  const [stage, setDismissed] = useSampleTourStage();
  return [stage !== "unseen", setDismissed];
}
