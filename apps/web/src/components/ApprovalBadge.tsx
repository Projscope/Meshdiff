interface ApprovalBadgeProps {
  status: "pending" | "approved";
}

const STYLES: Record<"pending" | "approved", string> = {
  pending: "border-neutral-700 bg-neutral-800 text-neutral-400",
  approved: "border-emerald-800 bg-emerald-500/10 text-emerald-400",
};

const LABELS: Record<"pending" | "approved", string> = {
  pending: "Pending",
  approved: "Approved",
};

export default function ApprovalBadge({ status }: ApprovalBadgeProps) {
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
