import { useState } from "react";
import { Html } from "@react-three/drei";
import { useTranslation } from "react-i18next";
import type { CommentSummary } from "../lib/projectsApi";
import CommentStatusBadge from "./CommentStatusBadge";
import MentionAutocomplete from "./MentionAutocomplete";

interface ProjectMember {
  userId: string;
  email: string | null;
}

interface CommentPopoverProps {
  comment: CommentSummary;
  replies: CommentSummary[];
  members: ProjectMember[];
  onClose: () => void;
  canDelete: (comment: CommentSummary) => boolean;
  /** Author, current assignee, or a moderator — mirrors the API's own
   * status-change authorization (see comments.ts's PATCH handler). */
  canChangeStatus: (comment: CommentSummary) => boolean;
  onDelete: (comment: CommentSummary) => void;
  onToggleStatus: (comment: CommentSummary) => void;
  onReply: (body: string) => Promise<void>;
  /** The specific comment or reply a notification deep-link pointed at (see
   * VersionDetailPage's `?comment=` handling) — flagged with an accent
   * border/background so "where was I mentioned" is answered by more than
   * just the popover being open, since a thread can hold several messages. */
  linkedCommentId?: string | null;
}

// The popover is narrow and often shows two or three of these on one line
// (author, assignee) — the local part alone ("jviaches") is enough to
// recognize who's who without eating half the width on "@gmail.com".
function emailLocalPart(email: string): string {
  return email.split("@")[0]!;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CommentEntry({
  comment,
  canDelete,
  canChangeStatus,
  onDelete,
  onToggleStatus,
  highlighted,
}: {
  comment: CommentSummary;
  canDelete: boolean;
  canChangeStatus: boolean;
  onDelete: () => void;
  onToggleStatus: () => void;
  highlighted?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={
        highlighted ? "-mx-1.5 rounded-sm border-l-2 border-accent-500 bg-accent-500/10 py-1 pl-2 pr-1.5" : undefined
      }
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 truncate text-[10px] text-ink-500">
          <span className="font-medium text-ink-400">
            {comment.authorEmail ? emailLocalPart(comment.authorEmail) : t("comments.someone")}
          </span>
          {" · "}
          {formatDate(comment.createdAt)}
        </span>
        <CommentStatusBadge status={comment.status} />
      </div>
      <p className="mt-0.5 whitespace-pre-wrap wrap-break-word text-xs text-ink-100">{comment.body}</p>
      {comment.assigneeEmail && (
        <p className="mt-0.5 text-[10px] text-ink-500">
          → <span className="text-ink-400">{emailLocalPart(comment.assigneeEmail)}</span>
        </p>
      )}
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3">
          {canChangeStatus && (
            <button type="button" onClick={onToggleStatus} className="text-indigo-400 hover:text-indigo-300">
              {comment.status === "resolved" ? t("comments.reopen") : t("comments.resolve")}
            </button>
          )}
        </div>
        {canDelete && (
          <button type="button" onClick={onDelete} className="text-red-400 hover:text-red-300">
            {t("comments.delete")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Anchored at the comment's own 3D position — no `center` prop here (unlike
 * CommentPin) since the translate below already places it to the left of
 * the pin with a 12px gap, vertically centered on it. */
export default function CommentPopover({
  comment,
  replies,
  members,
  onClose,
  canDelete,
  canChangeStatus,
  onDelete,
  onToggleStatus,
  onReply,
  linkedCommentId,
}: CommentPopoverProps) {
  const { t } = useTranslation();
  const isTopCommentLinked = linkedCommentId === comment.id;
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const mentionMatch = /@([\w.]*)$/.exec(replyText);

  async function handleSubmitReply(event: React.FormEvent) {
    event.preventDefault();
    if (!replyText.trim()) return;
    setIsSubmittingReply(true);
    await onReply(replyText.trim());
    setIsSubmittingReply(false);
    setReplyText("");
    setIsReplying(false);
  }

  function handleSelectMention(email: string) {
    if (!mentionMatch) return;
    setReplyText(replyText.slice(0, replyText.length - mentionMatch[0].length) + `@${email} `);
  }

  // No distanceFactor on the Html below — this should stay a fixed,
  // readable size on screen regardless of camera zoom, not shrink along
  // with the model.
  return (
    <Html position={comment.position} occlude={false} zIndexRange={[100, 0]}>
      <div
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        className={`relative flex w-80 max-w-[90vw] -translate-x-[calc(100%+12px)] -translate-y-1/2 flex-col gap-2 rounded-lg border bg-ink-900 p-2.5 shadow-xl ${
          isTopCommentLinked ? "border-accent-500 ring-1 ring-accent-500/50" : "border-ink-700"
        }`}
      >
        {/* Close stays alone in the top-right corner, well clear of the
            per-comment Delete links below — those live next to Reply
            instead, away from where the pin sits. */}
        <button
          type="button"
          onClick={onClose}
          title={t("viewer.closeTooltip")}
          className="absolute right-1.5 top-1.5 rounded-sm px-1 text-xs leading-none text-ink-500 hover:text-ink-200"
        >
          ✕
        </button>

        <div
          className={`pr-5 ${
            isTopCommentLinked ? "-mx-1.5 rounded-sm border-l-2 border-accent-500 bg-accent-500/10 py-1 pl-2 pr-4" : ""
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[10px] text-ink-500">
              <span className="font-medium text-ink-400">
                {comment.authorEmail ? emailLocalPart(comment.authorEmail) : t("comments.someone")}
              </span>
              {" · "}
              {formatDate(comment.createdAt)}
            </span>
            <CommentStatusBadge status={comment.status} />
          </div>
          <p className="mt-0.5 whitespace-pre-wrap wrap-break-word text-xs text-ink-100">{comment.body}</p>
          {comment.assigneeEmail && (
            <p className="mt-0.5 text-[10px] text-ink-500">
              → <span className="text-ink-400">{emailLocalPart(comment.assigneeEmail)}</span>
            </p>
          )}
        </div>

        {isReplying ? (
          <form onSubmit={handleSubmitReply}>
            <textarea
              autoFocus
              required
              rows={2}
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder={t("comments.writeReplyPlaceholder")}
              className="w-full rounded-sm border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-100 placeholder:text-ink-600"
            />
            {mentionMatch && members.length > 0 && (
              <MentionAutocomplete members={members} query={mentionMatch[1]} onSelect={handleSelectMention} />
            )}
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="submit"
                disabled={isSubmittingReply}
                className="rounded-sm bg-indigo-600 px-2 py-1 text-[11px] font-medium text-ink-50 hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmittingReply ? t("comments.posting") : t("comments.post")}
              </button>
              <button
                type="button"
                onClick={() => setIsReplying(false)}
                className="rounded-sm border border-ink-700 px-2 py-1 text-[11px] text-ink-300 hover:border-ink-500"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setIsReplying(true)} className="text-indigo-400 hover:text-indigo-300">
                {t("comments.reply")}
              </button>
              {canChangeStatus(comment) && (
                <button type="button" onClick={() => onToggleStatus(comment)} className="text-indigo-400 hover:text-indigo-300">
                  {comment.status === "resolved" ? t("comments.reopen") : t("comments.resolve")}
                </button>
              )}
            </div>
            {canDelete(comment) && (
              <button type="button" onClick={() => onDelete(comment)} className="text-red-400 hover:text-red-300">
                {t("comments.delete")}
              </button>
            )}
          </div>
        )}

        {replies.length > 0 && (
          <div
            onWheel={(event) => event.stopPropagation()}
            className={`flex flex-col gap-2 border-t border-ink-800 pt-2 pl-2 ${
              // Parent counts as one message — once the thread exceeds 4
              // total, the replies scroll instead of growing the card
              // indefinitely.
              // overflow-x-hidden isn't just belt-and-suspenders here: per
              // spec, setting only overflow-y to auto/scroll makes the
              // browser compute overflow-x as auto too, which can pop a
              // horizontal scrollbar on any content a pixel too wide.
              replies.length > 3 ? "max-h-48 overflow-y-auto overflow-x-hidden thin-scrollbar pr-1" : ""
            }`}
          >
            {replies.map((reply) => (
              <CommentEntry
                key={reply.id}
                comment={reply}
                canDelete={canDelete(reply)}
                canChangeStatus={canChangeStatus(reply)}
                onDelete={() => onDelete(reply)}
                onToggleStatus={() => onToggleStatus(reply)}
                highlighted={linkedCommentId === reply.id}
              />
            ))}
          </div>
        )}
      </div>
    </Html>
  );
}
