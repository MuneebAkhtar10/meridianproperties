"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Building2, ChevronsLeft, ChevronsRight, Menu, X } from "lucide-react";

import { AppNav, type NavItem } from "@/components/app-nav";
import { cn } from "@/lib/utils";

/** Lets the sidebar's footer slot (an opaque ReactNode passed in from a
 * Server Component — see UserMenu) react to the collapsed state without
 * AppSidebar needing to reach into or clone it. */
const SidebarCollapsedContext = createContext(false);

/** Whether the desktop sidebar is currently collapsed to icon-only width —
 * for a footer/nav slot rendered outside AppSidebar's own JSX (e.g.
 * UserMenu) to hide its text the same way the nav labels do. Always false
 * on mobile, where the drawer is never collapsed. */
export function useSidebarCollapsed(): boolean {
  return useContext(SidebarCollapsedContext);
}

const COOKIE_NAME = "sidebar_collapsed";
const EXPANDED_WIDTH = "16rem";
const COLLAPSED_WIDTH = "4.5rem";

/**
 * Left sidebar shell for the whole signed-in app. Desktop gets a fixed
 * column that can collapse to icon-only width (persisted in a cookie so
 * the very first server-rendered paint already matches, no flash); below
 * `lg`, the same content slides in as an off-canvas drawer behind a
 * hamburger button instead, always at full width — collapsing only makes
 * sense once there's a wide column to reclaim space from.
 */
export function AppSidebar({
  items,
  homeHref,
  footer,
  topbar,
  defaultCollapsed = false,
  children,
}: {
  items: NavItem[];
  homeHref: string;
  /** The account card (name/email/role) — pinned to the bottom, outside the
   * scrollable nav list so its dropdown menu never gets clipped. */
  footer: ReactNode;
  /** Quick-access links + notifications bell — shown here on mobile,
   * alongside the hamburger; the desktop bar is rendered separately in
   * `app/layout.tsx` since it doesn't belong inside this fixed column. */
  topbar: ReactNode;
  /** The desktop collapsed state as of the last page load, read server-side
   * from the cookie this component sets — so the very first paint is
   * already correct instead of flashing expanded-then-collapsed. */
  defaultCollapsed?: boolean;
  /** The rest of the page — rendered here (not as a sibling in layout.tsx)
   * so its left offset can share the exact same collapsed state and
   * transition in lockstep with the sidebar's own width, with nothing to
   * keep in sync across components. */
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      // A plain preference cookie, not sensitive — set client-side rather
      // than through a server action, a year out, site-wide.
      document.cookie = `${COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  };

  const brand = (
    <Link
      href={homeHref}
      className={cn(
        "flex items-center gap-2 px-2 font-semibold",
        collapsed && "lg:justify-center lg:px-0",
      )}
      onClick={() => setMobileOpen(false)}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="h-4 w-4" />
      </span>
      <span className={cn(collapsed && "lg:hidden")}>PropertyCare</span>
    </Link>
  );

  // The collapse/expand toggle sits in its own fixed row directly below
  // the logo in both states — same row, same horizontal position as the
  // nav icons below it (left-aligned when expanded, centered when
  // collapsed, exactly like AppNav's own items) — so it never jumps
  // position when toggled and always reads as part of the sidebar's own
  // column, not a bolted-on control floating over the page next to it.
  const collapseToggle = (
    <button
      type="button"
      onClick={toggleCollapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={cn(
        "hidden h-8 shrink-0 items-center gap-3 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex",
        collapsed ? "w-10 justify-center" : "w-full px-3",
      )}
    >
      {collapsed ? (
        <ChevronsRight className="h-4 w-4" />
      ) : (
        <ChevronsLeft className="h-4 w-4" />
      )}
    </button>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col gap-1 overflow-y-auto overflow-x-hidden">
      <div
        className={cn(
          "flex h-12 shrink-0 items-center",
          collapsed && "justify-center",
        )}
      >
        {brand}
      </div>
      <div className={cn("shrink-0 pb-1", collapsed ? "flex justify-center" : "px-1")}>
        {collapseToggle}
      </div>
      <div className="mb-3 shrink-0 border-t border-border/60" />
      <div className="shrink-0 px-1">
        <AppNav
          items={items}
          orientation="vertical"
          collapsed={collapsed}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
      {/* mt-auto pins this to the very bottom of the column regardless of
       * how short the nav list above is, instead of sitting right under it.
       * Extra bottom clearance (pb-2) keeps it clear of Next.js's dev-mode
       * indicator badge, which docks in the same bottom-left corner locally
       * (it isn't present in production builds). */}
      <div className="mt-auto shrink-0 border-t border-border/60 px-1 pb-2 pt-3">
        <SidebarCollapsedContext.Provider value={collapsed}>
          {footer}
        </SidebarCollapsedContext.Provider>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen"
      style={
        {
          "--sidebar-w": collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        } as React.CSSProperties
      }
    >
      {/* ── Desktop: fixed left column, width animates on collapse ──────── */}
      <aside className="hidden w-[var(--sidebar-w)] shrink-0 border-r border-border/60 bg-card transition-[width] duration-200 ease-in-out lg:fixed lg:inset-y-0 lg:flex lg:flex-col lg:px-3 lg:pb-4 lg:pt-4">
        {sidebarBody}
      </aside>

      {/* ── Mobile: top bar with hamburger + off-canvas drawer ──────────── */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        {brand}
        <div className="ml-auto">{topbar}</div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border/60 bg-card px-3 py-4 shadow-2xl",
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              {brand}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="shrink-0 overflow-y-auto px-1">
              <AppNav
                items={items}
                orientation="vertical"
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
            <div className="mt-auto shrink-0 border-t border-border/60 px-1 pt-3">
              {footer}
            </div>
          </aside>
        </div>
      )}

      {/* Offset by the fixed sidebar's current width on desktop — both read
          the same `--sidebar-w` custom property set above, so they always
          match and animate together; the sidebar itself becomes a slide-in
          drawer below `lg`, so no offset is needed there. */}
      <div className="flex min-h-screen flex-col transition-[padding-left] duration-200 ease-in-out lg:pl-[var(--sidebar-w)]">
        {children}
      </div>
    </div>
  );
}
