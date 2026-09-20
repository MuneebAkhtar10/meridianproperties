import { format } from "date-fns";
import {
  AlertCircle,
  Banknote,
  Calendar,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  Clock,
  Download,
  Layers,
  Receipt,
  ScrollText,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SummaryTile } from "@/components/summary-tile";
import { UnitManageModal } from "@/components/unit-manage-modal";
import { ButtonLink } from "@/components/ui/button-link";
import { Label } from "@/components/ui/label";
import { PendingLink } from "@/components/ui/pending-link";
import { Select } from "@/components/ui/select";
import { formatMoney, formatMoneyCompact } from "@/lib/finance";
import {
  filterCollectionPositionRows,
  getCollectionPositionData,
  type CollectionPositionBucketFilter,
  type CollectionPositionRow,
} from "@/lib/collection-position";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

type BucketFilter = CollectionPositionBucketFilter;

/** One clear, at-a-glance badge per row — paid off outranks every urgency
 * bucket (a unit that's settled isn't "due soon" in any way that matters
 * here), otherwise falls back to whichever due-date bucket applies, or
 * how much of the outstanding balance has been chipped away at. */
function statusBadge(row: CollectionPositionRow): { label: string; className: string } {
  if (row.raised > 0 && row.outstanding <= 0) {
    return { label: "Paid", className: "bg-emerald-50 text-emerald-700" };
  }
  switch (row.bucket) {
    case "overdue":
      return { label: "Overdue", className: "bg-red-50 text-red-700" };
    case "dueToday":
      return { label: "Due Today", className: "bg-orange-50 text-orange-700" };
    case "dueSoon":
      return { label: "Due Soon", className: "bg-amber-50 text-amber-700" };
    case "dueThisMonth":
      return { label: "Due This Month", className: "bg-yellow-50 text-yellow-700" };
    case "none":
      return { label: "No Charge", className: "bg-slate-100 text-slate-600" };
    default:
      return row.hasPaid
        ? { label: "Part Paid", className: "bg-sky-50 text-sky-700" }
        : { label: "Outstanding", className: "bg-slate-50 text-slate-600" };
  }
}

/**
 * Spec #18 "OA Collection Position" — a portfolio-wide operational
 * dashboard, distinct from the Service Charge Ledger's own status pills
 * (Overdue/Due soon/Up to date/No charge): every tile here is clickable
 * (spec: "17 Overdue Units opens the 17 records") and the record table
 * below always shows the exact spec columns: Owner | Building | Floor |
 * Unit | Amount Due | Amount Paid | Outstanding | Due Date | Days Overdue
 * | Last Reminder | Payment Arrangement.
 */
export default async function CollectionPositionPage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);

  const rawParams = (await searchParams) as unknown as {
    bucket?: string;
    property?: string;
  };
  const bucketFilter = (rawParams.bucket ?? "all") as BucketFilter;
  const propertyFilter =
    typeof rawParams.property === "string" ? rawParams.property : "all";

  const [{ rows, totals }, properties, owners, availableTenants, funds] =
    await Promise.all([
      getCollectionPositionData(propertyFilter),
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
        select: { id: true, email: true, firstName: true, lastName: true },
      }),
      prisma.fund.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true },
      }),
    ]);
  const {
    totalRaised,
    totalCollected,
    totalOutstanding,
    overdueCount,
    dueTodayCount,
    dueSoonCount,
    dueThisMonthCount,
    partPaidCount,
    noPaymentCount,
    paymentPlanCount,
    collectedUnitCount,
  } = totals;

  const buildHref = (next: Partial<{ bucket: BucketFilter; property: string }>) => {
    const bucket = next.bucket ?? bucketFilter;
    const property = next.property ?? propertyFilter;
    const query = new URLSearchParams();
    if (bucket !== "all") query.set("bucket", bucket);
    if (property !== "all") query.set("property", property);
    const qs = query.toString();
    return `/protected/service-charge-ledger/collection-position${qs ? `?${qs}` : ""}`;
  };

  const pdfHref = (() => {
    const query = new URLSearchParams();
    if (bucketFilter !== "all") query.set("bucket", bucketFilter);
    if (propertyFilter !== "all") query.set("property", propertyFilter);
    const qs = query.toString();
    return `/api/service-charge-ledger/collection-position/pdf${qs ? `?${qs}` : ""}`;
  })();

  const displayedRows = filterCollectionPositionRows(rows, bucketFilter);

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Collection Position"
        description="Total service charges raised vs. collected, portfolio-wide — every number below is clickable."
        back={{
          href: "/protected/service-charge-ledger",
          label: "Service Charge Ledger",
        }}
      >
        <ButtonLink href={pdfHref} target="_blank" variant="outline">
          <Download className="h-4 w-4" />
          Download PDF
        </ButtonLink>
      </PageHeader>

      <form className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="collection-property" className="text-xs">
            Property
          </Label>
          <Select id="collection-property" name="property" defaultValue={propertyFilter}>
            <option value="all">All properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg border px-4 text-sm font-medium hover:bg-muted"
        >
          Apply
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryTile
          icon={<Receipt className="h-4 w-4" />}
          value={formatMoneyCompact(totalRaised)}
          label="Total Service Charges Raised"
          accent="bg-indigo-500"
          iconBg="bg-indigo-50 text-indigo-600"
          href={buildHref({ bucket: bucketFilter === "raised" ? "all" : "raised" })}
          active={bucketFilter === "raised"}
        />
        <SummaryTile
          icon={<Banknote className="h-4 w-4" />}
          value={formatMoneyCompact(totalCollected)}
          label="Collected"
          sublabel={`${collectedUnitCount} unit${collectedUnitCount === 1 ? "" : "s"}`}
          accent="bg-emerald-500"
          iconBg="bg-emerald-50 text-emerald-600"
          href={buildHref({ bucket: bucketFilter === "collected" ? "all" : "collected" })}
          active={bucketFilter === "collected"}
        />
        <SummaryTile
          icon={<Wallet className="h-4 w-4" />}
          value={formatMoneyCompact(totalOutstanding)}
          label="Outstanding"
          accent="bg-rose-500"
          iconBg="bg-rose-50 text-rose-600"
          href={buildHref({ bucket: bucketFilter === "outstanding" ? "all" : "outstanding" })}
          active={bucketFilter === "outstanding"}
        />
        <SummaryTile
          icon={<AlertCircle className="h-4 w-4" />}
          value={overdueCount}
          label="Overdue"
          accent="bg-red-500"
          iconBg="bg-red-50 text-red-600"
          href={buildHref({ bucket: bucketFilter === "overdue" ? "all" : "overdue" })}
          active={bucketFilter === "overdue"}
        />
        <SummaryTile
          icon={<Calendar className="h-4 w-4" />}
          value={dueTodayCount}
          label="Due Today"
          accent="bg-orange-500"
          iconBg="bg-orange-50 text-orange-600"
          href={buildHref({ bucket: bucketFilter === "dueToday" ? "all" : "dueToday" })}
          active={bucketFilter === "dueToday"}
        />
        <SummaryTile
          icon={<Clock className="h-4 w-4" />}
          value={dueSoonCount}
          label="Due Soon"
          accent="bg-amber-500"
          iconBg="bg-amber-50 text-amber-600"
          href={buildHref({ bucket: bucketFilter === "dueSoon" ? "all" : "dueSoon" })}
          active={bucketFilter === "dueSoon"}
        />
        <SummaryTile
          icon={<CalendarDays className="h-4 w-4" />}
          value={dueThisMonthCount}
          label="Due This Month"
          accent="bg-yellow-500"
          iconBg="bg-yellow-50 text-yellow-600"
          href={buildHref({ bucket: bucketFilter === "dueThisMonth" ? "all" : "dueThisMonth" })}
          active={bucketFilter === "dueThisMonth"}
        />
        <SummaryTile
          icon={<CircleDollarSign className="h-4 w-4" />}
          value={partPaidCount}
          label="Part Paid"
          accent="bg-sky-500"
          iconBg="bg-sky-50 text-sky-600"
          href={buildHref({ bucket: bucketFilter === "partPaid" ? "all" : "partPaid" })}
          active={bucketFilter === "partPaid"}
        />
        <SummaryTile
          icon={<CalendarClock className="h-4 w-4" />}
          value={noPaymentCount}
          label="No Payment"
          accent="bg-slate-400"
          iconBg="bg-slate-50 text-slate-600"
          href={buildHref({ bucket: bucketFilter === "noPayment" ? "all" : "noPayment" })}
          active={bucketFilter === "noPayment"}
        />
        <SummaryTile
          icon={<Layers className="h-4 w-4" />}
          value={paymentPlanCount}
          label="Payment Plan / Instalment"
          accent="bg-violet-500"
          iconBg="bg-violet-50 text-violet-600"
          href={buildHref({ bucket: bucketFilter === "paymentPlan" ? "all" : "paymentPlan" })}
          active={bucketFilter === "paymentPlan"}
        />
      </div>

      {bucketFilter !== "all" && (
        <PendingLink
          href={buildHref({ bucket: "all" })}
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          Clear filter
        </PendingLink>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Building</th>
              <th className="px-3 py-2">Floor</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2 text-right">Amount Due</th>
              <th className="px-3 py-2 text-right">Amount Paid</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Due Date</th>
              <th className="px-3 py-2 text-right">Days Overdue</th>
              <th className="px-3 py-2">Last Reminder</th>
              <th className="px-3 py-2">Payment Arrangement</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No units match this filter.
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => {
                const badge = statusBadge(row);
                return (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 align-top">{row.ownerLabel}</td>
                  <td className="px-3 py-2 align-top">
                    <a
                      href={`/protected/properties/${row.propertyId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.buildingLabel}
                    </a>
                  </td>
                  <td className="px-3 py-2 align-top">{row.floor ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{row.unitLabel}</td>
                  <td className="px-3 py-2 text-right align-top">
                    {formatMoney(row.raised)}
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    {formatMoney(row.paid)}
                  </td>
                  <td className="px-3 py-2 text-right align-top font-medium">
                    {formatMoney(row.outstanding)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.dueDate ? format(row.dueDate, "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    {row.daysOverdue > 0 ? row.daysOverdue : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.lastReminder ? format(row.lastReminder, "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.activePlan
                      ? `${row.activePlan.installments.filter((i) => i.paidAt).length}/${
                          row.activePlan.installmentCount
                        } paid`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <UnitManageModal
                        unit={row.managedUnit}
                        unitLabel={row.unitLabel}
                        unitNoun={row.unitNoun}
                        unitNounCap={row.unitNounCap}
                        hasFloors={row.hasFloors}
                        hasBedrooms={row.hasBedrooms}
                        isAdmin
                        isBuildingType={row.isBuildingType}
                        canManageDocuments
                        owners={owners}
                        availableTenants={availableTenants}
                        funds={funds}
                        defaultTab="charge"
                        triggerLabel="Take Action"
                      />
                      <a
                        href={`/protected/properties/${row.propertyId}/units/${row.id}/ledger`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        title="View this unit's full ledger and invoice PDFs"
                      >
                        <ScrollText className="h-3 w-3" />
                        Ledger
                      </a>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
