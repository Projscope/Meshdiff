import { useTranslation } from "react-i18next";
import type { ApprovalStatus } from "./ApprovalBadge";
import type { GateStatus } from "../lib/projectsApi";

interface VersionActionButtonsProps {
  status: ApprovalStatus;
  canTransition: boolean;
  onApprove: () => void;
  onRequestChanges: () => void;
  /** null on non-team projects — gates don't apply there, Approve is never
   * blocked by them. */
  gateStatus?: GateStatus | null;
}

// Shared by the timeline row and the "All Versions" row — both showed
// approve/request-changes buttons with the same visibility rules, and kept
// drifting out of sync as the state machine grew from 3 states to 5.
export default function VersionActionButtons({
  status,
  canTransition,
  onApprove,
  onRequestChanges,
  gateStatus,
}: VersionActionButtonsProps) {
  const { t } = useTranslation();
  if (!canTransition) return null;

  // A version can move to approved from in_review or changes_requested, and
  // to changes_requested from in_review or approved (a reviewer changing
  // their mind) — draft and superseded are terminal-ish here: draft isn't
  // reachable from these buttons at all (submit-for-review is a separate
  // action), and superseded is a one-way server-side transition with no
  // manual button.
  const showApprove = status === "in_review" || status === "changes_requested";
  const showRequestChanges = status === "in_review" || status === "approved";
  // Mirrors the server's 403 check in versions.ts's approve handler — shown
  // as a disabled button with a tooltip here so the reviewer sees why
  // before clicking, rather than only after a failed request.
  const gatesUnmet = !!gateStatus && gateStatus.satisfiedCount < gateStatus.totalCount;

  return (
    <>
      {showApprove && (
        <button
          type="button"
          onClick={onApprove}
          disabled={gatesUnmet}
          title={gatesUnmet ? t("approvalGates.blocksApproveTooltip") : ""}
          className="shrink-0 rounded border border-accent-700 px-2.5 py-1 text-xs text-accent-400 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-accent-700"
        >
          {t("projectDetail.approve")}
        </button>
      )}
      {showRequestChanges && (
        <button
          type="button"
          onClick={onRequestChanges}
          className="shrink-0 rounded border border-red-800 px-2.5 py-1 text-xs text-red-400 hover:border-red-600"
        >
          {t("projectDetail.reject")}
        </button>
      )}
    </>
  );
}
