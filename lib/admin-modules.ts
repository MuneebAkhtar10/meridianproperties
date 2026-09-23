import type { AdminModule } from "@/lib/generated/prisma/client";
import type { NavIconKey } from "@/components/app-nav";

export type AdminModuleKey = AdminModule;

export const ADMIN_MODULES: {
  key: AdminModuleKey;
  label: string;
  description: string;
}[] = [
  { key: "dashboard", label: "Dashboard", description: "Home snapshot and shortcuts" },
  { key: "onboarding", label: "Onboarding", description: "Property onboarding checklist" },
  { key: "properties", label: "Properties", description: "Buildings, units, budgets and statements" },
  { key: "tenancies", label: "Tenancies", description: "Leases and agreements" },
  { key: "maintenance", label: "Requests", description: "Maintenance jobs" },
  { key: "finances", label: "Rent & Bills", description: "Charges, rent position and cheques" },
  { key: "service_charges", label: "Service Charge Ledger", description: "OA charges, collection and invoices" },
  { key: "invoices", label: "Invoices", description: "Billing hub" },
  { key: "expenses", label: "Expenses", description: "Spend and cash flow" },
  { key: "communications", label: "Communications", description: "Logged conversations" },
  { key: "reports", label: "Reports", description: "Portfolio reports" },
  { key: "suppliers", label: "Suppliers", description: "Vendor directory" },
  { key: "people", label: "People", description: "Users, workers and owners" },
  { key: "rejections", label: "Rejections", description: "Rejected properties and payments" },
  { key: "qr_code", label: "QR Code", description: "Tenant check-in QR" },
  { key: "dynamics", label: "Dynamics 365", description: "ERP connection" },
  { key: "settings", label: "Settings", description: "Property types and storage" },
];

export const ADMIN_NAV_ITEMS: {
  href: string;
  label: string;
  icon: NavIconKey;
  module: AdminModuleKey;
}[] = [
  { href: "/protected", label: "Dashboard", icon: "dashboard", module: "dashboard" },
  { href: "/protected/onboarding", label: "Onboarding", icon: "onboarding", module: "onboarding" },
  { href: "/protected/properties", label: "Properties", icon: "properties", module: "properties" },
  { href: "/protected/tenancies", label: "Tenancies", icon: "tenancies", module: "tenancies" },
  { href: "/protected/maintenance", label: "Requests", icon: "requests", module: "maintenance" },
  { href: "/protected/finances", label: "Rent & Bills", icon: "rentAndBills", module: "finances" },
  {
    href: "/protected/service-charge-ledger",
    label: "Service Charge Ledger",
    icon: "serviceCharges",
    module: "service_charges",
  },
  { href: "/protected/invoices", label: "Invoices", icon: "invoices", module: "invoices" },
  { href: "/protected/expenses", label: "Expenses", icon: "expenses", module: "expenses" },
  {
    href: "/protected/communications",
    label: "Communications",
    icon: "communications",
    module: "communications",
  },
  { href: "/protected/reports", label: "Reports", icon: "reports", module: "reports" },
  { href: "/protected/admin/suppliers", label: "Suppliers", icon: "suppliers", module: "suppliers" },
  { href: "/protected/users", label: "People", icon: "people", module: "people" },
];

export const ADMIN_TOOLBAR_ITEMS: {
  href: string;
  label: string;
  icon: "rejections" | "qrCode" | "dynamics";
  module: AdminModuleKey;
}[] = [
  { href: "/protected/rejections", label: "Rejections", icon: "rejections", module: "rejections" },
  { href: "/protected/admin/qr-code", label: "QR Code", icon: "qrCode", module: "qr_code" },
  { href: "/protected/admin/dynamics", label: "Dynamics 365", icon: "dynamics", module: "dynamics" },
];

const PATH_RULES: { prefix: string; module: AdminModuleKey | "permissions" | "public" }[] = [
  { prefix: "/protected/admin/permissions", module: "permissions" },
  { prefix: "/protected/reset-password", module: "public" },
  { prefix: "/protected/onboarding", module: "onboarding" },
  { prefix: "/protected/properties", module: "properties" },
  { prefix: "/protected/tenancies", module: "tenancies" },
  { prefix: "/protected/maintenance", module: "maintenance" },
  { prefix: "/protected/finances", module: "finances" },
  { prefix: "/protected/service-charge-ledger", module: "service_charges" },
  { prefix: "/protected/invoices", module: "invoices" },
  { prefix: "/protected/expenses", module: "expenses" },
  { prefix: "/protected/communications", module: "communications" },
  { prefix: "/protected/reports", module: "reports" },
  { prefix: "/protected/admin/suppliers", module: "suppliers" },
  { prefix: "/protected/users", module: "people" },
  { prefix: "/protected/rejections", module: "rejections" },
  { prefix: "/protected/admin/qr-code", module: "qr_code" },
  { prefix: "/protected/admin/dynamics", module: "dynamics" },
  { prefix: "/protected/admin/property-types", module: "settings" },
  { prefix: "/protected/admin/storage-setup", module: "settings" },
  { prefix: "/api/properties", module: "properties" },
  { prefix: "/api/tenancies", module: "tenancies" },
  { prefix: "/api/expenses", module: "expenses" },
  { prefix: "/api/finances", module: "finances" },
  { prefix: "/api/service-charge", module: "service_charges" },
  { prefix: "/api/units", module: "properties" },
  { prefix: "/api/building-contracts", module: "properties" },
  { prefix: "/protected", module: "dashboard" },
];

export function adminModuleForPath(pathname: string): AdminModuleKey | "permissions" | "public" | null {
  const path = pathname.split("?")[0];
  for (const rule of PATH_RULES) {
    if (rule.prefix === "/protected") {
      if (path === "/protected" || path === "/protected/") return rule.module;
      continue;
    }
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return rule.module;
    }
  }
  return null;
}
