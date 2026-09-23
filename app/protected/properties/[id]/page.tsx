import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Building2,
  ClipboardList,
  DoorOpen,
  FileBarChart,
  FileCheck,
  FileText,
  FileWarning,
  Home,
  KeyRound,
  Landmark,
  type LucideIcon,
  MapPin,
  Phone,
  ScrollText,
  Store,
  Target,
  Trash2,
  TrendingUp,
  UserPlus,
  Wallet,
  Wand2,
  Wrench,
} from "lucide-react";
import { notFound } from "next/navigation";

import {
  createUnitAction,
  generateUnitsAction,
  submitPropertyForApprovalAction,
  updatePropertyAction,
} from "@/app/admin-actions";
import { format } from "date-fns";
import { EmptyState } from "@/components/empty-state";
import { EntityDocumentManager } from "@/components/entity-document-manager";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { PropertyLocationFields } from "@/components/property-location-fields";
import { PropertyUnitsBulkList } from "@/components/property-units-bulk-list";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Tooltip } from "@/components/ui/tooltip";
import { CashFlowStatementModal } from "@/components/cash-flow-statement-modal";
import { PropertyExpensesMenu } from "@/components/property-expenses-menu";
import { RentStatementModal } from "@/components/rent-statement-modal";
import { ServicesInvoiceMenu } from "@/components/services-invoice-menu";
import {
  getActiveSuppliersWithCategories,
  getExpenseCategoriesWithSubcategories,
} from "@/lib/expenses";
import { PendingLink } from "@/components/ui/pending-link";
import { UnitManageModal } from "@/components/unit-manage-modal";
import { toManagedUnit } from "@/lib/managed-unit";
import { formatMoney, formatMoneyCompact } from "@/lib/finance";
import { formatOmanAddress, OMAN_GOVERNORATES } from "@/lib/oman";
import {
  defaultUnitPermissions,
  formatUnitLabel,
  collectsServiceCharge,
  isBuildingManagementType,
  isBuildingType,
  isIndependentType,
  propertyManagementCategory,
  PROPERTY_MANAGEMENT_CATEGORY_LABEL,
  PROPERTY_MANAGEMENT_SCOPE_NOTE,
  type PropertyManagementCategory,
} from "@/lib/property-types";
import { serviceChargeTone } from "@/lib/service-charge-status";
import { getRentPositionData } from "@/lib/rent-position";
import { SummaryTile } from "@/components/summary-tile";
import { cn, personDisplayName } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { requireAnyRole, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

/** A colored badge behind a toolbar button's icon — the property toolbar
 * has a dozen identically-styled outline buttons in a row, and a plain
 * monochrome icon on each makes them hard to tell apart at a glance. */
function ToolbarIcon({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className: string;
}) {
  return (
    <span className={cn("flex items-center justify-center rounded-md p-1", className)}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

/** One glance at the property page should say which of Rawazen's four
 * service scopes this property falls under and what that means in
 * practice — see PROPERTY_MANAGEMENT_SCOPE_NOTE. */
const SCOPE_BANNER_STYLE: Record<
  PropertyManagementCategory,
  { icon: LucideIcon; className: string; iconClassName: string }
> = {
  oa: {
    icon: Landmark,
    className: "border-indigo-200 bg-indigo-50 text-indigo-900",
    iconClassName: "bg-indigo-100 text-indigo-600",
  },
  bm: {
    icon: Building2,
    className: "border-cyan-200 bg-cyan-50 text-cyan-900",
    iconClassName: "bg-cyan-100 text-cyan-600",
  },
  callout: {
    icon: Wrench,
    className: "border-amber-200 bg-amber-50 text-amber-900",
    iconClassName: "bg-amber-100 text-amber-600",
  },
  independent: {
    icon: Home,
    className: "border-violet-200 bg-violet-50 text-violet-900",
    iconClassName: "bg-violet-100 text-violet-600",
  },
};

export default async function PropertyDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const rawParams = (await searchParams) as unknown as {
    owner?: string;
    contract?: string;
    charge?: string;
    occupancy?: string;
    q?: string;
  } & Message;
  const message = rawParams as Message;
  const ownerFilter =
    typeof rawParams.owner === "string" ? rawParams.owner : "all";
  const contractFilter =
    typeof rawParams.contract === "string" ? rawParams.contract : "all";
  const chargeFilter =
    typeof rawParams.charge === "string" ? rawParams.charge : "all";
  const occupancyFilter =
    typeof rawParams.occupancy === "string" ? rawParams.occupancy : "all";
  const search =
    typeof rawParams.q === "string" ? rawParams.q.trim() : "";

  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const isAdmin = isStaffAdmin(user.userType);
  const isOwner = user.userType === UserType.owner;

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      propertyType: true,
      documents: { orderBy: { createdAt: "desc" } },
      units: {
        orderBy: [{ floor: "asc" }, { label: "asc" }],
        include: {
          tenant: {
            select: { id: true, email: true, firstName: true, lastName: true, phone: true },
          },
          owner: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          _count: { select: { requests: true, documents: true } },
          documents: { orderBy: { createdAt: "desc" } },
          tenancies: {
            where: { endDate: null },
            select: {
              id: true,
              monthlyRent: true,
              documents: { orderBy: { createdAt: "desc" } },
            },
            take: 1,
          },
          serviceChargeInvoices: {
            orderBy: { issueDate: "desc" },
            select: {
              id: true,
              invoiceNumber: true,
              issueDate: true,
              dueDate: true,
              graceDays: true,
              periodStart: true,
              periodEnd: true,
              currentAmount: true,
              previousBalance: true,
              amountPayable: true,
              billedOwner: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
            },
          },
          serviceChargePayments: {
            orderBy: { paidAt: "desc" },
            select: {
              id: true,
              amount: true,
              paidAt: true,
              note: true,
              transactionNumber: true,
              originalAmount: true,
              correctionNote: true,
              installment: { select: { id: true } },
              billedOwner: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
            },
          },
          installmentPlans: {
            where: { cancelledAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { installments: { orderBy: { sequence: "asc" } } },
          },
          ownershipTransfers: {
            orderBy: { createdAt: "desc" },
            include: {
              fromOwner: { select: { email: true, firstName: true, lastName: true } },
              toOwner: { select: { email: true, firstName: true, lastName: true } },
              createdBy: { select: { email: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  // An owner can see a property once they own a unit on it — or, before it
  // has any units at all, the brand-new draft they just created (there's no
  // other way to add its first unit and become its owner otherwise).
  const canOwnerAccess =
    !!property &&
    (property.units.length === 0 ||
      property.units.some((unit) => unit.ownerId === user.id));

  if (!property || (isOwner && !canOwnerAccess)) {
    notFound();
  }

  // Tenants who could move in: anyone with the tenant role who isn't already housed.
  const [
    availableTenants,
    propertyTypes,
    owners,
    funds,
    propertySuppliers,
    expenseCategories,
    expenseSuppliers,
    propertyExpenses,
  ] = await Promise.all([
      prisma.user.findMany({
        where: { userType: UserType.user, unit: null },
        orderBy: { email: "asc" },
        select: { id: true, email: true, firstName: true, lastName: true },
      }),
      prisma.propertyType.findMany({ orderBy: { createdAt: "asc" } }),
      isAdmin
        ? prisma.user.findMany({
            where: { userType: UserType.owner },
            select: { id: true, email: true, firstName: true, lastName: true },
            orderBy: { email: "asc" },
          })
        : Promise.resolve([]),
      prisma.fund.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, label: true },
      }),
      // Suppliers this property can use an expense against — either linked
      // to it specifically, or (the common case) available everywhere. Same
      // eligibility rule createExpenseAction/the Building Contracts page use.
      prisma.supplier.findMany({
        where: {
          active: true,
          OR: [
            { availableForAllProperties: true },
            { properties: { some: { propertyId: id } } },
          ],
        },
        orderBy: { companyName: "asc" },
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          phone: true,
          whatsapp: true,
          availableForAllProperties: true,
          availableForEmergencies: true,
          categories: { select: { category: { select: { label: true } } } },
        },
      }),
      getExpenseCategoriesWithSubcategories(),
      getActiveSuppliersWithCategories(),
      // Every expense logged against this property — either property-wide
      // (common area) or against one of its units — for the "View all
      // expenses" modal, newest first.
      prisma.expense.findMany({
        where: {
          OR: [
            { propertyId: id },
            { units: { some: { unit: { propertyId: id } } } },
          ],
        },
        orderBy: { date: "desc" },
        select: {
          id: true,
          date: true,
          description: true,
          amount: true,
          paidBy: true,
          category: { select: { label: true } },
        },
      }),
    ]);

  // A property's owner(s) are the distinct set of its units' owners — units
  // in the same building can belong to different landlords.
  const distinctOwners = Array.from(
    new Map(
      property.units
        .filter((unit) => unit.owner)
        .map((unit) => [unit.owner!.id, unit.owner!]),
    ).values(),
  );
  const ownerLabel =
    distinctOwners.length === 0
      ? "No owner assigned"
      : distinctOwners
          .map((owner) => {
            const name = [owner.firstName, owner.lastName]
              .filter(Boolean)
              .join(" ");
            return name ? `${name} (${owner.email})` : owner.email;
          })
          .join(", ");

  const propertyType = property.propertyType;
  const hasFloors = propertyType.hasFloors;
  const hasBedrooms = propertyType.hasBedrooms;
  const unitNoun = propertyType.unitNounSingular.toLowerCase();
  const unitNounCap = propertyType.unitNounSingular;
  const newUnitDefaults = defaultUnitPermissions(propertyType);
  const isPropertyBuildingType = isBuildingType(propertyType);
  const isPropertyBuildingManagementType = isBuildingManagementType(propertyType);
  const independent = isIndependentType(propertyType);
  const takesServiceCharge = collectsServiceCharge(propertyType);
  const canGenerateUnits = (isAdmin || isOwner) && hasFloors && !independent;
  const canAddUnits =
    (isAdmin || isOwner) && (!independent || property.units.length === 0);
  const managementCategory = propertyManagementCategory(propertyType);
  const tracksRent =
    !isPropertyBuildingType &&
    propertyType.showRentBills &&
    (property.units.length === 0 ||
      property.units.some((unit) => unit.rentBillsEnabled));
  const rentPosition = tracksRent
    ? await getRentPositionData(property.id)
    : null;
  // Only meaningful for "Independent" properties (see the scope banner
  // above) — every unit here that currently has an active tenancy, each
  // getting its own Landlord Statement entry point in the toolbar below.
  const activeStatementTenancies = property.units
    .filter((unit) => unit.tenancies[0])
    .map((unit) => ({
      tenancyId: unit.tenancies[0].id,
      unitLabel: formatUnitLabel(propertyType, unit.label),
      tenantName: unit.tenant ? personDisplayName(unit.tenant) : "Unassigned tenant",
      ownerName: unit.owner ? personDisplayName(unit.owner) : "Unassigned owner",
      propertyName: property.name,
      monthlyRent: Number(unit.tenancies[0].monthlyRent ?? 0),
    }));
  const occupied = property.units.filter((u) => u.tenant).length;
  const scheduledMonthlyRent = property.units.reduce(
    (total, unit) => total + Number(unit.tenancies[0]?.monthlyRent ?? 0),
    0,
  );

  // Shared per-unit status, used for both the row badges and the filters/
  // summary tiles below, so all three always agree with each other — and
  // with the portfolio-wide Service Charge Ledger module, since both call the
  // same lib/service-charge-status.ts helper.
  const chargeToneFor = serviceChargeTone;
  const hasContract = (unit: (typeof property.units)[number]) =>
    unit._count.documents > 0;

  // Service charge totals for the summary tiles — always reflect the whole
  // property, same as the other tiles, regardless of the filters below.
  let serviceChargeDueCount = 0;
  let serviceChargeDueAmount = 0;
  let serviceChargeCollectedCount = 0;
  let serviceChargeCollectedAmount = 0;
  for (const unit of property.units) {
    const tone = chargeToneFor(unit);
    if (tone === "overdue" || tone === "dueSoon") {
      serviceChargeDueCount++;
      serviceChargeDueAmount += Number(unit.serviceChargeAmount);
    } else if (tone === "ok") {
      serviceChargeCollectedCount++;
      serviceChargeCollectedAmount += Number(unit.serviceChargeAmount);
    }
  }

  // OA buildings never bill rent, so the "Scheduled monthly rent" tile is
  // meaningless there — this trio (owners still unassigned, service charge
  // still unconfigured, never invoiced) replaces it instead.
  const unassignedOwnerCount = property.units.filter((u) => !u.ownerId).length;
  const unassignedChargeCount = property.units.filter(
    (u) => !u.serviceChargeAmount,
  ).length;
  const neverInvoicedCount = property.units.filter(
    (u) => u.serviceChargeInvoices.length === 0,
  ).length;

  const searchLower = search.toLowerCase();
  const unitMatchesSearch = (unit: (typeof property.units)[number]) => {
    if (!searchLower) return true;
    const ownerName = unit.owner
      ? [unit.owner.firstName, unit.owner.lastName]
          .filter(Boolean)
          .join(" ")
      : "";
    const haystack = [
      unit.label,
      formatUnitLabel(propertyType, unit.label),
      unit.tenant?.email,
      unit.owner?.email,
      ownerName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchLower);
  };

  // Filters scope only what's displayed below — the summary tiles above
  // always reflect the whole property.
  const displayedUnits = property.units.filter((unit) => {
    if (!unitMatchesSearch(unit)) return false;
    if (ownerFilter === "unassigned" && unit.ownerId) return false;
    if (
      ownerFilter !== "all" &&
      ownerFilter !== "unassigned" &&
      unit.ownerId !== ownerFilter
    ) {
      return false;
    }
    if (contractFilter === "established" && !hasContract(unit)) return false;
    if (
      contractFilter === "needed" &&
      (!unit.owner || hasContract(unit))
    ) {
      return false;
    }
    if (occupancyFilter === "occupied" && !unit.tenant) return false;
    if (occupancyFilter === "empty" && unit.tenant) return false;
    const tone = chargeToneFor(unit);
    if (chargeFilter === "due" && tone !== "overdue" && tone !== "dueSoon") {
      return false;
    }
    if (
      chargeFilter !== "all" &&
      chargeFilter !== "due" &&
      tone !== chargeFilter
    ) {
      return false;
    }
    return true;
  });

  const byFloor = new Map<number | null, typeof property.units>();

  for (const unit of displayedUnits) {
    const list = byFloor.get(unit.floor) ?? [];
    list.push(unit);
    byFloor.set(unit.floor, list);
  }

  const buildFilterHref = (
    next: Partial<{
      owner: string;
      contract: string;
      charge: string;
      occupancy: string;
    }>,
  ) => {
    const owner = next.owner ?? ownerFilter;
    const contract = next.contract ?? contractFilter;
    const charge = next.charge ?? chargeFilter;
    const occupancy = next.occupancy ?? occupancyFilter;
    const query = new URLSearchParams();
    if (owner !== "all") query.set("owner", owner);
    if (contract !== "all") query.set("contract", contract);
    if (charge !== "all") query.set("charge", charge);
    if (occupancy !== "all") query.set("occupancy", occupancy);
    const qs = query.toString();
    return `/protected/properties/${property.id}${qs ? `?${qs}` : ""}`;
  };
  const hasActiveFilter =
    ownerFilter !== "all" ||
    contractFilter !== "all" ||
    chargeFilter !== "all" ||
    occupancyFilter !== "all" ||
    Boolean(search);

  // Shared between the summary tile's modal and the header's "Suppliers"
  // quick-link below — both open the same list, just triggered from two
  // different spots on the page.
  const suppliersModalContent =
    propertySuppliers.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No suppliers are eligible for this property yet.
      </p>
    ) : (
      <div className="max-h-[60vh] space-y-2 overflow-y-auto">
        {propertySuppliers.map((supplier) => (
          <div key={supplier.id} className="rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{supplier.companyName}</p>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                  supplier.availableForAllProperties
                    ? "bg-slate-100 text-slate-600 ring-slate-500/20"
                    : "bg-indigo-50 text-indigo-700 ring-indigo-600/20"
                }`}
              >
                {supplier.availableForAllProperties
                  ? "All properties"
                  : "This property"}
              </span>
            </div>
            {(supplier.contactPerson || supplier.phone || supplier.whatsapp) && (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {supplier.contactPerson && <span>{supplier.contactPerson}</span>}
                {supplier.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {supplier.phone}
                  </span>
                )}
                {supplier.availableForEmergencies && (
                  <span className="font-medium text-amber-700">
                    Available for emergencies
                  </span>
                )}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {supplier.categories.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  No services listed
                </span>
              ) : (
                supplier.categories.map(({ category }) => (
                  <span
                    key={category.label}
                    className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                  >
                    {category.label}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title={property.name}
        description={`${propertyType.label} · ${formatOmanAddress(property)} · Owner: ${ownerLabel}`}
        back={{ href: "/protected/properties", label: "All properties" }}
      />

      {/* One-glance scope note — which of Rawazen's four service scopes
          this property falls under, and what we actually manage here, so
          nobody has to infer it from the flags. */}
      {(() => {
        const style = SCOPE_BANNER_STYLE[managementCategory];
        const ScopeIcon = style.icon;
        return (
          <div className={cn("flex items-start gap-3 rounded-xl border p-4", style.className)}>
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                style.iconClassName,
              )}
            >
              <ScopeIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {PROPERTY_MANAGEMENT_CATEGORY_LABEL[managementCategory]}
              </p>
              <p className="mt-0.5 text-sm">
                {PROPERTY_MANAGEMENT_SCOPE_NOTE[managementCategory]}
              </p>
            </div>
          </div>
        );
      })()}

      {/* One toolbar for everything about this specific property — records
          kept on the property itself, and the cross-module reports/ledgers
          each pre-filtered to it — instead of two mismatched button rows. */}
      <div className="space-y-2.5 rounded-xl border border-border/60 bg-muted/20 p-3">
        <div>
          <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Property records
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Tooltip label="Vendor agreements for this building — lift, fire, pest control, and other shared services.">
              <ButtonLink
                href={`/protected/properties/${property.id}/building-contracts`}
                variant="outline"
                size="sm"
                className="bg-background"
              >
                <ToolbarIcon icon={FileCheck} className="bg-blue-100 text-blue-600" />
                Building Contracts
              </ButtonLink>
            </Tooltip>
            <Tooltip label="Lease terms and tenancy records for units on this property.">
              <ButtonLink
                href="/protected/tenancies"
                variant="outline"
                size="sm"
                className="bg-background"
              >
                <ToolbarIcon icon={KeyRound} className="bg-amber-100 text-amber-600" />
                Tenancy terms
              </ButtonLink>
            </Tooltip>
            <Tooltip label="Occupancy and tenancy details for tenants on this property.">
              <ButtonLink
                href={`/protected/tenancies/report?property=${property.id}`}
                variant="outline"
                size="sm"
                className="bg-background"
              >
                <ToolbarIcon icon={ClipboardList} className="bg-teal-100 text-teal-600" />
                Tenant Report
              </ButtonLink>
            </Tooltip>
            <Tooltip label="Income and charges summary for the owner(s) of this property.">
              <ButtonLink
                href={
                  distinctOwners.length === 1
                    ? `/protected/properties/owner-report?owner=${distinctOwners[0].id}`
                    : "/protected/properties/owner-report"
                }
                variant="outline"
                size="sm"
                className="bg-background"
              >
                <ToolbarIcon icon={FileBarChart} className="bg-purple-100 text-purple-600" />
                Owner Report
              </ButtonLink>
            </Tooltip>
            {managementCategory === "independent" && (
              <Tooltip label="Download the landlord statement — rent collected versus expenses for a tenancy.">
                <RentStatementModal
                  options={activeStatementTenancies}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="bg-background"
                    >
                      <ToolbarIcon icon={Banknote} className="bg-rose-100 text-rose-600" />
                      Landlord Statement
                    </Button>
                  }
                />
              </Tooltip>
            )}
            {(managementCategory === "independent" || managementCategory === "bm") && (
              <ServicesInvoiceMenu
                propertyId={property.id}
                units={property.units.map((unit) => ({
                  unitId: unit.id,
                  unitLabel: formatUnitLabel(propertyType, unit.label),
                  ownerName: unit.owner
                    ? personDisplayName(unit.owner)
                    : "Unassigned owner",
                  tenantName: unit.tenant
                    ? personDisplayName(unit.tenant)
                    : null,
                }))}
              />
            )}
          </div>
        </div>

        <div className="border-t border-border/60 pt-2.5">
          <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reports &amp; ledgers
          </p>
          <div className="flex flex-wrap gap-1.5">
            {managementCategory === "oa" && (
              <Tooltip label="Planned income and expenditure for this property’s budget year.">
                <ButtonLink
                  href={`/protected/properties/${property.id}/budget/${new Date().getFullYear()}`}
                  variant="outline"
                  size="sm"
                  className="bg-background"
                >
                  <ToolbarIcon icon={Wallet} className="bg-emerald-100 text-emerald-600" />
                  Annual Budget
                </ButtonLink>
              </Tooltip>
            )}
            {isPropertyBuildingManagementType && (
              <Tooltip label="Rent collected versus company-paid expenses for the selected period.">
                <ButtonLink
                  href={`/protected/properties/${property.id}/building-management-report`}
                  variant="outline"
                  size="sm"
                  className="bg-background"
                >
                  <ToolbarIcon icon={ScrollText} className="bg-violet-100 text-violet-600" />
                  Building Management Report
                </ButtonLink>
              </Tooltip>
            )}
            {isIndependentType(propertyType) && (
              <Tooltip label="Rent collected versus company-paid expenses for the selected period.">
                <ButtonLink
                  href={`/protected/properties/${property.id}/building-management-report`}
                  variant="outline"
                  size="sm"
                  className="bg-background"
                >
                  <ToolbarIcon icon={Landmark} className="bg-sky-100 text-sky-600" />
                  Summary Report
                </ButtonLink>
              </Tooltip>
            )}
            <Tooltip label="Vendors eligible to work on this property — linked here or available portfolio-wide.">
              <Modal
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-background"
                  >
                    <ToolbarIcon icon={Store} className="bg-indigo-100 text-indigo-600" />
                    Suppliers
                  </Button>
                }
                title="Suppliers"
                description={`Every active supplier eligible for ${property.name} — linked directly, or available portfolio-wide.`}
                icon={
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Store className="h-4 w-4" />
                  </span>
                }
              >
                {suppliersModalContent}
              </Modal>
            </Tooltip>
            <PropertyExpensesMenu
              propertyId={property.id}
              propertyName={property.name}
              back={`/protected/properties/${property.id}`}
              funds={funds}
              expenseFields={{
                properties: [
                  {
                    id: property.id,
                    name: property.name,
                    propertyType: {
                      name: propertyType.name,
                      isOwnerAssociation: propertyType.isOwnerAssociation,
                    },
                  },
                ],
                units: property.units.map((unit) => ({
                  id: unit.id,
                  propertyId: property.id,
                  label: unit.label,
                })),
                categories: expenseCategories,
                suppliers: expenseSuppliers,
              }}
              expenses={propertyExpenses.map((expense) => ({
                id: expense.id,
                date: expense.date,
                description: expense.description,
                amount: String(expense.amount),
                categoryLabel: expense.category.label,
                paidBy: expense.paidBy,
              }))}
            />
            {tracksRent && (
              <Tooltip label="Which units are paid up, due, or overdue on rent.">
                <ButtonLink
                  href={`/protected/finances/rent-position?property=${property.id}`}
                  variant="outline"
                  size="sm"
                  className="bg-background"
                >
                  <ToolbarIcon icon={CircleDollarSign} className="bg-emerald-100 text-emerald-700" />
                  Rent Position
                </ButtonLink>
              </Tooltip>
            )}
            <Tooltip label="Open and billed owner invoices for this property, including unit-level additional charges.">
              <ButtonLink
                href={`/protected/invoices?property=${property.id}&bucket=billed`}
                variant="outline"
                size="sm"
                className="bg-background"
              >
                <ToolbarIcon icon={FileText} className="bg-sky-100 text-sky-700" />
                Invoices
              </ButtonLink>
            </Tooltip>
            {takesServiceCharge && (
              <>
            <Tooltip label="Per-unit service-charge invoices, payments, and balances.">
              <ButtonLink
                href={`/protected/properties/${property.id}/unit-ledgers`}
                variant="outline"
                size="sm"
                className="bg-background"
              >
                <ToolbarIcon icon={ScrollText} className="bg-violet-100 text-violet-600" />
                Unit Ledgers
              </ButtonLink>
            </Tooltip>
            <Tooltip label="Service-charge invoices and collections for this property.">
              <ButtonLink
                href={`/protected/service-charge-ledger?property=${property.id}`}
                variant="outline"
                size="sm"
                className="bg-background"
              >
                <ToolbarIcon icon={Landmark} className="bg-cyan-100 text-cyan-600" />
                Service Charge
              </ButtonLink>
            </Tooltip>
            <Tooltip label="How much service charge is billed versus collected on each unit.">
              <ButtonLink
                href={`/protected/service-charge-ledger/collection-position?property=${property.id}`}
                variant="outline"
                size="sm"
                className="bg-background"
              >
                <ToolbarIcon icon={Target} className="bg-indigo-100 text-indigo-600" />
                Collection Position
              </ButtonLink>
            </Tooltip>
            <Tooltip label="Detailed cash-flow statement — service-charge revenue and expenditure for a date range.">
              <CashFlowStatementModal
                properties={[{ id: property.id, name: property.name }]}
                defaultPropertyId={property.id}
                trigger={
                  <Button type="button" variant="outline" size="sm" className="bg-background">
                    <ToolbarIcon icon={TrendingUp} className="bg-emerald-100 text-emerald-600" />
                    Cash Flow
                  </Button>
                }
              />
            </Tooltip>
              </>
            )}
          </div>
        </div>
      </div>

      {!property.approved && property.rejectedAt && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
              Rejected
            </span>
            <span>
              {isAdmin
                ? "You rejected this submission. It's back in draft — the owner can edit and resubmit it."
                : "An admin rejected your submission on " +
                  format(property.rejectedAt, "d MMM yyyy") +
                  ". Review the note below, fix it up, and submit again."}
            </span>
          </div>
          {property.rejectionReason && (
            <p className="pl-0.5 text-rose-900">
              <span className="font-medium">Reason:</span>{" "}
              {property.rejectionReason}
            </p>
          )}
        </div>
      )}

      {!property.approved && !property.rejectedAt && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            {property.submittedAt ? "Pending approval" : "Draft"}
          </span>
          <span>
            {isAdmin
              ? property.submittedAt
                ? "This property was submitted by its owner and isn't live yet. Approve or reject it from the properties list."
                : "This property is still a draft — the owner hasn't submitted it for review yet."
              : property.submittedAt
                ? "Your property has been submitted and is waiting for an admin to approve it."
                : `Add your ${propertyType.unitNounPlural.toLowerCase()} below, then submit this property for admin review.`}
          </span>
        </div>
      )}

      {isOwner && !property.approved && !property.submittedAt && (
        <form action={submitPropertyForApprovalAction}>
          <input type="hidden" name="propertyId" value={property.id} />
          <SubmitButton
            disabled={property.units.length === 0}
            title={
              property.units.length === 0
                ? `Add at least one ${unitNoun} before submitting.`
                : undefined
            }
          >
            Submit for Approval
          </SubmitButton>
        </form>
      )}

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryTile
          icon={<DoorOpen className="h-4 w-4" />}
          value={property.units.length}
          label={propertyType.unitNounPlural}
          accent="bg-violet-500"
          iconBg="bg-violet-50 text-violet-600"
          href={buildFilterHref({
            owner: "all",
            contract: "all",
            charge: "all",
            occupancy: "all",
          })}
          active={!hasActiveFilter}
        />
        <SummaryTile
          icon={<UserPlus className="h-4 w-4" />}
          value={`${occupied}/${property.units.length}`}
          label="Occupied"
          sublabel={`${property.units.length - occupied} empty`}
          accent="bg-emerald-500"
          iconBg="bg-emerald-50 text-emerald-600"
          href={buildFilterHref({
            occupancy: occupancyFilter === "occupied" ? "all" : "occupied",
          })}
          active={occupancyFilter === "occupied"}
        />
        {isPropertyBuildingType ? (
          <Card className="relative overflow-hidden border-border/60 shadow-sm">
            <span className="absolute inset-x-0 top-0 h-1 bg-rose-500" />
            <CardContent className="flex items-start gap-2 p-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-[11px] leading-snug text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {unassignedOwnerCount}
                  </span>{" "}
                  unassigned owner{unassignedOwnerCount === 1 ? "" : "s"}
                </p>
                <p className="truncate text-[11px] leading-snug text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {unassignedChargeCount}
                  </span>{" "}
                  unassigned service charge
                  {unassignedChargeCount === 1 ? "" : "s"}
                </p>
                <p className="truncate text-[11px] leading-snug text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {neverInvoicedCount}
                  </span>{" "}
                  never invoiced
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <SummaryTile
            icon={<KeyRound className="h-4 w-4" />}
            value={formatMoneyCompact(scheduledMonthlyRent)}
            label="Scheduled monthly rent"
            sublabel={
              rentPosition
                ? `${formatMoneyCompact(rentPosition.totals.totalOutstanding)} outstanding`
                : undefined
            }
            accent="bg-[#0886be]"
            iconBg="bg-[#0886be]/10 text-[#0886be]"
            href={`/protected/finances/rent-position?property=${property.id}`}
          />
        )}
        {takesServiceCharge && (
        <SummaryTile
          icon={<AlertCircle className="h-4 w-4" />}
          value={formatMoneyCompact(serviceChargeDueAmount)}
          label="Service charge due"
          sublabel={`${serviceChargeDueCount} ${serviceChargeDueCount === 1 ? unitNoun : propertyType.unitNounPlural.toLowerCase()}`}
          accent="bg-amber-500"
          iconBg="bg-amber-50 text-amber-600"
          href={buildFilterHref({
            charge: chargeFilter === "due" ? "all" : "due",
          })}
          active={chargeFilter === "due"}
        />
        )}
        {takesServiceCharge && (
        <SummaryTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          value={formatMoneyCompact(serviceChargeCollectedAmount)}
          label="Service charge collected"
          sublabel={`${serviceChargeCollectedCount} ${serviceChargeCollectedCount === 1 ? unitNoun : propertyType.unitNounPlural.toLowerCase()}`}
          accent="bg-teal-500"
          iconBg="bg-teal-50 text-teal-600"
          href={buildFilterHref({
            charge: chargeFilter === "ok" ? "all" : "ok",
          })}
          active={chargeFilter === "ok"}
        />
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_28rem]">
        {/* ── Apartments ─────────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          {isAdmin && (
            <Card className="border-border/60 shadow-sm">
              <CardContent className="space-y-2 p-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Contract
                    </p>
                    <div className="flex flex-wrap gap-0.5 rounded-md bg-muted/50 p-0.5">
                      {[
                        { value: "all", label: "All" },
                        { value: "established", label: "Established" },
                        { value: "needed", label: "Needed" },
                      ].map((filter) => {
                        const active = contractFilter === filter.value;
                        return (
                          <PendingLink
                            key={filter.value}
                            href={buildFilterHref({ contract: filter.value })}
                            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-all ${
                              active
                                ? "bg-white text-foreground shadow-sm ring-1 ring-border/60"
                                : "text-muted-foreground hover:bg-white/60 hover:text-foreground"
                            }`}
                          >
                            {filter.label}
                          </PendingLink>
                        );
                      })}
                    </div>
                  </div>

                  {takesServiceCharge && (
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Charge
                    </p>
                    <div className="flex flex-wrap gap-0.5 rounded-md bg-muted/50 p-0.5">
                      {[
                        { value: "all", label: "All", dot: null },
                        { value: "overdue", label: "Overdue", dot: "bg-red-500" },
                        { value: "dueSoon", label: "Due soon", dot: "bg-amber-500" },
                        { value: "ok", label: "Up to date", dot: "bg-teal-500" },
                        { value: "none", label: "No charge", dot: "bg-slate-400" },
                      ].map((filter) => {
                        const active = chargeFilter === filter.value;
                        return (
                          <PendingLink
                            key={filter.value}
                            href={buildFilterHref({ charge: filter.value })}
                            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-all ${
                              active
                                ? "bg-white text-foreground shadow-sm ring-1 ring-border/60"
                                : "text-muted-foreground hover:bg-white/60 hover:text-foreground"
                            }`}
                          >
                            {filter.dot && (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${filter.dot}`}
                              />
                            )}
                            {filter.label}
                          </PendingLink>
                        );
                      })}
                    </div>
                  </div>
                  )}
                </div>

                <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2">
                  <form
                    action={`/protected/properties/${property.id}`}
                    className="flex flex-wrap items-end gap-2"
                  >
                    {contractFilter !== "all" && (
                      <input type="hidden" name="contract" value={contractFilter} />
                    )}
                    {chargeFilter !== "all" && (
                      <input type="hidden" name="charge" value={chargeFilter} />
                    )}
                    <div className="min-w-48 flex-1 max-w-xs space-y-1">
                      <Label htmlFor="unit-search" className="text-xs">
                        Search
                      </Label>
                      <Input
                        id="unit-search"
                        name="q"
                        defaultValue={search}
                        placeholder={`${unitNounCap} no., tenant or owner…`}
                        className="h-8 text-xs"
                      />
                    </div>
                    {distinctOwners.length > 0 && (
                      <div className="w-full max-w-xs space-y-1">
                        <Label htmlFor="owner-filter" className="text-xs">
                          Owner
                        </Label>
                        <Select
                          id="owner-filter"
                          name="owner"
                          defaultValue={ownerFilter}
                          className="h-8 text-xs"
                        >
                          <option value="all">
                            All owners ({property.units.length}{" "}
                            {propertyType.unitNounPlural.toLowerCase()})
                          </option>
                          {distinctOwners.map((owner) => {
                            const count = property.units.filter(
                              (u) => u.ownerId === owner.id,
                            ).length;
                            const name = [owner.firstName, owner.lastName]
                              .filter(Boolean)
                              .join(" ");
                            return (
                              <option key={owner.id} value={owner.id}>
                                {(name
                                  ? `${name} (${owner.email})`
                                  : owner.email) + ` — ${count}`}
                              </option>
                            );
                          })}
                          {property.units.some((u) => !u.ownerId) && (
                            <option value="unassigned">
                              Unassigned (
                              {property.units.filter((u) => !u.ownerId).length})
                            </option>
                          )}
                        </Select>
                      </div>
                    )}
                    <SubmitButton
                      variant="outline"
                      size="sm"
                      pendingText="Filtering..."
                    >
                      Apply
                    </SubmitButton>
                  </form>
                  {hasActiveFilter && (
                    <ButtonLink
                      href={`/protected/properties/${property.id}`}
                      variant="ghost"
                      size="sm"
                    >
                      Clear all
                    </ButtonLink>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {property.units.length === 0 ? (
            <EmptyState
              icon={DoorOpen}
              title={`No ${propertyType.unitNounPlural.toLowerCase()} yet`}
              description={
                independent
                  ? `Independent properties have exactly one ${unitNoun} — add it from the sidebar if it was not created with the property.`
                  : hasFloors
                  ? `Use "Generate ${propertyType.unitNounPlural.toLowerCase()}" to create them all at once — 10 floors × 5 per floor gives you 50.`
                  : `Use "Add ${unitNoun}" to add them one at a time.`
              }
            />
          ) : displayedUnits.length === 0 ? (
            <EmptyState
              icon={DoorOpen}
              title={`No ${propertyType.unitNounPlural.toLowerCase()} match this filter`}
              description="Clear a filter above to see all of them again."
            />
          ) : (
            <PropertyUnitsBulkList
              propertyId={property.id}
              owners={owners}
              collectsServiceCharge={takesServiceCharge}
              floorGroups={[...byFloor.entries()].map(([floor, units]) => ({
                key: String(floor),
                label: !hasFloors
                  ? propertyType.unitNounPlural
                  : floor === null
                    ? "Unassigned floor"
                    : `Floor ${floor}`,
                occupiedLabel: `${units.filter((u) => u.tenant).length}/${units.length} occupied`,
                units: units.map((unit) => {
                  const unitLabel = propertyType.unitPrefix
                    ? `${propertyType.unitPrefix} ${unit.label}`
                    : unit.label;
                  const chargeTone = chargeToneFor(unit);
                  const hasCharge = chargeTone !== "none";
                  const totalPaid = unit.serviceChargePayments.reduce(
                    (total, payment) => total + Number(payment.amount),
                    0,
                  );
                  const balance = Number(unit.serviceChargeBalance);
                  const activePlan = unit.installmentPlans[0] ?? null;
                  const planPaidCount =
                    activePlan?.installments.filter((i) => i.paidAt)
                      .length ?? 0;

                  return {
                    id: unit.id,
                    content: (
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">
                            {unitLabel}
                          </p>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                              unit.tenant
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                : "bg-slate-50 text-slate-600 ring-slate-500/20"
                            }`}
                          >
                            {unit.tenant ? "Occupied" : "Empty"}
                          </span>
                          {!isPropertyBuildingType && !unit.rentBillsEnabled && (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
                              No billing
                            </span>
                          )}
                          {!isPropertyBuildingType && !unit.maintenanceEnabled && (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
                              No maintenance
                            </span>
                          )}
                          {unit.owner &&
                            (hasContract(unit) ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                                <FileCheck className="h-3 w-3" />
                                Contract on file
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                                <FileWarning className="h-3 w-3" />
                                Contract needed
                              </span>
                            ))}
                          {takesServiceCharge && hasCharge && (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                                chargeTone === "overdue"
                                  ? "bg-red-100 text-red-800 ring-red-600/20"
                                  : chargeTone === "dueSoon"
                                    ? "bg-amber-100 text-amber-800 ring-amber-600/20"
                                    : "bg-slate-50 text-slate-600 ring-slate-500/20"
                              }`}
                            >
                              {formatMoney(unit.serviceChargeAmount as never)}{" "}
                              · Due{" "}
                              {format(
                                unit.serviceChargeDueDate!,
                                "d MMM yyyy",
                              )}
                            </span>
                          )}
                        </div>
                        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          <span>
                            {[
                              hasFloors && unit.floor !== null
                                ? `Floor ${unit.floor}`
                                : null,
                              hasBedrooms && unit.bedrooms
                                ? `${unit.bedrooms} bed`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <span className="text-border">·</span>
                          <span>
                            Owner:{" "}
                            {unit.owner ? (
                              <span className="font-medium text-foreground">
                                {unit.owner.email}
                              </span>
                            ) : (
                              <span className="font-medium text-amber-700">
                                Unassigned
                              </span>
                            )}
                          </span>
                          <span className="text-border">·</span>
                          <span>
                            Tenant:{" "}
                            <span
                              className={
                                unit.tenant
                                  ? "font-medium text-foreground"
                                  : ""
                              }
                            >
                              {unit.tenant ? personDisplayName(unit.tenant) : "—"}
                            </span>
                          </span>
                          {takesServiceCharge && !hasCharge && (
                            <>
                              <span className="text-border">·</span>
                              <span>No service charge</span>
                            </>
                          )}
                          {unit._count.requests > 0 && (
                            <>
                              <span className="text-border">·</span>
                              <span>
                                {unit._count.requests} request
                                {unit._count.requests === 1 ? "" : "s"}
                              </span>
                            </>
                          )}
                        </p>
                        {takesServiceCharge && hasCharge && (
                          <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
                            <span className="font-medium text-emerald-700">
                              Paid {formatMoney(totalPaid)}
                            </span>
                            <span className="text-border">·</span>
                            <span
                              className={
                                balance > 0
                                  ? "font-medium text-rose-700"
                                  : balance < 0
                                    ? "font-medium text-emerald-700"
                                    : "text-muted-foreground"
                              }
                            >
                              {balance > 0
                                ? `Remaining ${formatMoney(balance)}`
                                : balance < 0
                                  ? `Credit ${formatMoney(Math.abs(balance))}`
                                  : "Fully paid"}
                            </span>
                            {activePlan && (
                              <>
                                <span className="text-border">·</span>
                                <span className="text-muted-foreground">
                                  Payment plan: {planPaidCount}/
                                  {activePlan.installments.length}{" "}
                                  installments paid
                                </span>
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    ),
                    manageModal:
                      isAdmin || isOwner ? (
                        <UnitManageModal
                          unit={toManagedUnit(unit)}
                          unitLabel={unitLabel}
                          unitNoun={unitNoun}
                          unitNounCap={unitNounCap}
                          hasFloors={hasFloors}
                          hasBedrooms={hasBedrooms}
                          isAdmin={isAdmin}
                          isBuildingType={isPropertyBuildingType}
                          collectsServiceCharge={takesServiceCharge}
                          canManageDocuments={
                            isAdmin || unit.ownerId === user.id
                          }
                          owners={owners}
                          availableTenants={availableTenants}
                          funds={funds}
                        />
                      ) : null,
                  };
                }),
              }))}
            />
          )}
        </div>

        {/* ── Tools ──────────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          {canGenerateUnits && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wand2 className="h-4 w-4" />
                  Generate {propertyType.unitNounPlural.toLowerCase()}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4">
                  <input type="hidden" name="propertyId" value={property.id} />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="floors">Floors</Label>
                      <Input
                        id="floors"
                        name="floors"
                        type="number"
                        min={1}
                        defaultValue={10}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="perFloor">Per floor</Label>
                      <Input
                        id="perFloor"
                        name="perFloor"
                        type="number"
                        min={1}
                        defaultValue={5}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="startFloor">Start floor</Label>
                      <Input
                        id="startFloor"
                        name="startFloor"
                        type="number"
                        min={0}
                        defaultValue={1}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="entitlements">Unit entitlement (m²)</Label>
                      <Input
                        id="entitlements"
                        name="entitlements"
                        type="number"
                        min={0}
                        placeholder="e.g. 70"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    10 floors × 5 per floor creates{" "}
                    {propertyType.unitNounPlural.toLowerCase()} 101–105,
                    201–205 … 1001–1005. Existing ones are skipped.
                  </p>

                  <SubmitButton
                    formAction={generateUnitsAction}
                    className="w-full"
                    pendingText="Generating..."
                  >
                    Generate
                  </SubmitButton>
                </form>
              </CardContent>
            </Card>
          )}

          {canAddUnits && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add {unitNoun}</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3">
                <input type="hidden" name="propertyId" value={property.id} />

                <div
                  className={`grid gap-2 ${
                    [true, hasFloors, hasBedrooms].filter(Boolean).length === 3
                      ? "grid-cols-3"
                      : [true, hasFloors, hasBedrooms].filter(Boolean).length === 2
                        ? "grid-cols-2"
                        : "grid-cols-1"
                  }`}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="label" className="text-xs">
                      Number
                    </Label>
                    <Input
                      id="label"
                      name="label"
                      placeholder={hasFloors ? "101" : `${unitNounCap} 1`}
                      required
                    />
                  </div>
                  {hasFloors && (
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-floor" className="text-xs">
                        Floor
                      </Label>
                      <Input
                        id="unit-floor"
                        name="floor"
                        type="number"
                        placeholder="1"
                      />
                    </div>
                  )}
                  {hasBedrooms && (
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-beds" className="text-xs">
                        Beds
                      </Label>
                      <Input
                        id="unit-beds"
                        name="bedrooms"
                        type="number"
                        placeholder={hasFloors ? "2" : "4"}
                      />
                    </div>
                  )}
                </div>

                <div
                  className={`grid gap-2 ${isAdmin ? "sm:grid-cols-2" : "grid-cols-1"}`}
                >
                  {isAdmin && (
                    <div className="space-y-1.5">
                      <Label htmlFor="add-unit-owner" className="text-xs">
                        Owner
                      </Label>
                      <Select id="add-unit-owner" name="ownerId" defaultValue="">
                        <option value="">— Unassigned —</option>
                        {owners.map((owner) => (
                          <option key={owner.id} value={owner.id}>
                            {owner.email}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="add-unit-entitlements" className="text-xs">
                      Unit entitlement (m²)
                    </Label>
                    <Input
                      id="add-unit-entitlements"
                      name="entitlements"
                      type="number"
                      min={0}
                      placeholder="e.g. 70"
                    />
                  </div>
                </div>

                {isOwner && (
                  <p className="text-xs text-muted-foreground">
                    You&rsquo;ll be assigned as this {unitNoun}&rsquo;s owner.
                  </p>
                )}

                {!isPropertyBuildingType && (
                  <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        name="rentBillsEnabled"
                        defaultChecked={newUnitDefaults.rentBillsEnabled}
                        className="h-4 w-4 rounded border-input"
                      />
                      Charge rent &amp; bills for this {unitNoun}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        name="maintenanceEnabled"
                        defaultChecked={newUnitDefaults.maintenanceEnabled}
                        className="h-4 w-4 rounded border-input"
                      />
                      Accept maintenance requests
                    </label>
                  </div>
                )}

                <SubmitButton
                  formAction={createUnitAction}
                  variant="outline"
                  className="w-full"
                  pendingText="Adding..."
                >
                  Add {unitNoun}
                </SubmitButton>
              </form>
            </CardContent>
          </Card>
          )}


          <Card>
            <CardHeader>
              <CardTitle className="text-base">Property details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formatOmanAddress(property)}</span>
              </p>
              {property.notes && (
                <p className="text-muted-foreground">{property.notes}</p>
              )}
              {isAdmin && (
              <details className="group rounded-lg border">
                <summary className="cursor-pointer list-none px-3 py-2 text-center text-xs font-medium">
                  Edit Oman address & records
                </summary>
                <form className="space-y-3 border-t p-3">
                  <input type="hidden" name="propertyId" value={property.id} />
                  <div className="space-y-1">
                    <Label htmlFor="property-name" className="text-xs">
                      Name
                    </Label>
                    <Input
                      id="property-name"
                      name="name"
                      defaultValue={property.name}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="property-type" className="text-xs">
                      Property type
                    </Label>
                    <Select
                      id="property-type"
                      name="propertyTypeId"
                      defaultValue={property.propertyTypeId}
                      className="text-xs"
                    >
                      {propertyTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="property-address" className="text-xs">
                      Address / locality
                    </Label>
                    <Input
                      id="property-address"
                      name="address"
                      defaultValue={property.address}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="property-governorate" className="text-xs">
                        Governorate
                      </Label>
                      <Select
                        id="property-governorate"
                        name="governorate"
                        defaultValue={property.governorate ?? "Muscat"}
                        className="text-xs"
                      >
                        {OMAN_GOVERNORATES.map((governorate) => (
                          <option key={governorate} value={governorate}>
                            {governorate}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="property-wilayat" className="text-xs">
                        Wilayat
                      </Label>
                      <Input
                        id="property-wilayat"
                        name="wilayat"
                        defaultValue={property.wilayat ?? ""}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="property-area" className="text-xs">
                      Area / village
                    </Label>
                    <Input
                      id="property-area"
                      name="area"
                      defaultValue={property.area ?? ""}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="property-building-name" className="text-xs">
                        Building name/no.
                      </Label>
                      <Input
                        id="property-building-name"
                        name="buildingName"
                        defaultValue={property.buildingName ?? ""}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="property-way" className="text-xs">
                        Way
                      </Label>
                      <Input
                        id="property-way"
                        name="wayNumber"
                        defaultValue={property.wayNumber ?? ""}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="property-building" className="text-xs">
                        Building no.
                      </Label>
                      <Input
                        id="property-building"
                        name="buildingNumber"
                        defaultValue={property.buildingNumber ?? ""}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="property-postal" className="text-xs">
                        PC
                      </Label>
                      <Input
                        id="property-postal"
                        name="postalCode"
                        defaultValue={property.postalCode ?? ""}
                      />
                    </div>
                  </div>
                  <PropertyLocationFields
                    idPrefix="property-"
                    compact
                    defaultLocationMapPosition={property.locationMapPosition ?? ""}
                    defaultLatitude={property.latitude?.toString() ?? ""}
                    defaultLongitude={property.longitude?.toString() ?? ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    {takesServiceCharge
                      ? `Ownership and service charges are now set per unit — see each ${unitNoun}’s row above.`
                      : `Ownership is set on the ${unitNoun} — this independent property does not take a service charge.`}
                  </p>
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="text-xs font-medium">
                      Invoice letterhead & bank details
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Printed on this property&rsquo;s owner service charge
                      invoices.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {isPropertyBuildingType && (
                      <div className="space-y-1">
                        <Label
                          htmlFor="property-assoc-regn"
                          className="text-xs"
                        >
                          OA number
                        </Label>
                        <Input
                          id="property-assoc-regn"
                          name="associationRegistrationNumber"
                          defaultValue={
                            property.associationRegistrationNumber ?? ""
                          }
                          required
                        />
                      </div>
                      )}
                      <div className="space-y-1">
                        <Label
                          htmlFor="property-assoc-phone"
                          className="text-xs"
                        >
                          Association phone
                        </Label>
                        <Input
                          id="property-assoc-phone"
                          name="associationPhone"
                          defaultValue={property.associationPhone ?? ""}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="property-bank-name" className="text-xs">
                          Bank name
                        </Label>
                        <Input
                          id="property-bank-name"
                          name="bankName"
                          defaultValue={property.bankName ?? ""}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="property-bank-swift" className="text-xs">
                          SWIFT code
                        </Label>
                        <Input
                          id="property-bank-swift"
                          name="bankSwiftCode"
                          defaultValue={property.bankSwiftCode ?? ""}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="property-bank-account" className="text-xs">
                        Bank account number
                      </Label>
                      <Input
                        id="property-bank-account"
                        name="bankAccountNumber"
                        defaultValue={property.bankAccountNumber ?? ""}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor="property-payment-reference"
                        className="text-xs"
                      >
                        Payment reference
                      </Label>
                      <Input
                        id="property-payment-reference"
                        name="paymentReference"
                        defaultValue={property.paymentReference ?? ""}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="property-cheque-to" className="text-xs">
                          Cheques payable to
                        </Label>
                        <Input
                          id="property-cheque-to"
                          name="chequePayableTo"
                          defaultValue={property.chequePayableTo ?? ""}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="property-po-box" className="text-xs">
                          P.O. Box
                        </Label>
                        <Input
                          id="property-po-box"
                          name="poBox"
                          defaultValue={property.poBox ?? ""}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="property-notes" className="text-xs">
                      Notes
                    </Label>
                    <Textarea
                      id="property-notes"
                      name="notes"
                      defaultValue={property.notes ?? ""}
                      className="min-h-16 text-xs"
                    />
                  </div>
                  <SubmitButton
                    formAction={updatePropertyAction}
                    size="sm"
                    className="w-full"
                    pendingText="Saving..."
                  >
                    Save property record
                  </SubmitButton>
                </form>
              </details>
              )}
              {!isPropertyBuildingType && (
                <ButtonLink
                  href={`/protected/maintenance?property=${property.id}`}
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                >
                  View this property&apos;s requests
                </ButtonLink>
              )}
            </CardContent>
          </Card>

          <EntityDocumentManager
            documents={property.documents}
            targetType="property"
            targetId={property.id}
            back={`/protected/properties/${property.id}`}
            title="Property documents"
            readOnly={!isAdmin}
            description="Title deed, ownership certificate, building approvals, insurance and other private property records."
          />
        </div>
      </div>
    </div>
  );
}



