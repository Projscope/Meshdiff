import { useCallback, useEffect, useRef, useState } from "react";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationSummary,
} from "../lib/projectsApi";
import NotificationInbox from "./NotificationInbox";

const POLL_INTERVAL_MS = 45_000;

// Header icon + unread badge, polling rather than push (no realtime
// infrastructure in this codebase — see plan's "in-app only" scope
// decision). Refetches on window focus too, so switching back to this tab
// after a while doesn't wait out the full poll interval.
export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshUnreadCount = useCallback(async () => {
    const result = await getUnreadNotificationCount();
    if (result.success) setUnreadCount(result.data.count);
  }, []);

  useEffect(() => {
    void refreshUnreadCount();
    const interval = setInterval(() => void refreshUnreadCount(), POLL_INTERVAL_MS);
    window.addEventListener("focus", refreshUnreadCount);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshUnreadCount);
    };
  }, [refreshUnreadCount]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  async function handleToggle() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      setIsLoading(true);
      const result = await listNotifications();
      if (result.success) setNotifications(result.data);
      setIsLoading(false);
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    await markAllNotificationsRead();
  }

  async function handleSelect(notification: NotificationSummary) {
    setIsOpen(false);
    if (notification.readAt) return;
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await markNotificationRead(notification.id);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => void handleToggle()}
        aria-label="Notifications"
        className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-400 hover:bg-ink-800 hover:text-ink-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent-500 px-0.5 text-[9px] font-bold text-chrome-950">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute bottom-full left-0 z-10 mb-1">
          <NotificationInbox
            notifications={notifications}
            isLoading={isLoading}
            onMarkAllRead={() => void handleMarkAllRead()}
            onSelect={(n) => void handleSelect(n)}
          />
        </div>
      )}
    </div>
  );
}
