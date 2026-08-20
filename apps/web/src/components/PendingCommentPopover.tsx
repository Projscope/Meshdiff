import { useState } from "react";
import { Html } from "@react-three/drei";

interface PendingCommentPopoverProps {
  position: [number, number, number];
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}

/** Same left-of-pin placement as CommentPopover, so typing a new comment
 * feels like the same window that shows an existing one. */
export default function PendingCommentPopover({ position, onSubmit, onCancel }: PendingCommentPopoverProps) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setIsSubmitting(true);
    await onSubmit(text.trim());
    setIsSubmitting(false);
  }

  // No distanceFactor — stays a fixed, readable size on screen regardless
  // of camera zoom, same as CommentPopover.
  return (
    <Html position={position} occlude={false} zIndexRange={[100, 0]}>
      <form
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-80 max-w-[90vw] -translate-x-[calc(100%+12px)] -translate-y-1/2 rounded-lg border border-indigo-700 bg-ink-900 p-2.5 shadow-xl"
      >
        <textarea
          autoFocus
          required
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Leave a comment at this point…"
          className="w-full rounded border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-100 placeholder:text-ink-600"
        />
        <div className="mt-1.5 flex gap-1.5">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-ink-50 hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSubmitting ? "Posting…" : "Post"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-ink-700 px-2 py-1 text-[11px] text-ink-300 hover:border-ink-500"
          >
            Cancel
          </button>
        </div>
      </form>
    </Html>
  );
}
