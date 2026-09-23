import { AdminModuleLayout } from "@/components/admin-module-layout";
import { LayoutProps } from "@/types/page";

export default function Layout({ children }: LayoutProps) {
  return <AdminModuleLayout module="people">{children}</AdminModuleLayout>;
}
