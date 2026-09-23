import { UserType } from "@/lib/generated/prisma/client";

/** Company staff who share the admin product surface. Super admins also
 * pass every existing `requireRole(admin)` gate. */
export const STAFF_ADMIN_TYPES: UserType[] = [
  UserType.admin,
  UserType.super_admin,
];

export function isStaffAdmin(userType: UserType): boolean {
  return userType === UserType.admin || userType === UserType.super_admin;
}

export function isSuperAdmin(userType: UserType): boolean {
  return userType === UserType.super_admin;
}

export const USER_TYPE_LABEL: Record<UserType, string> = {
  admin: "Admin",
  super_admin: "Super admin",
  worker: "Worker",
  user: "Tenant",
  owner: "Property owner",
};
