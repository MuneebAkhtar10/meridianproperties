import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Banknote, Download, Receipt, Wallet } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SummaryTile } from "@/components/summary-tile";
import { buttonVariants } from "@/components/ui/button-variants";
import { Label } from "@/components/ui/label";
import { getBuildingRentSummary, type RentSummaryStatus } from "@/lib/building-rent-summary";
import { formatMoney, monthInputValue } from "@/lib/finance";
import { requireAnyRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const STATUS_BADGE: Record<RentSummaryStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  partial: { label: "Part paid", className: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  unpaid: { label: "Unpaid", className: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  vacant: { label: "No rent due", className: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

/** Monthly rent summary for every unit in one building. */
export default async function BuildingRentSummaryPage({ params, searchParams }: PageProps) {
  const { id } = (await params) as { id: string };
  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const query = (await searchParams) as unknown as { month?: string };
  const monthValue = /^\d{4}-\d{2}$/.test(query.month ?? "") ? query.month! : monthInputValue();

  const summary = await getBuildingRentSummary(
    id,
    new Date(`${monthValue}-01T00:00:00.000Z`),
    user.userType === UserType.owner ? user.id : undefined,
  );
  if (!summary) notFound();

  const { rows, totals } = summary;
  const csvHref = `/api/properties/${id}/rent-summary/csv?month=${monthValue}`;

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Monthly Rent Summary"
        description={`${summary.propertyName} · ${format(summary.monthStart, "MMMM yyyy")} · ${totals.unitCount} units`}
        back={{ href: `/protected/properties/${id}`, label: summary.propertyName }}
      >
        <a href={csvHref} className={buttonVariants({ variant: "outline" })}>
          <Download className="h-4 w-4" />
          Export CSV
        </a>
      </PageHeader>

      <form className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="rent-summary-month" className="text-xs">Month</Label>
          <input
            id="rent-summary-month"
            type="month"
            name="month"
            defaultValue={monthValue}
            className="flex h-10 w-44 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
        <button type="submit" className="h-10 rounded-lg border px-4 text-sm font-medium hover:bg-muted">
          Apply
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile icon={<Receipt className="h-4 w-4" />} value={formatMoney(totals.rentDue)} label="Rent due" accent="bg-indigo-500" iconBg="bg-indigo-50 text-indigo-600" />
        <SummaryTile icon={<Banknote className="h-4 w-4" />} value={formatMoney(totals.paid)} label="Collected" accent="bg-emerald-500" iconBg="bg-emerald-50 text-emerald-600" />
        <SummaryTile icon={<Wallet className="h-4 w-4" />} value={formatMoney(totals.balance)} label="Outstanding" accent="bg-rose-500" iconBg="bg-rose-50 text-rose-600" />
        <SummaryTile icon={<Receipt className="h-4 w-4" />} value={`${totals.paidCount}/${totals.unitCount}`} label="Units paid" accent="bg-violet-500" iconBg="bg-violet-50 text-violet-600" />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2 text-right">Rent due</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2">Paid on</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.unitId} className="hover:bg-muted/20">
                <td className="px-3 py-2 font-medium">{row.unitLabel}</td>
                <td className="px-3 py-2">{row.tenantName ?? <span className="text-muted-foreground">Empty</span>}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.rentDue)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.paid)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatMoney(row.balance)}</td>
                <td className="px-3 py-2">{row.paidOn ? format(row.paidOn, "d MMM yyyy") : "—"}</td>
                <td className="px-3 py-2">{row.method ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_BADGE[row.status].className}`}>
                    {STATUS_BADGE[row.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30 text-sm font-semibold">
            <tr>
              <td className="px-3 py-2" colSpan={2}>Total</td>
              <td className="px-3 py-2 text-right">{formatMoney(totals.rentDue)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(totals.paid)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(totals.balance)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
