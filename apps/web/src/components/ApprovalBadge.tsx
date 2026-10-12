export type ApprovalStatus = "draft" | "in_review" | "changes_requested" | "approved" | "superseded";

interface ApprovalBadgeProps {
  status: ApprovalStatus;
}

const STYLES: Record<ApprovalStatus, string> = {
  draft: "border-ink-700 bg-ink-800 text-ink-400",
  in_review: "border-amber-800 bg-amber-500/10 text-amber-fg-400",
  changes_requested: "border-red-800 bg-red-500/10 text-red-400",
  approved: "border-accent-800 bg-accent-500/10 text-accent-fg-400",
  // Distinguishable from draft only by label — a superseded version is
  // inherently in the past, so it doesn't need its own urgency color.
  superseded: "border-ink-700 bg-ink-800 text-ink-500",
};

// Same semantic colors as STYLES above, as a solid dot fill — kept here
// rather than re-derived at each call site so a status's color can't drift
// between the badge and anything else (e.g. a history timeline's rail dot)
// that needs just the color, not the full badge.
export const APPROVAL_DOT_COLOR: Record<ApprovalStatus, string> = {
  draft: "bg-ink-500",
  in_review: "bg-amber-400",
  changes_requested: "bg-red-400",
  approved: "bg-accent-400",
  superseded: "bg-ink-600",
};

const LABELS: Record<ApprovalStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  changes_requested: "Changes Requested",
  approved: "Approved",
  superseded: "Superseded",
};

export default function ApprovalBadge({ status }: ApprovalBadgeProps) {
  return (
    <span className={`whitespace-nowrap rounded-sm border px-2 py-0.5 text-[11px] font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
