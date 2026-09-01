"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";

import {
  getNotificationsAction,
  markNotificationAsReadAction,
} from "@/app/actions";
import { useRealtime } from "@/components/realtime-provider";
import { LinkPendingIndicator } from "@/components/link-pending-indicator";

type Notification = {
  id: string;
  title: string;
  message: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
};

// The bell is driven by the live event stream. This poll is only the safety net
// for when that stream is down, so it can afford to be slow.
const FALLBACK_POLL_MS = 60_000;

export function NotificationsDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const result = await getNotificationsAction();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    const timer = setInterval(fetchNotifications, FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // The bell holds its own state, so a route refresh alone would not move it.
  useRealtime((kind) => {
    if (kind === "notification") {
      fetchNotifications();
    }
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("#notifications-dropdown") && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = async (notificationId: string) => {
    const formData = new FormData();
    formData.append("notificationId", notificationId);

    try {
      await markNotificationAsReadAction(formData);
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId
            ? { ...notification, isRead: true }
            : notification,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllRead = async () => {
    const formData = new FormData();
    formData.append("markAllRead", "true");

    try {
      await markNotificationAsReadAction(formData);
      setNotifications((prev) =>
        prev.map((notification) => ({ ...notification, isRead: true })),
      );
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking notifications as read:", error);
    }
  };

  return (
    <div className="relative" id="notifications-dropdown">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-medium text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-lg">
          <div className="p-3 border-b">
            <h3 className="font-medium">Notifications</h3>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={`p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                      !notification.isRead ? "bg-muted/20" : ""
                    }`}
                  >
                    {notification.href ? (
                      <Link
                        href={notification.href}
                        onClick={() => handleNotificationClick(notification.id)}
                        className="block"
                      >
                        <NotificationBody notification={notification} />
                        <span className="mt-1 inline-flex text-primary">
                          <LinkPendingIndicator />
                        </span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="text-left w-full"
                        onClick={() => handleNotificationClick(notification.id)}
                      >
                        <NotificationBody notification={notification} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-2 border-t text-center">
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={handleMarkAllRead}
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBody({ notification }: { notification: Notification }) {
  return (
    <>
      <div className="text-sm font-medium">{notification.title}</div>
      <div className="text-xs text-muted-foreground">
        {notification.message}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {new Date(notification.createdAt).toLocaleString()}
      </div>
    </>
  );
}
