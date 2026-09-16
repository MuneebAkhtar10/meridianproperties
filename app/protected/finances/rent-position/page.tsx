import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Receipt,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";

import { PageHeader } from "@/components/page-header";
import { SummaryTile } from "@/components/summary-tile";
import { ButtonLink } from "@/components/ui/button-link";
import { Label } from "@/components/ui/label";
import { PendingLink } from "@/components/ui/pending-link";
import { Select } from "@/components/ui/select";
import { formatMoney, formatMoneyCompact } from "@/lib/finance";
import {
  filterRentPositionRows,
  getRentPositionData,
  type RentPositionBucketFilter,
} from "@/lib/rent-position";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const BUCKET_LABEL: Record<RentPositionBucketFilter, string> = {
  all: "All",
  paid: "Paid",
  partial: "Partially Paid",
  duesoon: "Due",
  overdue: "Overdue",
};

const BUCKET_BADGE: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  partial: "bg-sky-50 text-sky-700 ring-sky-600/20",
  duesoon: "bg-amber-50 text-amber-700 ring-amber-600/20",
  overdue: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

/**
 * Spec #32 "Rent Position" — a portfolio-wide, per-unit view: Paid /
 * Partially Paid / Due / Overdue + Total Outstanding, with upcoming
 * (Due) collections shown as their own tile before Overdue, matching the
 * spec's "approaching collections should appear before they become
 * overdue." Mirrors the OA side's Collection Position dashboard.
 */
export default async function RentPositionPage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);

  const params = (await searchParams) as unknown as {
    bucket?: string;
    property?: string;
  };
  const bucketFilter = (params.bucket ?? "all") as RentPositionBucketFilter;
  const propertyFilter =
    typeof params.property === "string" ? params.property : "all";

  const [{ rows, totals }, properties] = await Promise.all([
    getRentPositionData(propertyFilter),
    prisma.property.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const displayedRows = filterRentPositionRows(rows, bucketFilter);

  const buildHref = (next: Partial<{ bucket: RentPositionBucketFilter; property: string }>) => {
    const bucket = next.bucket ?? bucketFilter;
    const property = next.property ?? propertyFilter;
    const query = new URLSearchParams();
    if (bucket !== "all") query.set("bucket", bucket);
    if (property !== "all") query.set("property", property);
    const qs = query.toString();
    return `/protected/finances/rent-position${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Rent Position"
        description="Every occupied unit's rent status, portfolio-wide."
        back={{ href: "/protected/finances", label: "Rent & Bills" }}
      >
        <ButtonLink
          href={`/api/finances/rent-position/pdf${propertyFilter !== "all" ? `?property=${propertyFilter}` : ""}`}
          target="_blank"
          variant="outline"
        >
          <Receipt className="h-4 w-4" />
          Download PDF
        </ButtonLink>
      </PageHeader>

      <form className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="rent-position-property" className="text-xs">
            Property
          </Label>
          <Select id="rent-position-property" name="property" defaultValue={propertyFilter}>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryTile
          icon={<Receipt className="h-4 w-4" />}
          value={formatMoneyCompact(totals.totalRaised)}
          label="Total Raised"
          accent="bg-indigo-500"
          iconBg="bg-indigo-50 text-indigo-600"
        />
        <SummaryTile
          icon={<Banknote className="h-4 w-4" />}
          value={formatMoneyCompact(totals.totalCollected)}
          label="Collected"
          accent="bg-emerald-500"
          iconBg="bg-emerald-50 text-emerald-600"
        />
        <SummaryTile
          icon={<Wallet className="h-4 w-4" />}
          value={formatMoneyCompact(totals.totalOutstanding)}
          label="Total Outstanding"
          accent="bg-rose-500"
          iconBg="bg-rose-50 text-rose-600"
        />
        <SummaryTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          value={totals.paidCount}
          label="Paid"
          accent="bg-emerald-500"
          iconBg="bg-emerald-50 text-emerald-600"
          href={buildHref({ bucket: bucketFilter === "paid" ? "all" : "paid" })}
          active={bucketFilter === "paid"}
        />
        <SummaryTile
          icon={<Clock className="h-4 w-4" />}
          value={totals.dueSoonCount}
          label="Due"
          accent="bg-amber-500"
          iconBg="bg-amber-50 text-amber-600"
          href={buildHref({ bucket: bucketFilter === "duesoon" ? "all" : "duesoon" })}
          active={bucketFilter === "duesoon"}
        />
        <SummaryTile
          icon={<AlertCircle className="h-4 w-4" />}
          value={totals.overdueCount}
          label="Overdue"
          accent="bg-red-500"
          iconBg="bg-red-50 text-red-600"
          href={buildHref({ bucket: bucketFilter === "overdue" ? "all" : "overdue" })}
          active={bucketFilter === "overdue"}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
        <SummaryTile
          icon={<CircleDollarSign className="h-4 w-4" />}
          value={totals.partialCount}
          label="Partially Paid"
          accent="bg-sky-500"
          iconBg="bg-sky-50 text-sky-600"
          href={buildHref({ bucket: bucketFilter === "partial" ? "all" : "partial" })}
          active={bucketFilter === "partial"}
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
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2 text-right">Raised</th>
              <th className="px-3 py-2 text-right">Collected</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2">Next Due</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No units match this filter.
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 align-top">{row.ownerLabel}</td>
                  <td className="px-3 py-2 align-top">{row.buildingLabel}</td>
                  <td className="px-3 py-2 align-top">{row.unitLabel}</td>
                  <td className="px-3 py-2 align-top">{row.tenantName}</td>
                  <td className="px-3 py-2 text-right align-top">
                    {formatMoney(row.raised)}
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    {formatMoney(row.collected)}
                  </td>
                  <td className="px-3 py-2 text-right align-top font-medium">
                    {formatMoney(row.outstanding)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.nextDueDate ? format(row.nextDueDate, "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BUCKET_BADGE[row.bucket]}`}
                    >
                      {BUCKET_LABEL[row.bucket]}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <PendingLink
                      href={`/protected/properties/${row.propertyId}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Manage
                    </PendingLink>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
