import { useTranslation } from "react-i18next";
import type { CommentStatus } from "../lib/projectsApi";

const STYLES: Record<CommentStatus, string> = {
  open: "border-ink-700 bg-ink-800 text-ink-400",
  resolved: "border-accent-800 bg-accent-500/10 text-accent-fg-400",
  // Distinct from open — a reopened thread was previously resolved and
  // needs attention again, which is a different signal than "never looked
  // at" (open).
  reopened: "border-amber-800 bg-amber-500/10 text-amber-fg-400",
};

// Separate state set/semantics from ApprovalBadge (a comment's lifecycle is
// independent of a version's review state), so kept as its own component
// rather than reusing ApprovalBadge's Record.
export default function CommentStatusBadge({ status }: { status: CommentStatus }) {
  const { t } = useTranslation();
  const labels: Record<CommentStatus, string> = {
    open: t("comments.statusOpen"),
    resolved: t("comments.statusResolved"),
    reopened: t("comments.statusReopened"),
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${STYLES[status]}`}>
      {labels[status]}
    </span>
  );
}
