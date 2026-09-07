import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  listAdminFeedback,
  getAdminFeedbackEntry,
  updateFeedbackStatus,
  deleteFeedback,
  type AdminFeedbackPage,
  type FeedbackEntry,
  type FeedbackType,
} from "../lib/feedbackApi";
import ConfirmDialog from "../components/ConfirmDialog";

const PAGE_SIZE = 25;

const TYPE_LABEL: Record<FeedbackType, string> = {
  note: "Note",
  feature: "Feature",
  bug: "Bug",
};

const TYPE_STYLE: Record<FeedbackType, string> = {
  note: "bg-ink-800 text-ink-400",
  feature: "bg-accent-500/15 text-accent-fg-400",
  bug: "bg-red-500/15 text-red-400",
};

function timeSince(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Submissions from the free tool's "Add Feedback" button — notes, feature
 * requests, and bug reports from anonymous visitors (see feedback.ts).
 * A separate page from AdminUsersPage/AdminBlogPage, same list+pagination
 * shape as those. */
export default function AdminFeedbackPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminFeedbackPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<FeedbackEntry | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  function refresh() {
    listAdminFeedback(page).then((result) => {
      if (result.success) {
        setData(result.data);
        // Keeps the detail modal's status/badge in sync after a toggle
        // made from inside it, without needing to close and reopen.
        setSelectedEntry((current) =>
          current ? (result.data.entries.find((e) => e.id === current.id) ?? current) : current,
        );
      } else {
        setError(result.error);
      }
    });
  }

  useEffect(() => {
    setData(null);
    setError(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Deep link from a feedback_submitted notification (see
  // NotificationInbox.tsx's targetPath()) — fetches that one entry directly
  // rather than assuming it's on the currently-loaded page, then strips the
  // param so refreshing doesn't reopen it.
  useEffect(() => {
    const feedbackId = searchParams.get("feedbackId");
    if (!feedbackId) return;
    getAdminFeedbackEntry(feedbackId).then((result) => {
      if (result.success) setSelectedEntry(result.data);
    });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("feedbackId");
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleStatus(id: string, nextStatus: "new" | "reviewed") {
    setTogglingId(id);
    const result = await updateFeedbackStatus(id, nextStatus);
    if (result.success) refresh();
    setTogglingId(null);
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    const result = await deleteFeedback(pendingDeleteId);
    setIsDeleting(false);
    setPendingDeleteId(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    if (selectedEntry?.id === pendingDeleteId) setSelectedEntry(null);
    refresh();
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-ink-50">Feedback</h1>
        <p className="mt-1 text-sm text-ink-400">Notes, feature requests, and bug reports from the free tool</p>
      </div>

      {error && (
        <div className="mt-6 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {data === null && !error && <div className="mt-6 text-sm text-ink-500">Loading…</div>}

      {data && (
        <>
          <div className="mt-6 overflow-hidden rounded-lg border border-ink-800">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-start">
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Type
              </span>
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Message
              </span>
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Page
              </span>
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Received
              </span>
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Status
              </span>

              {data.entries.length === 0 && (
                <div className="col-span-5 px-4 py-10 text-center text-sm text-ink-500">
                  No feedback submitted yet.
                </div>
              )}

              {data.entries.map((entry, i) => {
                const rowBorder = i === data.entries.length - 1 ? "" : "border-b border-ink-900";
                const isReviewed = entry.status === "reviewed";
                return (
                  <Fragment key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedEntry(entry)}
                      className={`px-4 py-3 text-left hover:bg-ink-900/60 ${rowBorder}`}
                    >
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_STYLE[entry.type]}`}>
                        {TYPE_LABEL[entry.type]}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedEntry(entry)}
                      className={`min-w-0 px-4 py-3 text-left text-sm text-ink-200 hover:bg-ink-900/60 ${rowBorder}`}
                    >
                      <p className="line-clamp-2 break-words">{entry.message}</p>
                      {entry.email && <p className="mt-1 truncate text-xs text-ink-500">{entry.email}</p>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedEntry(entry)}
                      className={`px-4 py-3 text-left text-xs text-ink-500 hover:bg-ink-900/60 ${rowBorder}`}
                    >
                      {entry.page ?? "—"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedEntry(entry)}
                      title={new Date(entry.createdAt).toLocaleString()}
                      className={`whitespace-nowrap px-4 py-3 text-left text-xs text-ink-500 hover:bg-ink-900/60 ${rowBorder}`}
                    >
                      {timeSince(entry.createdAt)}
                    </button>
                    <span className={`px-4 py-3 ${rowBorder}`}>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(entry.id, isReviewed ? "new" : "reviewed")}
                        disabled={togglingId === entry.id}
                        className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          isReviewed
                            ? "bg-ink-800 text-ink-500 hover:bg-ink-700 hover:text-ink-300"
                            : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                        }`}
                      >
                        {togglingId === entry.id ? "…" : isReviewed ? "Reviewed" : "New"}
                      </button>
                    </span>
                  </Fragment>
                );
              })}
            </div>
          </div>

          {data.total > PAGE_SIZE && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-ink-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-ink-800 bg-ink-900 p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_STYLE[selectedEntry.type]}`}
              >
                {TYPE_LABEL[selectedEntry.type]}
              </span>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                aria-label="Close"
                className="rounded px-1 text-sm leading-none text-ink-500 hover:text-ink-200"
              >
                ✕
              </button>
            </div>

            <p className="mt-4 whitespace-pre-wrap break-words text-sm text-ink-100">{selectedEntry.message}</p>

            <div className="mt-5 space-y-2 border-t border-ink-800 pt-4 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500">Email</span>
                <span className="text-ink-300">{selectedEntry.email ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500">Page</span>
                <span className="text-ink-300">{selectedEntry.page ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500">Submitted by</span>
                <span className="text-ink-300">{selectedEntry.userEmail ?? "Anonymous"}</span>
              </div>
              {selectedEntry.userAgent && (
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-ink-500">Browser</span>
                  <span className="break-words text-right text-ink-400">{selectedEntry.userAgent}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500">Received</span>
                <span className="text-ink-300">{new Date(selectedEntry.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500">Status</span>
                <button
                  type="button"
                  onClick={() =>
                    handleToggleStatus(selectedEntry.id, selectedEntry.status === "reviewed" ? "new" : "reviewed")
                  }
                  disabled={togglingId === selectedEntry.id}
                  className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    selectedEntry.status === "reviewed"
                      ? "bg-ink-800 text-ink-500 hover:bg-ink-700 hover:text-ink-300"
                      : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                  }`}
                >
                  {togglingId === selectedEntry.id
                    ? "…"
                    : selectedEntry.status === "reviewed"
                      ? "Reviewed"
                      : "New"}
                </button>
              </div>
            </div>

            <div className="mt-5 flex justify-end border-t border-ink-800 pt-4">
              <button
                type="button"
                onClick={() => setPendingDeleteId(selectedEntry.id)}
                className="rounded border border-red-800 px-3 py-1.5 text-xs font-medium text-red-400 hover:border-red-600 hover:bg-red-500/10"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete this feedback?"
          message="This can't be undone."
          confirmLabel="Delete"
          isDestructive
          isConfirming={isDeleting}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
