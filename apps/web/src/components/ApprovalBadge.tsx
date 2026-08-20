export type ApprovalStatus = "pending" | "approved" | "rejected";

interface ApprovalBadgeProps {
  status: ApprovalStatus;
}

const STYLES: Record<ApprovalStatus, string> = {
  pending: "border-ink-700 bg-ink-800 text-ink-400",
  approved: "border-accent-800 bg-accent-500/10 text-accent-400",
  rejected: "border-red-800 bg-red-500/10 text-red-400",
};

// Same semantic colors as STYLES above, as a solid dot fill — kept here
// rather than re-derived at each call site so a status's color can't drift
// between the badge and anything else (e.g. a history timeline's rail dot)
// that needs just the color, not the full badge.
export const APPROVAL_DOT_COLOR: Record<ApprovalStatus, string> = {
  pending: "bg-ink-500",
  approved: "bg-accent-400",
  rejected: "bg-red-400",
};

const LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export default function ApprovalBadge({ status }: ApprovalBadgeProps) {
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
