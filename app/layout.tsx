import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Building2 } from "lucide-react";

import "./globals.css";
import { AppNav, type NavItem } from "@/components/app-nav";
import { NotificationsDropdownWrapper } from "@/components/notifications-dropdown-wrapper";
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
    { href: "/protected", label: "Dashboard" },
    { href: "/protected/maintenance", label: "Requests" },
    { href: "/protected/finances", label: "Rent & Bills" },
    { href: "/protected/tenancies", label: "Tenancies" },
    { href: "/protected/properties", label: "Properties" },
    { href: "/protected/users", label: "People" },
  ],
  worker: [
    { href: "/protected", label: "Dashboard" },
    { href: "/protected/tasks", label: "My Tasks" },
    { href: "/protected/history", label: "History" },
  ],
  user: [
    { href: "/protected", label: "Dashboard" },
    { href: "/protected/requests", label: "My Requests" },
    { href: "/protected/finances", label: "Rent & Bills" },
    { href: "/protected/documents", label: "My Documents" },
    { href: "/protected/report", label: "Report Issue" },
  ],
  owner: [
    { href: "/protected", label: "Dashboard" },
    { href: "/protected/maintenance", label: "Requests" },
    { href: "/protected/finances", label: "Rent & Bills" },
    { href: "/protected/tenancies", label: "Tenancies" },
    { href: "/protected/properties", label: "Properties" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  const shell = (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4">
          <Link
            href={user ? "/protected" : "/"}
            className="flex items-center gap-2 font-semibold"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">PropertyCare</span>
          </Link>

          {user && (
            <div className="hidden md:block">
              <AppNav items={NAV_BY_ROLE[user.userType]} />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <NotificationsDropdownWrapper />
                <UserMenu email={user.email} userType={user.userType} />
              </>
            ) : (
              <ButtonLink href="/sign-in" size="sm">
                Sign in
              </ButtonLink>
            )}
          </div>
        </div>

        {/* The nav wraps to its own row on small screens rather than being hidden. */}
        {user && (
          <div className="border-t px-4 py-2 md:hidden">
            <div className="mx-auto max-w-6xl overflow-x-auto">
              <AppNav items={NAV_BY_ROLE[user.userType]} />
            </div>
          </div>
        )}
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
