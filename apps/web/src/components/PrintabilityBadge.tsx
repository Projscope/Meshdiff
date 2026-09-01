import { useTranslation } from "react-i18next";

interface PrintabilityBadgeProps {
  status: "pass" | "warn" | "fail" | null;
}

const STYLES: Record<"pass" | "warn" | "fail", string> = {
  pass: "bg-accent-500/10 text-accent-400 border-accent-800",
  warn: "bg-amber-500/10 text-amber-400 border-amber-800",
  fail: "bg-red-500/10 text-red-400 border-red-800",
};

export default function PrintabilityBadge({ status }: PrintabilityBadgeProps) {
  const { t } = useTranslation();
  const labels: Record<"pass" | "warn" | "fail", string> = {
    pass: t("printabilityBadge.printable"),
    warn: t("printabilityBadge.warn"),
    fail: t("printabilityBadge.fail"),
  };
  if (!status) {
    return (
      <span className="rounded border border-ink-700 bg-ink-800 px-2 py-0.5 text-[11px] text-ink-400">
        {t("printabilityBadge.pending")}
      </span>
    );
  }
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${STYLES[status]}`}>
      {labels[status]}
    </span>
  );
}
