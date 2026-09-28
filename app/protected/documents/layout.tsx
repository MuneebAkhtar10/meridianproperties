import { TenantModuleLayout } from "@/components/tenant-module-layout";
import { LayoutProps } from "@/types/page";

export default function Layout({ children }: LayoutProps) {
  return <TenantModuleLayout module="documents">{children}</TenantModuleLayout>;
}
