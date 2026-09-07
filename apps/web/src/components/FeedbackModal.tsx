import { useState } from "react";
import { submitFeedback, type FeedbackType } from "../lib/feedbackApi";

interface FeedbackModalProps {
  onClose: () => void;
}

const TYPES: Array<{ id: FeedbackType; label: string }> = [
  { id: "note", label: "Note" },
  { id: "feature", label: "Feature request" },
  { id: "bug", label: "Bug report" },
];

/** "Add Feedback" on the free, unauthenticated Live Diff tool — notes,
 * feature requests, and bug reports, stored via POST /feedback (no auth)
 * and reviewed at /admin/feedback. */
export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>("note");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setIsSubmitting(true);
    setError(null);
    const result = await submitFeedback({
      type,
      message: message.trim(),
      email: email.trim() || undefined,
      page: window.location.pathname,
    });
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setIsSubmitted(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-ink-800 bg-ink-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        {isSubmitted ? (
          <>
            <h3 className="text-sm font-semibold text-ink-50">Thanks for the feedback!</h3>
            <p className="mt-2 text-sm text-ink-400">We read every submission.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded bg-accent-500 px-4 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400"
            >
              Close
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 className="text-sm font-semibold text-ink-50">Add Feedback</h3>
            <p className="mt-1 text-xs text-ink-500">
              Leave a note, request a feature, or report a bug — no account needed.
            </p>

            <div className="mt-4 flex gap-1.5">
              {TYPES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setType(option.id)}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    type === option.id
                      ? "border-accent-500 bg-accent-500/10 text-accent-fg-400"
                      : "border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <textarea
              required
              autoFocus
              rows={4}
              placeholder={
                type === "bug"
                  ? "What happened, and what did you expect instead?"
                  : type === "feature"
                    ? "What would you like Meshdiff to do?"
                    : "What's on your mind?"
              }
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={4000}
              className="mt-3 w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600"
            />

            <input
              type="email"
              placeholder="Email (optional, if you'd like a reply)"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="flex-1 rounded bg-accent-500 px-4 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
              >
                {isSubmitting ? "Sending…" : "Send Feedback"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-ink-700 px-4 py-2 text-sm text-ink-300 hover:border-ink-500"
              >
                Cancel
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
