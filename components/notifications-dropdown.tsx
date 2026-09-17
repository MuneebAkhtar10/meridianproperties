"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Bell,
  BellOff,
  Building2,
  Check,
  CheckCheck,
  KeyRound,
  LoaderCircle,
  ReceiptText,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import {
  getNotificationsAction,
  markNotificationAsReadAction,
} from "@/app/actions";
import { useRealtime } from "@/components/realtime-provider";
import { LinkPendingIndicator } from "@/components/link-pending-indicator";
import { cn } from "@/lib/utils";

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

/** Notifications carry no `kind` field in the schema — just a free-text
 * title — so the icon/color is inferred from keywords in it. Good enough
 * for a visual category cue; falls back to a plain bell for anything that
 * doesn't match. */
function notificationVisual(title: string): {
  icon: LucideIcon;
  iconBg: string;
} {
  const t = title.toLowerCase();
  if (t.includes("payment") || t.includes("charge") || t.includes("invoice")) {
    return { icon: ReceiptText, iconBg: "bg-amber-50 text-amber-600" };
  }
  if (t.includes("property")) {
    return { icon: Building2, iconBg: "bg-violet-50 text-violet-600" };
  }
  if (t.includes("tenant") || t.includes("tenancy") || t.includes("lease")) {
    return { icon: KeyRound, iconBg: "bg-indigo-50 text-indigo-600" };
  }
  if (t.includes("request") || t.includes("maintenance") || t.includes("task")) {
    return { icon: Wrench, iconBg: "bg-sky-50 text-sky-600" };
  }
  return { icon: Bell, iconBg: "bg-slate-100 text-slate-600" };
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

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
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-card">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold tracking-tight">Notifications</h3>
              {unreadCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                  {unreadCount} new
                </span>
              )}
            </div>
            {notifications.length > 0 && unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
                <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" />
                Loading notifications…
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                  <BellOff className="h-5 w-5 text-muted-foreground" />
                </span>
                <p className="text-sm font-medium">You&rsquo;re all caught up</p>
                <p className="text-xs text-muted-foreground">
                  New activity on your properties will show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {notifications.map((notification) => {
                  const { icon: Icon, iconBg } = notificationVisual(
                    notification.title,
                  );
                  const body = (
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          iconBg,
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {!notification.isRead && (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-card" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 leading-snug">
                        <p
                          className={cn(
                            "truncate text-sm",
                            notification.isRead
                              ? "font-medium text-foreground/80"
                              : "font-semibold text-foreground",
                          )}
                        >
                          {notification.title}
                        </p>
                        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                          {notification.message}
                        </p>
                        <p className="text-[11px] leading-snug text-muted-foreground/70">
                          {relativeTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  );

                  return (
                    <li
                      key={notification.id}
                      className={cn(
                        "transition-colors hover:bg-muted/50",
                        !notification.isRead && "bg-primary/[0.03]",
                      )}
                    >
                      {notification.href ? (
                        <Link
                          href={notification.href}
                          onClick={() => handleNotificationClick(notification.id)}
                          className="block px-4 py-2"
                        >
                          {body}
                          <span className="ml-[42px] inline-flex text-primary">
                            <LinkPendingIndicator />
                          </span>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="block w-full px-4 py-2 text-left"
                          onClick={() => handleNotificationClick(notification.id)}
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {notifications.length > 0 && unreadCount === 0 && (
            <div className="flex items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5" />
              All notifications read
            </div>
          )}
        </div>
      )}
    </div>
  );
}
