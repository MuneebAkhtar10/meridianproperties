"use server";

import { revalidatePath } from "next/cache";

import { ADMIN_FEATURES, ADMIN_MODULES, type AdminModuleKey } from "@/lib/admin-modules";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { UserType } from "@/lib/generated/prisma/client";
import { encodedRedirect } from "@/utils/utils";

const MODULE_KEYS = new Set([...ADMIN_MODULES, ...ADMIN_FEATURES].map((module) => module.key));

export async function saveAdminPermissionsAction(formData: FormData) {
  const actor = await requireSuperAdmin();

  const userId = formData.get("userId")?.toString();
  if (!userId) {
    return encodedRedirect(
      "error",
      "/protected/admin/permissions",
      "Choose an admin to update.",
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, userType: true, email: true },
  });
  if (!target || target.userType !== UserType.admin) {
    return encodedRedirect(
      "error",
      "/protected/admin/permissions",
      "Permissions can only be set for regular admins.",
    );
  }
  if (target.id === actor.id) {
    return encodedRedirect(
      "error",
      "/protected/admin/permissions",
      "Your own access is not limited by this list.",
    );
  }

  const selected = formData
    .getAll("modules")
    .map((value) => value.toString())
    .filter((value): value is AdminModuleKey => MODULE_KEYS.has(value as AdminModuleKey));

  // One delete + one bulk insert (2 round trips) — creating each grant
  // separately blew past the 5s transaction timeout now that there are
  // 30+ possible grants over a remote database.
  await prisma.$transaction(
    [
      prisma.adminModuleGrant.deleteMany({ where: { userId } }),
      prisma.adminModuleGrant.createMany({
        data: [...new Set(selected)].map((module) => ({ userId, module })),
        skipDuplicates: true,
      }),
    ],
  );

  revalidatePath("/protected/admin/permissions");
  revalidatePath("/", "layout");

  return encodedRedirect(
    "success",
    "/protected/admin/permissions",
    `Saved permissions for ${target.email}.`,
  );
}
