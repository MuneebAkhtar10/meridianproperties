"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  FileText,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Receipt,
  Tags,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { LinkPendingIndicator } from "@/components/link-pending-indicator";

/** Icon components can't cross the server→client boundary as props (they're
 * functions, not plain objects), so nav items carry a string key here and
 * this map resolves it to the actual icon on the client side. */
const ICONS = {
  dashboard: LayoutDashboard,
  onboarding: ListChecks,
  requests: Wrench,
  rentAndBills: Receipt,
  tenancies: KeyRound,
  properties: Building2,
  people: Users,
  history: History,
  documents: FileText,
  report: AlertTriangle,
  expenses: Wallet,
  suppliers: Tags,
  serviceCharges: Landmark,
  reports: BarChart3,
} as const;

export type NavIconKey = keyof typeof ICONS;

export type NavItem = { href: string; label: string; icon?: NavIconKey };

/**
 * The nav items are chosen on the server from the user's role and passed in, so the
 * client never decides what a role is allowed to see. Renders as a horizontal
 * pill row (the old top navbar) or a vertical list (the sidebar) depending on
 * `orientation` — same active-state logic either way.
 */
export function AppNav({
  items,
  orientation = "horizontal",
  onNavigate,
  collapsed = false,
}: {
  items: NavItem[];
  orientation?: "horizontal" | "vertical";
  /** Fired when a link is clicked — used to close the mobile drawer. */
  onNavigate?: () => void;
  /** Icon-only, no labels — only meaningful for the vertical (sidebar)
   * orientation; the desktop topbar and mobile drawer never collapse.
   * Each link keeps its label as a native `title` tooltip so it's still
   * discoverable on hover without a heavier tooltip component. */
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const isVertical = orientation === "vertical";

  return (
    <nav
      className={cn(
        "flex",
        isVertical ? "flex-col gap-1" : "items-center gap-1",
      )}
    >
      {items.map((item) => {
        // "/protected" would otherwise light up on every child route.
        const isActive =
          item.href === "/protected"
            ? pathname === "/protected"
            : pathname.startsWith(item.href);
        const Icon = item.icon ? ICONS[item.icon] : null;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              "inline-flex items-center whitespace-nowrap font-medium transition-colors",
              isVertical
                ? "gap-3 rounded-lg px-3 py-2.5 text-sm"
                : "gap-1.5 rounded-lg px-3 py-2 text-sm",
              collapsed && "lg:mx-auto lg:h-10 lg:w-10 lg:justify-center lg:gap-0 lg:px-0 lg:py-0",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
            <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
            {/* Always takes up layout space (just invisible until pending) —
             * hidden outright when collapsed instead, since a couple of
             * extra pixels are enough to throw the icon off-center inside
             * its now-square, centered button. */}
            <span className={cn(collapsed && "lg:hidden")}>
              <LinkPendingIndicator />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
