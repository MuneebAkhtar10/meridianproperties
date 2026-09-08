"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { LinkPendingIndicator } from "@/components/link-pending-indicator";

export type NavItem = { href: string; label: string };

/**
 * The nav items are chosen on the server from the user's role and passed in, so the
 * client never decides what a role is allowed to see.
 */
export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        // "/protected" would otherwise light up on every child route.
        const isActive =
          item.href === "/protected"
            ? pathname === "/protected"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
            <LinkPendingIndicator />
          </Link>
        );
      })}
    </nav>
  );
}
