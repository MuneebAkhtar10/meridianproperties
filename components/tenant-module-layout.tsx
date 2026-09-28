import { requireTenantModuleIfTenant } from "@/lib/permissions";
import type { TenantModuleKey } from "@/lib/tenant-modules";

export async function TenantModuleLayout({
  module,
  children,
}: {
  module: TenantModuleKey;
  children: React.ReactNode;
}) {
  await requireTenantModuleIfTenant(module);
  return children;
}
