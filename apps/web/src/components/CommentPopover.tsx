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
      <span className="min-w-0 truncate text-[10px] text-ink-500">
        <span className="font-medium text-ink-400">{comment.authorEmail ?? "Someone"}</span>
        {" · "}
        {formatDate(comment.createdAt)}
      </span>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-ink-100">{comment.body}</p>
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

  // No distanceFactor on the Html below — this should stay a fixed,
  // readable size on screen regardless of camera zoom, not shrink along
  // with the model.
  return (
    <Html position={comment.position} occlude={false} zIndexRange={[100, 0]}>
      <div
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        className="relative flex w-80 max-w-[90vw] -translate-x-[calc(100%+12px)] -translate-y-1/2 flex-col gap-2 rounded-lg border border-ink-700 bg-ink-900 p-2.5 shadow-xl"
      >
        {/* Close stays alone in the top-right corner, well clear of the
            per-comment Delete links below — those live next to Reply
            instead, away from where the pin sits. */}
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="absolute right-1.5 top-1.5 rounded px-1 text-xs leading-none text-ink-500 hover:text-ink-200"
        >
          ✕
        </button>

        <div className="pr-5">
          <span className="min-w-0 truncate text-[10px] text-ink-500">
            <span className="font-medium text-ink-400">{comment.authorEmail ?? "Someone"}</span>
            {" · "}
            {formatDate(comment.createdAt)}
          </span>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-ink-100">{comment.body}</p>
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
              className="w-full rounded border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-100 placeholder:text-ink-600"
            />
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="submit"
                disabled={isSubmittingReply}
                className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-ink-50 hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmittingReply ? "Posting…" : "Post"}
              </button>
              <button
                type="button"
                onClick={() => setIsReplying(false)}
                className="rounded border border-ink-700 px-2 py-1 text-[11px] text-ink-300 hover:border-ink-500"
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
                onDelete={() => onDelete(reply)}
              />
            ))}
          </div>
        )}
      </div>
    </Html>
  );
}
