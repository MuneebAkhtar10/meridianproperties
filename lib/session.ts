import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { UserType } from "@/lib/generated/prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  userType: UserType;
};

/**
 * The signed-in user, or null.
 *
 * The role is re-read from the database rather than trusted from the Supabase
 * JWT, so that an admin changing someone's role takes effect on their next
 * request instead of whenever their token happens to refresh.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: authUser.id },
    select: { id: true, email: true, userType: true },
  });
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}

export async function requireRole(role: UserType): Promise<SessionUser> {
  const user = await requireUser();

  if (user.userType !== role) {
    redirect("/protected");
  }

  return user;
}

/** Like requireRole, but accepts any of several roles — e.g. admin-or-owner
 * screens that are otherwise identical to the admin one but scoped down. */
export async function requireAnyRole(
  ...types: UserType[]
): Promise<SessionUser> {
  const user = await requireUser();

  if (!types.includes(user.userType)) {
    redirect("/protected");
  }

  return user;
}
