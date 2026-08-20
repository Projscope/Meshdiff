import { useState } from "react";
import { Html } from "@react-three/drei";
import type { CommentSummary } from "../lib/projectsApi";

interface CommentPopoverProps {
  comment: CommentSummary;
  replies: CommentSummary[];
  onClose: () => void;
  canDelete: (comment: CommentSummary) => boolean;
  onDelete: (comment: CommentSummary) => void;
  onReply: (body: string) => Promise<void>;
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
  onDelete,
}: {
  comment: CommentSummary;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div>
      <span className="min-w-0 truncate text-[10px] text-neutral-500">
        <span className="font-medium text-neutral-400">{comment.authorEmail ?? "Someone"}</span>
        {" · "}
        {formatDate(comment.createdAt)}
      </span>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-neutral-100">{comment.body}</p>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-1 text-[11px] text-red-400 hover:text-red-300"
        >
          Delete
        </button>
      )}
    </div>
  );
}

/** Anchored at the comment's own 3D position — no `center` prop here (unlike
 * CommentPin) since the translate below already places it to the left of
 * the pin with a 12px gap, vertically centered on it. */
export default function CommentPopover({ comment, replies, onClose, canDelete, onDelete, onReply }: CommentPopoverProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  async function handleSubmitReply(event: React.FormEvent) {
    event.preventDefault();
    if (!replyText.trim()) return;
    setIsSubmittingReply(true);
    await onReply(replyText.trim());
    setIsSubmittingReply(false);
    setReplyText("");
    setIsReplying(false);
  }

  return (
    <Html position={comment.position} distanceFactor={40} occlude={false} zIndexRange={[100, 0]}>
      <div
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        className="relative flex w-64 -translate-x-[calc(100%+12px)] -translate-y-1/2 flex-col gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-2.5 shadow-xl"
      >
        {/* Close stays alone in the top-right corner, well clear of the
            per-comment Delete links below — those live next to Reply
            instead, away from where the pin sits. */}
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="absolute right-1.5 top-1.5 rounded px-1 text-xs leading-none text-neutral-500 hover:text-neutral-200"
        >
          ✕
        </button>

        <div className="pr-5">
          <span className="min-w-0 truncate text-[10px] text-neutral-500">
            <span className="font-medium text-neutral-400">{comment.authorEmail ?? "Someone"}</span>
            {" · "}
            {formatDate(comment.createdAt)}
          </span>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-neutral-100">{comment.body}</p>
        </div>

        {isReplying ? (
          <form onSubmit={handleSubmitReply}>
            <textarea
              autoFocus
              required
              rows={2}
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder="Write a reply…"
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-600"
            />
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="submit"
                disabled={isSubmittingReply}
                className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmittingReply ? "Posting…" : "Post"}
              </button>
              <button
                type="button"
                onClick={() => setIsReplying(false)}
                className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 hover:border-neutral-500"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3 text-[11px]">
            <button type="button" onClick={() => setIsReplying(true)} className="text-indigo-400 hover:text-indigo-300">
              Reply
            </button>
            {canDelete(comment) && (
              <button type="button" onClick={() => onDelete(comment)} className="text-red-400 hover:text-red-300">
                Delete
              </button>
            )}
          </div>
        )}

        {replies.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-neutral-800 pt-2 pl-2">
            {replies.map((reply) => (
              <CommentEntry
                key={reply.id}
                comment={reply}
                canDelete={canDelete(reply)}
                onDelete={() => onDelete(reply)}
              />
            ))}
          </div>
        )}
      </div>
    </Html>
  );
}
