import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  ADMIN_MODULES,
  ADMIN_NAV_ITEMS,
  ADMIN_TOOLBAR_ITEMS,
  type AdminModuleKey,
} from "@/lib/admin-modules";
import type { NavItem } from "@/components/app-nav";
import type { ToolbarItem } from "@/components/app-topbar";
import { requireUser, type SessionUser } from "@/lib/session";
import { isStaffAdmin, isSuperAdmin } from "@/lib/user-roles";

export const ALL_ADMIN_MODULE_KEYS = ADMIN_MODULES.map((module) => module.key);

function isMissingRelation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "P2021" ||
      (error as { code?: string }).code === "P2010")
  );
}

export const grantedAdminModules = cache(async (userId: string): Promise<Set<AdminModuleKey>> => {
  try {
    const rows = await prisma.adminModuleGrant.findMany({
      where: { userId },
      select: { module: true },
    });
    return new Set(rows.map((row) => row.module));
  } catch (error) {
    if (!isMissingRelation(error)) throw error;
    return new Set(ALL_ADMIN_MODULE_KEYS);
  }
});

export async function hasAdminModule(
  user: Pick<SessionUser, "id" | "userType">,
  module: AdminModuleKey,
): Promise<boolean> {
  if (!isStaffAdmin(user.userType)) return false;
  if (isSuperAdmin(user.userType)) return true;
  const granted = await grantedAdminModules(user.id);
  return granted.has(module);
}

export async function canManagePermissions(
  user: Pick<SessionUser, "id" | "userType">,
): Promise<boolean> {
  return isSuperAdmin(user.userType);
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isSuperAdmin(user.userType)) {
    redirect("/protected");
  }
  return user;
}

export async function requireAdminModule(module: AdminModuleKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaffAdmin(user.userType)) {
    redirect("/protected");
  }
  if (!(await hasAdminModule(user, module))) {
    redirect("/protected");
  }
  return user;
}

/** For pages shared with owners: owners pass through; staff admins need the module. */
export async function requireAdminModuleIfStaff(module: AdminModuleKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaffAdmin(user.userType)) return user;
  if (!(await hasAdminModule(user, module))) {
    redirect("/protected");
  }
  return user;
}

export async function staffAdminNavItems(user: SessionUser): Promise<NavItem[]> {
  const items: NavItem[] = [];
  if (isSuperAdmin(user.userType)) {
    items.push(
      ...ADMIN_NAV_ITEMS.map(({ href, label, icon }) => ({ href, label, icon })),
    );
    items.push({
      href: "/protected/admin/permissions",
      label: "Permissions",
      icon: "permissions",
    });
    return items;
  }

  const granted = await grantedAdminModules(user.id);
  for (const item of ADMIN_NAV_ITEMS) {
    if (granted.has(item.module)) {
      items.push({ href: item.href, label: item.label, icon: item.icon });
    }
  }
  return items;
}

export async function staffAdminToolbarItems(user: SessionUser): Promise<ToolbarItem[]> {
  if (isSuperAdmin(user.userType)) {
    return ADMIN_TOOLBAR_ITEMS.map(({ href, label, icon }) => ({ href, label, icon }));
  }
  const granted = await grantedAdminModules(user.id);
  return ADMIN_TOOLBAR_ITEMS.filter((item) => granted.has(item.module)).map(
    ({ href, label, icon }) => ({ href, label, icon }),
  );
}

export async function firstAllowedAdminHref(user: SessionUser): Promise<string> {
  if (isSuperAdmin(user.userType)) return "/protected";
  const granted = await grantedAdminModules(user.id);
  if (granted.has("dashboard")) return "/protected";
  const next = ADMIN_NAV_ITEMS.find((item) => granted.has(item.module));
  if (next) return next.href;
  const toolbar = ADMIN_TOOLBAR_ITEMS.find((item) => granted.has(item.module));
  if (toolbar) return toolbar.href;
  return "/protected";
}
