interface PrintabilityBadgeProps {
  status: "pass" | "warn" | "fail" | null;
}

const LABELS: Record<"pass" | "warn" | "fail", string> = {
  pass: "Printable",
  warn: "Warn",
  fail: "Fail",
};

const STYLES: Record<"pass" | "warn" | "fail", string> = {
  pass: "bg-emerald-500/10 text-emerald-400 border-emerald-800",
  warn: "bg-amber-500/10 text-amber-400 border-amber-800",
  fail: "bg-red-500/10 text-red-400 border-red-800",
};

export default function PrintabilityBadge({ status }: PrintabilityBadgeProps) {
  if (!status) {
    return (
      <span className="rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400">
        Pending
      </span>
    );
  }
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
