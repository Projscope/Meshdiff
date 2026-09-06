import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { NotificationSummary } from "../lib/projectsApi";

interface NotificationInboxProps {
  notifications: NotificationSummary[];
  isLoading: boolean;
  onMarkAllRead: () => void;
  onSelect: (notification: NotificationSummary) => void;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function targetPath(notification: NotificationSummary): string | null {
  // Deep-links straight to the entry's detail modal on the admin feedback
  // page (see AdminFeedbackPage.tsx's `?feedbackId=` handling) — this type
  // has no project at all, so it's checked before the project-based cases.
  if (notification.type === "feedback_submitted" && notification.feedbackId) {
    return `/admin/feedback?feedbackId=${notification.feedbackId}`;
  }
  if (!notification.projectId) return null;
  if (notification.versionId) {
    const base = `/projects/${notification.projectId}/versions/${notification.versionId}`;
    // Deep-links straight to the comment (opened via its 3D pin popover) for
    // notification types that point at one — mention/comment_assigned.
    return notification.commentId ? `${base}?comment=${notification.commentId}` : base;
  }
  return `/projects/${notification.projectId}`;
}

// Dropdown panel content for NotificationBell — same bordered-popover look
// as the sidebar's account menu in ProjectsLayout.tsx.
export default function NotificationInbox({ notifications, isLoading, onMarkAllRead, onSelect }: NotificationInboxProps) {
  const { t } = useTranslation();
  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="w-80 overflow-hidden rounded-lg border border-ink-800 bg-ink-900 shadow-xl">
      <div className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">
          {t("notifications.title")}
        </span>
        {hasUnread && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-[11px] font-medium text-ink-400 hover:text-ink-200"
          >
            {t("notifications.markAllRead")}
          </button>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <p className="px-3 py-4 text-center text-xs text-ink-500">{t("notifications.loading")}</p>
        ) : notifications.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-ink-500">{t("notifications.empty")}</p>
        ) : (
          notifications.map((notification) => {
            const path = targetPath(notification);
            const content = (
              <>
                <p className={`text-xs ${notification.readAt ? "text-ink-400" : "text-ink-100"}`}>
                  {notification.summary}
                </p>
                <span className="mt-0.5 block text-[10px] text-ink-600">{timeAgo(notification.createdAt)}</span>
              </>
            );
            const rowClassName = `block border-b border-ink-800 px-3 py-2 last:border-b-0 hover:bg-ink-800 ${
              notification.readAt ? "" : "bg-accent-500/5"
            }`;
            return path ? (
              <Link key={notification.id} to={path} onClick={() => onSelect(notification)} className={rowClassName}>
                {content}
              </Link>
            ) : (
              <button
                key={notification.id}
                type="button"
                onClick={() => onSelect(notification)}
                className={`w-full text-left ${rowClassName}`}
              >
                {content}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
