import { format } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DoorOpen,
  LayoutDashboard,
} from "lucide-react";

import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { ServiceChargeBulkTable } from "@/components/service-charge-bulk-table";
import { toManagedUnit } from "@/lib/managed-unit";
import type { ServiceChargeRow } from "@/components/service-charge-bulk-table";
import { SummaryTile } from "@/components/summary-tile";
import { ButtonLink } from "@/components/ui/button-link";
import { Label } from "@/components/ui/label";
import { PendingLink } from "@/components/ui/pending-link";
import { Select } from "@/components/ui/select";
import { formatMoney, formatMoneyCompact, moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { serviceChargeTone } from "@/lib/service-charge-status";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function ServiceChargesPage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);

  const rawParams = (await searchParams) as unknown as {
    charge?: string;
    property?: string;
    owner?: string;
  } & Message;
  const message = rawParams as Message;
  const chargeFilter =
    typeof rawParams.charge === "string" ? rawParams.charge : "all";
  const propertyFilter =
    typeof rawParams.property === "string" ? rawParams.property : "all";
  const ownerFilter =
    typeof rawParams.owner === "string" ? rawParams.owner : "all";

  const [units, properties, owners, availableTenants, funds] = await Promise.all([
    prisma.unit.findMany({
      where: {
        ...(propertyFilter !== "all" ? { propertyId: propertyFilter } : {}),
        ...(ownerFilter !== "all" ? { ownerId: ownerFilter } : {}),
      },
      orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
      include: {
        property: {
          select: {
            name: true,
            propertyType: {
              select: {
                unitPrefix: true,
                hasFloors: true,
                hasBedrooms: true,
                unitNounSingular: true,
              },
            },
          },
        },
        tenant: { select: { id: true, email: true } },
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
        documents: { orderBy: { createdAt: "desc" } },
        serviceChargeInvoices: {
          orderBy: { issueDate: "desc" },
          select: {
            id: true,
            invoiceNumber: true,
            issueDate: true,
            amountPayable: true,
            fund: { select: { label: true } },
          },
        },
        fundBalances: {
          select: { fundId: true, balance: true, fund: { select: { label: true } } },
        },
        installmentPlans: {
          where: { cancelledAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { installments: { orderBy: { sequence: "asc" } } },
        },
      },
    }),
    prisma.property.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { userType: UserType.owner },
      orderBy: { email: "asc" },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
    prisma.user.findMany({
      where: { userType: UserType.user, unit: null },
      orderBy: { email: "asc" },
      select: { id: true, email: true },
    }),
    prisma.fund.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true },
    }),
  ]);

  // Summary tallies always reflect the property/owner filters above, but
  // never the charge-status pill — same convention as the per-property
  // page's own tiles.
  let overdueCount = 0;
  let overdueAmount = 0;
  let dueSoonCount = 0;
  let dueSoonAmount = 0;
  let okCount = 0;
  let okAmount = 0;
  let noChargeCount = 0;
  for (const unit of units) {
    const tone = serviceChargeTone(unit);
    if (tone === "overdue") {
      overdueCount++;
      overdueAmount += Number(unit.serviceChargeAmount);
    } else if (tone === "dueSoon") {
      dueSoonCount++;
      dueSoonAmount += Number(unit.serviceChargeAmount);
    } else if (tone === "ok") {
      okCount++;
      okAmount += Number(unit.serviceChargeAmount);
    } else {
      noChargeCount++;
    }
  }

  const displayedUnits = units.filter((unit) => {
    if (chargeFilter === "all") return true;
    return serviceChargeTone(unit) === chargeFilter;
  });

  const rows: ServiceChargeRow[] = displayedUnits.map((unit) => {
    const tone = serviceChargeTone(unit);
    const balance = moneyValue(unit.serviceChargeBalance as never);
    const owner = unit.owner;
    const ownerName = owner
      ? [owner.firstName, owner.lastName].filter(Boolean).join(" ")
      : "";
    const lastInvoice = unit.serviceChargeInvoices[0];
    const propertyType = unit.property.propertyType;

    return {
      id: unit.id,
      ownerId: owner?.id ?? null,
      ownerLabel: owner
        ? ownerName
          ? `${ownerName} (${owner.email})`
          : owner.email
        : "Unassigned",
      propertyName: unit.property.name,
      unitLabel: formatUnitLabel(unit.property.propertyType, unit.label),
      amount: unit.serviceChargeAmount
        ? formatMoney(unit.serviceChargeAmount as never)
        : null,
      cycleMonths: unit.serviceChargeCycleMonths,
      dueDate: unit.serviceChargeDueDate
        ? format(unit.serviceChargeDueDate, "d MMM yyyy")
        : null,
      balanceLabel:
        balance < 0
          ? `Credit ${formatMoney(Math.abs(balance))}`
          : balance > 0
            ? formatMoney(balance)
            : formatMoney(0),
      balanceTone: balance < 0 ? "credit" : balance > 0 ? "owed" : "none",
      tone,
      lastInvoice: lastInvoice
        ? {
            id: lastInvoice.id,
            number: lastInvoice.invoiceNumber,
            date: format(lastInvoice.issueDate, "d MMM yyyy"),
          }
        : null,
      invoiceCount: unit.serviceChargeInvoices.length,
      managedUnit: toManagedUnit(unit),
      unitNoun: propertyType.unitNounSingular.toLowerCase(),
      unitNounCap: propertyType.unitNounSingular,
      hasFloors: propertyType.hasFloors,
      hasBedrooms: propertyType.hasBedrooms,
    };
  });

  const buildFilterHref = (
    next: Partial<{ charge: string; property: string; owner: string }>,
  ) => {
    const charge = next.charge ?? chargeFilter;
    const property = next.property ?? propertyFilter;
    const owner = next.owner ?? ownerFilter;
    const query = new URLSearchParams();
    if (charge !== "all") query.set("charge", charge);
    if (property !== "all") query.set("property", property);
    if (owner !== "all") query.set("owner", owner);
    const qs = query.toString();
    return `/protected/service-charge-ledger${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Service Charge Ledger"
        description="Every unit's service charge across every property and owner, in one place — filter it down, or select owners to email in bulk."
      >
        <ButtonLink
          href="/protected/service-charge-ledger/collection-position"
          variant="outline"
        >
          <LayoutDashboard className="h-4 w-4" />
          Collection Position
        </ButtonLink>
      </PageHeader>

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          icon={<AlertCircle className="h-4 w-4" />}
          value={formatMoneyCompact(overdueAmount)}
          label="Overdue"
          sublabel={`${overdueCount} unit${overdueCount === 1 ? "" : "s"}`}
          accent="bg-red-500"
          iconBg="bg-red-50 text-red-600"
          href={buildFilterHref({ charge: chargeFilter === "overdue" ? "all" : "overdue" })}
          active={chargeFilter === "overdue"}
        />
        <SummaryTile
          icon={<Clock className="h-4 w-4" />}
          value={formatMoneyCompact(dueSoonAmount)}
          label="Due soon"
          sublabel={`${dueSoonCount} unit${dueSoonCount === 1 ? "" : "s"}`}
          accent="bg-amber-500"
          iconBg="bg-amber-50 text-amber-600"
          href={buildFilterHref({ charge: chargeFilter === "dueSoon" ? "all" : "dueSoon" })}
          active={chargeFilter === "dueSoon"}
        />
        <SummaryTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          value={formatMoneyCompact(okAmount)}
          label="Up to date"
          sublabel={`${okCount} unit${okCount === 1 ? "" : "s"}`}
          accent="bg-teal-500"
          iconBg="bg-teal-50 text-teal-600"
          href={buildFilterHref({ charge: chargeFilter === "ok" ? "all" : "ok" })}
          active={chargeFilter === "ok"}
        />
        <SummaryTile
          icon={<DoorOpen className="h-4 w-4" />}
          value={noChargeCount}
          label="No charge set"
          accent="bg-slate-400"
          iconBg="bg-slate-50 text-slate-600"
          href={buildFilterHref({ charge: chargeFilter === "none" ? "all" : "none" })}
          active={chargeFilter === "none"}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border/60 bg-card p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status
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
                      <span className={`h-1.5 w-1.5 rounded-full ${filter.dot}`} />
                    )}
                    {filter.label}
                  </PendingLink>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2">
          <form
            action="/protected/service-charge-ledger"
            className="flex flex-wrap items-end gap-2"
          >
            {chargeFilter !== "all" && (
              <input type="hidden" name="charge" value={chargeFilter} />
            )}
            <div className="w-48 space-y-1">
              <Label htmlFor="property-filter" className="text-xs">
                Property
              </Label>
              <Select
                id="property-filter"
                name="property"
                defaultValue={propertyFilter}
                className="h-8 text-xs"
              >
                <option value="all">All properties</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-56 space-y-1">
              <Label htmlFor="owner-filter" className="text-xs">
                Owner
              </Label>
              <Select
                id="owner-filter"
                name="owner"
                defaultValue={ownerFilter}
                className="h-8 text-xs"
              >
                <option value="all">All owners</option>
                {owners.map((owner) => {
                  const name = [owner.firstName, owner.lastName]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <option key={owner.id} value={owner.id}>
                      {name ? `${name} (${owner.email})` : owner.email}
                    </option>
                  );
                })}
              </Select>
            </div>
            <button
              type="submit"
              className="h-8 rounded-lg border border-input px-3 text-xs font-medium hover:bg-muted"
            >
              Apply
            </button>
          </form>
        </div>
      </div>

      <ServiceChargeBulkTable
        rows={rows}
        owners={owners}
        availableTenants={availableTenants}
        funds={funds}
      />
    </div>
  );
}
