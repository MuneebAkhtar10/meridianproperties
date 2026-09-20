import {
  Banknote,
  Building2,
  DoorOpen,
  ScrollText,
  UserRound,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SummaryTile } from "@/components/summary-tile";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateInputValue, formatMoney, monthInputValue } from "@/lib/finance";
import { getOwnerReport } from "@/lib/owner-report";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

/**
 * A single landlord's whole portfolio, one report — spun out of the
 * Properties page's "Owner Report" modal (pick an owner + a date range,
 * land here). Every property and unit they own, rent collected and
 * expenses logged against each over the period, netting to what's owed
 * back to them overall — the multi-unit counterpart to the single-tenancy
 * Landlord Statement (lib/unit-rent-statement.ts).
 */
export default async function OwnerReportPage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);

  const params = (await searchParams) as unknown as {
    owner?: string;
    from?: string;
    to?: string;
  };
  const ownerId = typeof params.owner === "string" ? params.owner : "";
  const from = params.from ? new Date(params.from) : new Date(`${monthInputValue()}-01`);
  const to = params.to ? new Date(params.to) : new Date(dateInputValue());

  const owners = await prisma.user.findMany({
    where: { userType: UserType.owner },
    select: { id: true, email: true, firstName: true, lastName: true },
    orderBy: { email: "asc" },
  });

  const report = ownerId ? await getOwnerReport(ownerId, { from, to }) : null;

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Owner Report"
        description="A landlord's whole portfolio — every property and unit, rent collected, expenses, and the resulting balance."
        back={{ href: "/protected/properties", label: "Properties" }}
      />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-4">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="owner-report-owner-select" className="text-xs">
            Owner
          </Label>
          <Select
            id="owner-report-owner-select"
            name="owner"
            defaultValue={ownerId}
            required
          >
            <option value="" disabled>
              Select an owner…
            </option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {[owner.firstName, owner.lastName].filter(Boolean).join(" ") ||
                  owner.email}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="owner-report-from-input" className="text-xs">
            From
          </Label>
          <input
            id="owner-report-from-input"
            type="date"
            name="from"
            defaultValue={dateInputValue(from)}
            required
            className="flex h-10 w-40 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="owner-report-to-input" className="text-xs">
            To
          </Label>
          <input
            id="owner-report-to-input"
            type="date"
            name="to"
            defaultValue={dateInputValue(to)}
            required
            className="flex h-10 w-40 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          View Report
        </button>
      </form>

      {!report ? (
        <EmptyState
          icon={UserRound}
          title="Pick an owner to get started"
          description="Choose an owner and a date range above to see their portfolio-wide statement."
        />
      ) : report.rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={`${report.owner.name} owns no units yet`}
          description="Once units are assigned to this owner, they'll show up here."
        />
      ) : (
        <>
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{report.owner.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[report.owner.email, report.owner.phone].filter(Boolean).join(" · ")}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(report.from, "d MMM yyyy")} – {format(report.to, "d MMM yyyy")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryTile
              icon={<Building2 className="h-4 w-4" />}
              value={report.totals.propertyCount}
              label="Properties"
              accent="bg-indigo-500"
              iconBg="bg-indigo-50 text-indigo-600"
            />
            <SummaryTile
              icon={<DoorOpen className="h-4 w-4" />}
              value={`${report.totals.occupiedCount}/${report.totals.unitCount}`}
              label="Units Occupied"
              accent="bg-violet-500"
              iconBg="bg-violet-50 text-violet-600"
            />
            <SummaryTile
              icon={<ScrollText className="h-4 w-4" />}
              value={formatMoney(report.totals.totalMonthlyRent)}
              label="Total Monthly Rent"
              accent="bg-sky-500"
              iconBg="bg-sky-50 text-sky-600"
            />
            <SummaryTile
              icon={<Banknote className="h-4 w-4" />}
              value={formatMoney(report.totals.totalRentCollected)}
              label="Rent Collected"
              accent="bg-emerald-500"
              iconBg="bg-emerald-50 text-emerald-600"
            />
            <SummaryTile
              icon={<Wallet className="h-4 w-4" />}
              value={formatMoney(report.totals.totalExpenses)}
              label="Total Expenses"
              accent="bg-amber-500"
              iconBg="bg-amber-50 text-amber-600"
            />
            <SummaryTile
              icon={<Banknote className="h-4 w-4" />}
              value={formatMoney(report.totals.netToOwner)}
              label="Net to Owner"
              sublabel={
                report.totals.totalServiceChargeBalance !== 0
                  ? `Service charge: ${formatMoney(report.totals.totalServiceChargeBalance)}`
                  : undefined
              }
              accent={report.totals.netToOwner >= 0 ? "bg-emerald-500" : "bg-rose-500"}
              iconBg={
                report.totals.netToOwner >= 0
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-rose-50 text-rose-600"
              }
            />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Property</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Tenant</th>
                  <th className="px-3 py-2 text-right">Monthly Rent</th>
                  <th className="px-3 py-2 text-right">Rent Collected</th>
                  <th className="px-3 py-2 text-right">Expenses</th>
                  <th className="px-3 py-2 text-right">Service Charge</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.rows.map((row) => (
                  <tr key={row.unitId} className="hover:bg-muted/20">
                    <td className="px-3 py-2 align-top">
                      {row.propertyName}
                      {row.buildingNumber && (
                        <span className="block text-[11px] text-muted-foreground">
                          Building {row.buildingNumber}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">{row.unitLabel}</td>
                    <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                      {row.managementCategory}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {row.tenantName ?? (
                        <span className="text-muted-foreground">Empty</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {formatMoney(row.monthlyRent)}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {formatMoney(row.rentCollected)}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {formatMoney(row.expenses)}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {formatMoney(row.serviceChargeBalance)}
                    </td>
                    <td className="px-3 py-2 text-right align-top font-medium">
                      {formatMoney(row.net)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Link
                        href={`/protected/properties/${row.propertyId}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
