import { useState } from "react";
import { Html } from "@react-three/drei";
import { useTranslation } from "react-i18next";
import type { CommentPriority } from "../lib/projectsApi";
import MentionAutocomplete from "./MentionAutocomplete";

interface ProjectMember {
  userId: string;
  email: string | null;
}

interface PendingCommentPopoverProps {
  position: [number, number, number];
  /** Empty on a personal (Pro) project — there's no one else to assign to
   * or mention, so the "More options" disclosure below only appears when
   * this is non-empty. */
  members: ProjectMember[];
  onSubmit: (body: string, assigneeUserId?: string, priority?: CommentPriority) => Promise<void>;
  onCancel: () => void;
}

/** Same left-of-pin placement as CommentPopover, so typing a new comment
 * feels like the same window that shows an existing one. */
export default function PendingCommentPopover({ position, members, onSubmit, onCancel }: PendingCommentPopoverProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [priority, setPriority] = useState<CommentPriority | "">("");
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Trailing "@partial" at the end of the current text — see
  // MentionAutocomplete.tsx for why this is trailing-only, not caret-aware.
  const mentionMatch = /@([\w.]*)$/.exec(text);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setIsSubmitting(true);
    await onSubmit(text.trim(), assigneeUserId || undefined, priority || undefined);
    setIsSubmitting(false);
  }

  function handleSelectMention(email: string) {
    if (!mentionMatch) return;
    setText(text.slice(0, text.length - mentionMatch[0].length) + `@${email} `);
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
        {mentionMatch && members.length > 0 && (
          <MentionAutocomplete members={members} query={mentionMatch[1]} onSelect={handleSelectMention} />
        )}

        {members.length > 0 && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setShowMoreOptions((prev) => !prev)}
              className="text-[10px] text-ink-500 hover:text-ink-300"
            >
              {showMoreOptions ? t("comments.hideOptions") : t("comments.moreOptions")}
            </button>
            {showMoreOptions && (
              <div className="mt-1 flex gap-1.5">
                <select
                  value={assigneeUserId}
                  onChange={(event) => setAssigneeUserId(event.target.value)}
                  className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-950 px-1.5 py-1 text-[11px] text-ink-200"
                >
                  <option value="">{t("comments.unassigned")}</option>
                  {members
                    .filter((m) => m.email)
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.email}
                      </option>
                    ))}
                </select>
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as CommentPriority | "")}
                  className="shrink-0 rounded border border-ink-700 bg-ink-950 px-1.5 py-1 text-[11px] text-ink-200"
                >
                  <option value="">{t("comments.priorityNone")}</option>
                  <option value="low">{t("comments.priorityLow")}</option>
                  <option value="normal">{t("comments.priorityNormal")}</option>
                  <option value="high">{t("comments.priorityHigh")}</option>
                </select>
              </div>
            )}
          </div>
        )}

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
