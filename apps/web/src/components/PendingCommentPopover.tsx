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

  return (
    <Html position={position} distanceFactor={40} occlude={false} zIndexRange={[100, 0]}>
      <form
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-64 -translate-x-[calc(100%+12px)] -translate-y-1/2 rounded-lg border border-indigo-700 bg-neutral-900 p-2.5 shadow-xl"
      >
        <textarea
          autoFocus
          required
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Leave a comment at this point…"
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-600"
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
            onClick={onCancel}
            className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 hover:border-neutral-500"
          >
            Cancel
          </button>
        </div>
      </form>
    </Html>
  );
}
