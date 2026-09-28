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

/** Individual buttons on a property's page — a finer layer than the
 * "Properties" module: an admin can open Properties yet be denied, say,
 * Cash Flow or Owner Report. Stored as grants alongside the modules. */
export const ADMIN_FEATURES: {
  key: AdminModuleKey;
  label: string;
  description: string;
}[] = [
  { key: "prop_building_contracts", label: "Building Contracts", description: "Open a property's building contracts" },
  { key: "prop_tenancy_terms", label: "Tenancy terms", description: "Jump to tenancy terms from a property" },
  { key: "prop_tenant_report", label: "Tenant Report", description: "Per-property tenant report and PDF" },
  { key: "prop_owner_report", label: "Owner Report", description: "Owner portfolio report from a property" },
  { key: "prop_landlord_statement", label: "Landlord Statement", description: "Landlord statement for Independent properties" },
  { key: "prop_services_invoice", label: "Services Invoice", description: "Services invoices for a property" },
  { key: "prop_annual_budget", label: "Annual Budget", description: "Yearly budget and budget PDF" },
  { key: "prop_building_expenses", label: "Building Expenses", description: "Building management expenses report" },
  { key: "prop_management_report", label: "Building Management Report", description: "Building management summary report" },
  { key: "prop_suppliers", label: "Suppliers", description: "Suppliers eligible for a property" },
  { key: "prop_expenses", label: "Expenses", description: "Log and view a property's expenses" },
  { key: "prop_rent_position", label: "Rent Position", description: "Portfolio rent position for a property" },
  { key: "prop_rent_summary", label: "Monthly Rent Summary", description: "All-units monthly rent summary" },
  { key: "prop_invoices", label: "Invoices", description: "Property invoices hub" },
  { key: "prop_unit_ledgers", label: "Unit Ledgers", description: "Per-unit ledgers" },
  { key: "prop_service_charge", label: "Service Charge", description: "Service charge ledger for a property" },
  { key: "prop_collection_position", label: "Collection Position", description: "Service charge collection position" },
  { key: "prop_cash_flow", label: "Cash Flow", description: "Cash flow statement" },
];

/** Which categories of person an admin is allowed to see at all — in the
 * People list, and in every dropdown across the app that picks a tenant,
 * an owner or a worker (assigning a request, starting a tenancy, creating a
 * property, adding a person, ...). An admin without a category unchecked
 * here simply cannot find that kind of person anywhere; it isn't just a
 * hidden tab. Super admins always see everyone. */
export const ADMIN_PEOPLE_VISIBILITY: {
  key: AdminModuleKey;
  label: string;
  description: string;
}[] = [
  { key: "see_workers_in_house", label: "In-house workers", description: "See and assign the company's own staff" },
  { key: "see_workers_third_party", label: "3rd-party vendors", description: "See and assign outside contractors" },
  { key: "see_owners", label: "Property owners", description: "See and pick property owners" },
  { key: "see_tenants", label: "Tenants", description: "See and pick tenants" },
];

/** Whether this admin can download a report as a file at all — separate
 * from being able to open/view the report itself (a module grant above).
 * Applies everywhere a "Download PDF" / "Download Excel" (or CSV) button
 * appears across the app; unticking one just removes that button, the
 * on-screen report stays visible. */
export const ADMIN_DOWNLOAD_PERMISSIONS: {
  key: AdminModuleKey;
  label: string;
  description: string;
}[] = [
  { key: "download_pdf", label: "Download PDF", description: "Every \"Download PDF\" button across reports and statements" },
  { key: "download_excel", label: "Download Excel / CSV", description: "Every \"Download Excel\" / \"Export CSV\" button" },
];

/** What a brand-new regular admin account is granted automatically, the
 * moment it's created — the sensible day-to-day set for someone running
 * the portfolio, minus the things that need a super admin's deliberate
 * say-so (Onboarding, Requests, Communications, Reports, the Suppliers
 * module and its property-page button, QR Code, Dynamics, worker
 * visibility, Excel/CSV downloads). A super admin can still tick or
 * untick anything afterward from Permissions — this only sets the
 * starting point instead of leaving a new admin with nothing granted at
 * all until someone visits that page. */
export const DEFAULT_ADMIN_MODULE_KEYS: AdminModuleKey[] = [
  "dashboard",
  "properties",
  "tenancies",
  "finances",
  "service_charges",
  "invoices",
  "expenses",
  "people",
  "rejections",
  "settings",
  ...ADMIN_FEATURES.map((feature) => feature.key).filter((key) => key !== "prop_suppliers"),
  "see_owners",
  "see_tenants",
  "download_pdf",
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
