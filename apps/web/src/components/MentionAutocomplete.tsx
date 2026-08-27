interface MentionAutocompleteProps {
  /** Project members eligible to be @mentioned — same list used for the
   * assignee picker (see PendingCommentPopover.tsx). */
  members: Array<{ userId: string; email: string | null }>;
  /** Text typed after the triggering '@', used to filter suggestions. */
  query: string;
  onSelect: (email: string) => void;
}

// Trailing-@ detection only (see PendingCommentPopover.tsx/CommentPopover.tsx
// callers) — this is not a full caret-tracked popover, it just renders
// below the textarea when the text ends in "@partial". Good enough for a
// short comment box; a mid-sentence @mention still works if it's typed at
// the current end of the text.
export default function MentionAutocomplete({ members, query, onSelect }: MentionAutocompleteProps) {
  const matches = members
    .filter((m): m is { userId: string; email: string } => !!m.email)
    .filter((m) => m.email.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5);

  if (matches.length === 0) return null;

  return (
    <div className="mt-1 overflow-hidden rounded border border-ink-700 bg-ink-950 shadow-lg">
      {matches.map((member) => (
        <button
          key={member.userId}
          type="button"
          // mousedown, not click — fires before the textarea's blur, so the
          // caret/selection state doesn't get lost before onSelect runs.
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(member.email);
          }}
          className="block w-full truncate px-2 py-1 text-left text-[11px] text-ink-200 hover:bg-ink-800"
        >
          {member.email}
        </button>
      ))}
    </div>
  );
}
