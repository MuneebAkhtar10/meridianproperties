import { AdminModuleLayout } from "@/components/admin-module-layout";
import { TenantModuleLayout } from "@/components/tenant-module-layout";
import { LayoutProps } from "@/types/page";

export default function Layout({ children }: LayoutProps) {
  return (
    <AdminModuleLayout module="finances">
      <TenantModuleLayout module="finances">{children}</TenantModuleLayout>
    </AdminModuleLayout>
  );
}
