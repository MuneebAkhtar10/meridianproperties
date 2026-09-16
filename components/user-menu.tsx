"use client";

import { KeyRound, LogOut } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/app/actions";
import { LinkPendingIndicator } from "@/components/link-pending-indicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserType } from "@/lib/generated/prisma/client";

const ROLE_LABEL: Record<UserType, string> = {
  admin: "Admin",
  worker: "Maintenance worker",
  user: "Tenant",
  owner: "Property owner",
};

/**
 * The sidebar's bottom-of-column identity card — name, email and role badge,
 * doubling as the trigger for the account dropdown (change password, sign
 * out). Quick-access admin links (Rejections, QR Code, Dynamics 365) live in
 * the top toolbar instead — see `AppTopbar` — so this menu stays focused on
 * the account itself.
 */
export function UserMenu({
  email,
  userType,
  firstName,
  lastName,
}: {
  email: string;
  userType: UserType;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const initial = (name || email).charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-muted"
          aria-label="Account menu"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {name || email}
            </span>
            {name && (
              <span className="block truncate text-xs text-muted-foreground">
                {email}
              </span>
            )}
            <span className="mt-0.5 inline-flex items-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-foreground">
              {ROLE_LABEL[userType]}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="top" className="w-60">
        <DropdownMenuItem asChild>
          <Link href="/protected/reset-password" className="cursor-pointer">
            <KeyRound className="mr-2 h-4 w-4" />
            Change password
            <LinkPendingIndicator />
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
