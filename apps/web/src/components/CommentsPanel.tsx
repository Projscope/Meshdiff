import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommentSummary } from "../lib/projectsApi";
import CommentStatusBadge from "./CommentStatusBadge";

type Filter = "all" | "open" | "resolved" | "assignedToMe";

interface CommentsPanelProps {
  comments: CommentSummary[];
  isPlacingComment: boolean;
  onTogglePlacing: () => void;
  /** Set once the user has clicked a point on the mesh — the actual text
   * entry happens in PendingCommentPopover, right next to the pin. */
  pendingPosition: [number, number, number] | null;
  onCancelPending: () => void;
  /** Comment whose pin is currently hovered/highlighted, for bidirectional highlight with the 3D pins. */
  highlightedCommentId?: string | null;
  onHoverComment?: (commentId: string | null) => void;
  /** Clicking a row opens (and pins open) that comment's popover on the model, same as clicking its pin directly. */
  onSelectComment?: (commentId: string) => void;
  canDeleteComment?: (comment: CommentSummary) => boolean;
  onRequestDelete?: (comment: CommentSummary) => void;
  canChangeStatus?: (comment: CommentSummary) => boolean;
  onToggleStatus?: (comment: CommentSummary) => void;
  currentUserId?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CommentsPanel({
  comments,
  isPlacingComment,
  onTogglePlacing,
  pendingPosition,
  onCancelPending,
  highlightedCommentId,
  onHoverComment,
  onSelectComment,
  canDeleteComment,
  onRequestDelete,
  canChangeStatus,
  onToggleStatus,
  currentUserId,
}: CommentsPanelProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = comments.filter((comment) => {
    if (filter === "open") return comment.status === "open" || comment.status === "reopened";
    if (filter === "resolved") return comment.status === "resolved";
    if (filter === "assignedToMe") return comment.assigneeUserId === currentUserId;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          {t("comments.title")} <span className="text-ink-600">({comments.length})</span>
        </h3>
        <button
          type="button"
          onClick={onTogglePlacing}
          className={`rounded border px-2 py-0.5 text-[11px] ${
            isPlacingComment
              ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
              : "border-ink-700 text-ink-400 hover:border-ink-500"
          }`}
        >
          {isPlacingComment ? t("comments.clickModel") : t("comments.addComment")}
        </button>
      </div>

      {comments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(["all", "open", "resolved", "assignedToMe"] as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                filter === option ? "bg-indigo-500/20 text-indigo-300" : "text-ink-500 hover:text-ink-300"
              }`}
            >
              {option === "all"
                ? t("comments.filterAll")
                : option === "open"
                  ? t("comments.filterOpen")
                  : option === "resolved"
                    ? t("comments.filterResolved")
                    : t("comments.filterAssignedToMe")}
            </button>
          ))}
        </div>
      )}

      {pendingPosition && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded border border-indigo-800 bg-indigo-950/30 px-2 py-1.5">
          <p className="text-[11px] text-ink-400">{t("comments.typeInBox")}</p>
          <button
            type="button"
            onClick={onCancelPending}
            className="shrink-0 rounded border border-ink-700 px-2 py-1 text-[11px] text-ink-300 hover:border-ink-500"
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-1.5">
        {filtered.length === 0 && !pendingPosition && (
          <p className="text-xs text-ink-600">{t("comments.noCommentsYet")}</p>
        )}
        {filtered.map((comment) => (
          <div
            key={comment.id}
            onMouseEnter={() => onHoverComment?.(comment.id)}
            onMouseLeave={() => onHoverComment?.(null)}
            onClick={() => onSelectComment?.(comment.id)}
            className={`rounded border px-2 py-1.5 transition-colors ${onSelectComment ? "cursor-pointer" : ""} ${
              highlightedCommentId === comment.id
                ? "border-indigo-500 bg-indigo-950/40"
                : "border-ink-800 bg-ink-900"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex min-w-0 items-center gap-1 text-[10px] text-ink-500">
                <span>📍</span>
                <span className="min-w-0 truncate">
                  <span className="font-medium text-ink-400">{comment.authorEmail ?? t("comments.someone")}</span>
                  {" · "}
                  {formatDate(comment.createdAt)}
                </span>
                <CommentStatusBadge status={comment.status} />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canChangeStatus?.(comment) && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleStatus?.(comment);
                    }}
                    className="rounded px-1 text-[10px] text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300"
                  >
                    {comment.status === "resolved" ? t("comments.reopen") : t("comments.resolve")}
                  </button>
                )}
                {canDeleteComment?.(comment) && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequestDelete?.(comment);
                    }}
                    title={t("comments.deleteCommentTooltip")}
                    className="rounded px-1 text-[11px] text-ink-600 hover:bg-red-500/10 hover:text-red-400"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
            <p className="mt-0.5 text-xs text-ink-200">{comment.body}</p>
            {comment.assigneeEmail && (
              <p className="mt-0.5 text-[10px] text-ink-500">
                → <span className="text-ink-400">{comment.assigneeEmail}</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
