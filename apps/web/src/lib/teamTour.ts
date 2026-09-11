import { useEffect, useState } from "react";

// Same "localStorage + custom event" pattern as sampleProjectTour.ts — a
// per-browser stage, kept in sync across anything reading it on the
// current page without relying on localStorage's own cross-tab-only
// "storage" event.
const STORAGE_KEY = "meshdiff_team_tour_stage";
const CHANGE_EVENT = "meshdiff:team-tour-change";

/**
 * "unseen" — never started. Set to "awaiting-team" the first time a
 * trialing user picks "Team" in TrialTierChoiceModal.tsx (never restarted
 * on a later re-pick, so this only ever runs once).
 * "awaiting-team" — TeamCreateSpotlight.tsx points at the sidebar's "New
 * team" button; advances once a team is actually created (see
 * ProjectsLayout.tsx's onCreated callback), not on a timer or a "Next".
 * "dashboard" — TeamDashboardTour.tsx walks through the new team's
 * members/invite/roles/pending-approvals sections.
 * "done" — fully finished (or skipped) — nothing auto-starts again. Once
 * here, the existing Sample Project walkthrough (sampleProjectTour.ts) is
 * left to run entirely on its own — this stage machine doesn't know or
 * care about it.
 */
export type TeamTourStage = "unseen" | "awaiting-team" | "dashboard" | "done";

function readStage(): TeamTourStage {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "awaiting-team" || raw === "dashboard" || raw === "done" ? raw : "unseen";
}

export function setTeamTourStage(stage: TeamTourStage): void {
  localStorage.setItem(STORAGE_KEY, stage);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Non-hook read for one-off checks (e.g. inside an onClick or another
 * component's success callback) where a re-render isn't needed. */
export function getTeamTourStage(): TeamTourStage {
  return readStage();
}

/** True while the team-creation/roles tour is actively in progress —
 * lets the (independent, unaware-of-this-tour) Sample Project walkthrough
 * hold off on auto-starting so the two don't render coach-marks over each
 * other at once. */
export function isTeamTourActive(stage: TeamTourStage): boolean {
  return stage === "awaiting-team" || stage === "dashboard";
}

export function useTeamTourStage(): [TeamTourStage, (stage: TeamTourStage) => void] {
  const [stage, setStage] = useState<TeamTourStage>(() => readStage());

  useEffect(() => {
    const onChange = () => setStage(readStage());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [stage, setTeamTourStage];
}
