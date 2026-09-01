"use client";

import { KeyRound, LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/app/actions";
import { LinkPendingIndicator } from "@/components/link-pending-indicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserType } from "@/lib/generated/prisma/client";

const ROLE_LABEL: Record<UserType, string> = {
  admin: "Administrator",
  worker: "Maintenance worker",
  user: "Tenant",
};

export function UserMenu({
  email,
  userType,
}: {
  email: string;
  userType: UserType;
}) {
  const initial = email.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          aria-label="Account menu"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{email}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {ROLE_LABEL[userType]}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/protected/reset-password" className="cursor-pointer">
            <KeyRound className="mr-2 h-4 w-4" />
            Change password
            <LinkPendingIndicator />
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <form action={signOutAction}>
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
