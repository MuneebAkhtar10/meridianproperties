import Link from "next/link";
import { Ban, Plug, QrCode } from "lucide-react";

import { LinkPendingIndicator } from "@/components/link-pending-indicator";
import { NotificationsDropdownWrapper } from "@/components/notifications-dropdown-wrapper";
import { UserType } from "@/lib/generated/prisma/client";

export type ToolbarItem = {
  href: string;
  label: string;
  icon: "rejections" | "qrCode" | "dynamics";
};

const ICONS = {
  rejections: Ban,
  qrCode: QrCode,
  dynamics: Plug,
} as const;

export const TOOLBAR_BY_ROLE: Record<UserType, ToolbarItem[]> = {
  admin: [
    { href: "/protected/rejections", label: "Rejections", icon: "rejections" },
    { href: "/protected/admin/qr-code", label: "QR Code", icon: "qrCode" },
    { href: "/protected/admin/dynamics", label: "Dynamics 365", icon: "dynamics" },
  ],
  user: [
    { href: "/protected/rejections", label: "Rejections", icon: "rejections" },
  ],
  worker: [],
  owner: [],
};

/** Quick-access icon links (Rejections, QR Code, Dynamics 365 — whichever
 * apply to this role) plus the notifications bell, anchored top-right of the
 * content area. Rendered both in the desktop bar (`app/layout.tsx`) and the
 * mobile top bar (`AppSidebar`), so it takes no layout opinion of its own. */
export function AppTopbar({ items }: { items: ToolbarItem[] }) {
  return (
    <div className="flex items-center gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon className="h-5 w-5" />
            <LinkPendingIndicator />
          </Link>
        );
      })}
      <NotificationsDropdownWrapper />
    </div>
  );
}
