import type { TenantModule } from "@/lib/generated/prisma/client";
import type { NavIconKey } from "@/components/app-nav";

export type TenantModuleKey = TenantModule;

export const TENANT_MODULES: {
  key: TenantModuleKey;
  label: string;
  description: string;
}[] = [
  { key: "dashboard", label: "Dashboard", description: "Home snapshot for the tenant" },
  { key: "requests", label: "My Requests", description: "The tenant's maintenance jobs" },
  { key: "finances", label: "Rent & Bills", description: "Charges, ledger and payment proof" },
  { key: "documents", label: "My Documents", description: "The tenant's uploaded documents" },
  { key: "report", label: "Report Issue", description: "Submit a new maintenance request" },
];

export const ALL_TENANT_MODULE_KEYS = TENANT_MODULES.map((module) => module.key);

export const TENANT_NAV_ITEMS: {
  href: string;
  label: string;
  icon: NavIconKey;
  module: TenantModuleKey;
}[] = [
  { href: "/protected", label: "Dashboard", icon: "dashboard", module: "dashboard" },
  { href: "/protected/requests", label: "My Requests", icon: "requests", module: "requests" },
  { href: "/protected/finances", label: "Rent & Bills", icon: "rentAndBills", module: "finances" },
  { href: "/protected/documents", label: "My Documents", icon: "documents", module: "documents" },
  { href: "/protected/report", label: "Report Issue", icon: "report", module: "report" },
];
