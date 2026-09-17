"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Building2, Menu, X } from "lucide-react";

import { AppNav, type NavItem } from "@/components/app-nav";
import { cn } from "@/lib/utils";

/**
 * Left sidebar shell for the whole signed-in app. Desktop gets a fixed
 * always-visible column; below `lg`, the same content slides in as an
 * off-canvas drawer behind a hamburger button, since a full sidebar can't
 * just be squeezed onto a phone screen the way the old top navbar wrapped.
 */
export function AppSidebar({
  items,
  homeHref,
  footer,
  topbar,
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
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const brand = (
    <Link
      href={homeHref}
      className="flex items-center gap-2 px-2 font-semibold"
      onClick={() => setMobileOpen(false)}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="h-4 w-4" />
      </span>
      <span>PropertyCare</span>
    </Link>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      <div className="flex h-12 shrink-0 items-center">{brand}</div>
      <div className="shrink-0 px-1">
        <AppNav
          items={items}
          orientation="vertical"
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
      {/* mt-auto pins this to the very bottom of the column regardless of
       * how short the nav list above is, instead of sitting right under it.
       * Extra bottom clearance (pb-2) keeps it clear of Next.js's dev-mode
       * indicator badge, which docks in the same bottom-left corner locally
       * (it isn't present in production builds). */}
      <div className="mt-auto shrink-0 border-t border-border/60 px-1 pb-2 pt-3">
        {footer}
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop: fixed left column ─────────────────────────────────── */}
      <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-card lg:fixed lg:inset-y-0 lg:flex lg:flex-col lg:px-3 lg:pb-12 lg:pt-4">
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
    </>
  );
}
