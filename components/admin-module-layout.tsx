import { requireAdminModuleIfStaff } from "@/lib/permissions";
import type { AdminModuleKey } from "@/lib/admin-modules";

export async function AdminModuleLayout({
  module,
  children,
}: {
  module: AdminModuleKey;
  children: React.ReactNode;
}) {
  await requireAdminModuleIfStaff(module);
  return children;
}
