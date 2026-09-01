import { useState } from "react";
import FeedbackModal from "./FeedbackModal";

/** Global "Add Feedback" entry point, mounted once in RootLayout.tsx so it
 * appears on every page — marketing, docs, blog, the signed-in dashboard,
 * everywhere. The Live Diff tool's full-screen workspace (LiveDiffToolPage)
 * has its own contextual copy of this button inside its toolbar instead,
 * since that view is a z-50 overlay that sits above this fixed button. */
export default function FloatingFeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Add Feedback"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-accent-500/40 bg-ink-900/95 px-4 py-2.5 text-sm font-medium text-accent-300 shadow-lg backdrop-blur transition hover:border-accent-400 hover:bg-ink-900"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
        </span>
        💬 Feedback
      </button>

      {isOpen && <FeedbackModal onClose={() => setIsOpen(false)} />}
    </>
  );
}
