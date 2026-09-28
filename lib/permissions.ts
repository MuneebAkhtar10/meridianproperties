import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  ADMIN_DOWNLOAD_PERMISSIONS,
  ADMIN_FEATURES,
  ADMIN_MODULES,
  ADMIN_NAV_ITEMS,
  ADMIN_PEOPLE_VISIBILITY,
  ADMIN_TOOLBAR_ITEMS,
  type AdminModuleKey,
} from "@/lib/admin-modules";
import {
  ALL_TENANT_MODULE_KEYS,
  TENANT_NAV_ITEMS,
  type TenantModuleKey,
} from "@/lib/tenant-modules";
import { UserType } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { NavItem } from "@/components/app-nav";
import type { ToolbarItem } from "@/components/app-topbar";
import { requireUser, type SessionUser } from "@/lib/session";
import { isStaffAdmin, isSuperAdmin } from "@/lib/user-roles";

export const ALL_ADMIN_MODULE_KEYS = [
  ...ADMIN_MODULES,
  ...ADMIN_FEATURES,
  ...ADMIN_PEOPLE_VISIBILITY,
  ...ADMIN_DOWNLOAD_PERMISSIONS,
].map((module) => module.key);

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

export const grantedTenantModules = cache(async (): Promise<Set<TenantModuleKey>> => {
  try {
    const rows = await prisma.tenantModuleGrant.findMany({
      select: { module: true },
    });
    return new Set(rows.map((row) => row.module));
  } catch (error) {
    if (!isMissingRelation(error)) throw error;
    return new Set(ALL_TENANT_MODULE_KEYS);
  }
});

export async function hasTenantModule(module: TenantModuleKey): Promise<boolean> {
  const granted = await grantedTenantModules();
  return granted.has(module);
}

export async function requireTenantModuleIfTenant(
  module: TenantModuleKey,
): Promise<SessionUser> {
  const user = await requireUser();
  if (user.userType !== UserType.user) return user;
  if (!(await hasTenantModule(module))) {
    redirect(await firstAllowedTenantHref());
  }
  return user;
}

export async function tenantNavItems(): Promise<NavItem[]> {
  const granted = await grantedTenantModules();
  return TENANT_NAV_ITEMS.filter((item) => granted.has(item.module)).map(
    ({ href, label, icon }) => ({ href, label, icon }),
  );
}

export async function firstAllowedTenantHref(): Promise<string> {
  const granted = await grantedTenantModules();
  if (granted.has("dashboard")) return "/protected";
  const next = TENANT_NAV_ITEMS.find((item) => granted.has(item.module));
  return next?.href ?? "/protected";
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

/**
 * What a viewer may use on a page: staff admins get exactly their grants
 * (super admins everything); anyone else (owners, tenants) is not limited
 * by admin permissions, so `can` is always true for them.
 */
export async function adminAccess(
  user: Pick<SessionUser, "id" | "userType">,
): Promise<{ can: (key: AdminModuleKey) => boolean }> {
  if (!isStaffAdmin(user.userType) || isSuperAdmin(user.userType)) {
    return { can: () => true };
  }
  const granted = await grantedAdminModules(user.id);
  return { can: (key) => granted.has(key) };
}

/** A category of person, matching one of ADMIN_PEOPLE_VISIBILITY's keys.
 * "worker" without a category means "either kind" — used where the caller
 * doesn't yet know which (e.g. a plain `userType: worker` lookup). */
export type PersonCategory = "worker_in_house" | "worker_third_party" | "owner" | "tenant";

const PERSON_CATEGORY_MODULE: Record<PersonCategory, AdminModuleKey> = {
  worker_in_house: "see_workers_in_house",
  worker_third_party: "see_workers_third_party",
  owner: "see_owners",
  tenant: "see_tenants",
};

/** Which categories of person this admin can see at all — in the People
 * list and in every dropdown that picks a tenant, owner or worker
 * elsewhere in the app. Owners and tenants themselves, and super admins,
 * always see everyone; a regular admin is limited to what's been granted. */
export async function visiblePersonCategories(
  user: Pick<SessionUser, "id" | "userType">,
): Promise<Set<PersonCategory>> {
  const all = new Set<PersonCategory>(["worker_in_house", "worker_third_party", "owner", "tenant"]);
  if (!isStaffAdmin(user.userType) || isSuperAdmin(user.userType)) return all;
  const granted = await grantedAdminModules(user.id);
  return new Set(
    (Object.keys(PERSON_CATEGORY_MODULE) as PersonCategory[]).filter((category) =>
      granted.has(PERSON_CATEGORY_MODULE[category]),
    ),
  );
}

/** A Prisma `User` filter that only matches people in categories this admin
 * can see — AND this into any query that lists/searches tenants, owners or
 * workers so a restricted category simply doesn't come back, the same as
 * if those accounts didn't exist. Returns `{ id: "" }` (matches nothing)
 * when a plain "worker" query has neither worker category visible, so the
 * caller's own userType filter isn't accidentally widened. */
export function personVisibilityWhere(
  visible: Set<PersonCategory>,
): Prisma.UserWhereInput {
  const clauses: Prisma.UserWhereInput[] = [];
  if (visible.has("owner")) clauses.push({ userType: UserType.owner });
  if (visible.has("tenant")) clauses.push({ userType: UserType.user });
  if (visible.has("worker_in_house") && visible.has("worker_third_party")) {
    clauses.push({ userType: UserType.worker });
  } else if (visible.has("worker_in_house")) {
    clauses.push({
      userType: UserType.worker,
      OR: [{ workerCategory: "in_house" }, { workerCategory: null }],
    });
  } else if (visible.has("worker_third_party")) {
    clauses.push({ userType: UserType.worker, workerCategory: "third_party" });
  }
  // Admins themselves are always visible regardless of person-category grants.
  clauses.push({ userType: { in: [UserType.admin, UserType.super_admin] } });
  return { OR: clauses };
}
