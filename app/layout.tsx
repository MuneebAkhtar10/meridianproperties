import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Building2 } from "lucide-react";

import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { type NavItem } from "@/components/app-nav";
import { AppTopbar, TOOLBAR_BY_ROLE } from "@/components/app-topbar";
import { RealtimeProvider } from "@/components/realtime-provider";
import { UserMenu } from "@/components/user-menu";
import { ButtonLink } from "@/components/ui/button-link";
import { getCurrentUser } from "@/lib/session";
import type { UserType } from "@/lib/generated/prisma/client";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Property Management System",
  description:
    "Manage Oman tenancies, OMR rent, bills and maintenance across your properties.",
};

const NAV_BY_ROLE: Record<UserType, NavItem[]> = {
  admin: [
    { href: "/protected", label: "Dashboard", icon: "dashboard" },
    { href: "/protected/properties", label: "Properties", icon: "properties" },
    { href: "/protected/tenancies", label: "Tenancies", icon: "tenancies" },
    { href: "/protected/maintenance", label: "Requests", icon: "requests" },
    { href: "/protected/finances", label: "Rent & Bills", icon: "rentAndBills" },
    {
      href: "/protected/service-charge-ledger",
      label: "Service Charge Ledger",
      icon: "serviceCharges",
    },
    { href: "/protected/expenses", label: "Expenses", icon: "expenses" },
    { href: "/protected/admin/suppliers", label: "Suppliers", icon: "suppliers" },
    { href: "/protected/users", label: "People", icon: "people" },
  ],
  worker: [
    { href: "/protected", label: "Dashboard", icon: "dashboard" },
    { href: "/protected/tasks", label: "My Tasks", icon: "requests" },
    { href: "/protected/history", label: "History", icon: "history" },
  ],
  user: [
    { href: "/protected", label: "Dashboard", icon: "dashboard" },
    { href: "/protected/requests", label: "My Requests", icon: "requests" },
    { href: "/protected/finances", label: "Rent & Bills", icon: "rentAndBills" },
    { href: "/protected/documents", label: "My Documents", icon: "documents" },
    { href: "/protected/report", label: "Report Issue", icon: "report" },
  ],
  owner: [
    { href: "/protected", label: "Dashboard", icon: "dashboard" },
    { href: "/protected/properties", label: "Properties", icon: "properties" },
    { href: "/protected/tenancies", label: "Tenancies", icon: "tenancies" },
    { href: "/protected/maintenance", label: "Requests", icon: "requests" },
    { href: "/protected/finances", label: "Rent & Bills", icon: "rentAndBills" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  const shell = user ? (
    <div className="min-h-screen">
      <AppSidebar
        items={NAV_BY_ROLE[user.userType]}
        homeHref="/protected"
        footer={
          <UserMenu
            email={user.email}
            userType={user.userType}
            firstName={user.firstName}
            lastName={user.lastName}
          />
        }
        topbar={<AppTopbar items={TOOLBAR_BY_ROLE[user.userType]} />}
      />

      {/* Offset by the fixed sidebar's width on desktop; the sidebar itself
          becomes a slide-in drawer below `lg`, so no offset is needed there. */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Mirrors the mobile bar rendered inside AppSidebar — desktop has no
            top bar of its own otherwise, so quick links + notifications need
            a home here instead. */}
        <div className="hidden h-14 items-center justify-end border-b border-border/60 px-4 lg:flex sm:px-6 lg:px-8">
          <AppTopbar items={TOOLBAR_BY_ROLE[user.userType]} />
        </div>

        <main className="min-w-0 flex-1">{children}</main>

        <footer className="border-t border-border/60 py-6">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} PropertyCare. All rights
              reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  ) : (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="h-4 w-4" />
            </span>
            <span>PropertyCare</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ButtonLink href="/sign-in" size="sm">
              Sign in
            </ButtonLink>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t py-6">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} PropertyCare. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );

  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen`}>
        {/* The stream needs a session, and it has to sit above the notification
            bell as well as the pages, so it wraps the whole signed-in shell. */}
        {user ? <RealtimeProvider>{shell}</RealtimeProvider> : shell}
      </body>
    </html>
  );
}
