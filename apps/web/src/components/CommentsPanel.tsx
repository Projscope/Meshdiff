import { useState } from "react";
import type { CommentSummary } from "../lib/projectsApi";

interface CommentsPanelProps {
  comments: CommentSummary[];
  isPlacingComment: boolean;
  onTogglePlacing: () => void;
  /** Set once the user has clicked a point on the mesh, awaiting the comment text. */
  pendingPosition: [number, number, number] | null;
  onSubmitComment: (body: string) => Promise<void>;
  onCancelPending: () => void;
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
  onSubmitComment,
  onCancelPending,
}: CommentsPanelProps) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setIsSubmitting(true);
    await onSubmitComment(text.trim());
    setIsSubmitting(false);
    setText("");
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Comments <span className="text-neutral-600">({comments.length})</span>
        </h3>
        <button
          type="button"
          onClick={onTogglePlacing}
          className={`rounded border px-2 py-0.5 text-[11px] ${
            isPlacingComment
              ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
              : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
          }`}
        >
          {isPlacingComment ? "Click the model…" : "+ Add Comment"}
        </button>
      </div>

      {pendingPosition && (
        <form onSubmit={handleSubmit} className="mt-2 rounded border border-indigo-800 bg-indigo-950/30 p-2">
          <p className="text-[11px] text-neutral-500">
            Pinned at ({pendingPosition[0].toFixed(1)}, {pendingPosition[1].toFixed(1)},{" "}
            {pendingPosition[2].toFixed(1)})
          </p>
          <textarea
            autoFocus
            required
            rows={2}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Leave a comment at this point…"
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-600"
          />
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSubmitting ? "Posting…" : "Post"}
            </button>
            <button
              type="button"
              onClick={onCancelPending}
              className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 hover:border-neutral-500"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-2 flex flex-col gap-1.5">
        {comments.length === 0 && !pendingPosition && (
          <p className="text-xs text-neutral-600">No comments yet.</p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[10px] text-neutral-500">
              <span>📍</span>
              <span>{formatDate(comment.createdAt)}</span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-200">{comment.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
