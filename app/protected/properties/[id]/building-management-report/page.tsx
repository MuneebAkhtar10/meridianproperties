import { format } from "date-fns";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { dateInputValue, formatMoney } from "@/lib/finance";
import {
  getBuildingManagementReport,
  REPORT_PERIOD_LABEL,
  resolveReportPeriod,
  type ReportPeriodPreset,
} from "@/lib/building-management-report";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const PRESETS = Object.keys(REPORT_PERIOD_LABEL) as ReportPeriodPreset[];

/**
 * Spec #36 "Building Management Summary Report" — a Darsait-style
 * reconciliation of rent collected (via the company or the landlord
 * directly) against building expenses, over a configurable period, for
 * one "Building Management" property. See lib/building-management-report.ts
 * for the shared query the on-screen view and PDF export both use.
 */
export default async function BuildingManagementReportPage({
  params,
  searchParams,
}: PageProps) {
  await requireRole(UserType.admin);

  const { id: propertyId } = (await params) as { id: string };
  const sp = (await searchParams) as unknown as {
    period?: string;
    from?: string;
    to?: string;
  };

  const preset: ReportPeriodPreset = PRESETS.includes(sp.period as ReportPeriodPreset)
    ? (sp.period as ReportPeriodPreset)
    : "monthly";
  const customFrom = sp.from ? new Date(sp.from) : null;
  const customTo = sp.to ? new Date(sp.to) : null;
  const period = resolveReportPeriod(preset, customFrom, customTo);

  const report = await getBuildingManagementReport(propertyId, period);
  if (!report) {
    notFound();
  }

  const pdfParams = new URLSearchParams({ period: preset });
  if (preset === "custom") {
    pdfParams.set("from", dateInputValue(period.from));
    pdfParams.set("to", dateInputValue(period.to));
  }

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Building Management Summary Report"
        description={`${report.propertyName} · ${format(period.from, "d MMM yyyy")} – ${format(period.to, "d MMM yyyy")}`}
        back={{
          href: `/protected/properties/${propertyId}`,
          label: "Back to property",
        }}
      >
        <ButtonLink
          href={`/api/properties/${propertyId}/building-management-report/pdf?${pdfParams}`}
          target="_blank"
          variant="outline"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </ButtonLink>
      </PageHeader>

      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="period" className="text-xs">
              Period
            </Label>
            <Select id="period" name="period" defaultValue={preset}>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {REPORT_PERIOD_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from" className="text-xs">
              From (custom only)
            </Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={dateInputValue(period.from)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to" className="text-xs">
              To (custom only)
            </Label>
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={dateInputValue(period.to)}
            />
          </div>
          <SubmitButton variant="outline" pendingText="Applying...">
            Apply
          </SubmitButton>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold">Rental Collection</h3>
        </div>
        <ReportTable
          rows={[
            report.rentalCollection.withCompany,
            report.rentalCollection.withLandlord,
          ]}
          totalRow={report.rentalCollection.total}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold">Less Expense</h3>
        </div>
        <ReportTable rows={report.expenseLines} totalRow={report.totalExpense} />
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold">Final Position</h3>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <tr>
              <td className="px-4 py-2.5">Rental Collection with Company</td>
              <td className="px-4 py-2.5 text-right font-medium">
                {formatMoney(report.rentalCollection.withCompany.amount)}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5">Total Expense</td>
              <td className="px-4 py-2.5 text-right font-medium text-rose-600">
                ({formatMoney(report.totalExpense.amount)})
              </td>
            </tr>
            <tr className="bg-muted/30">
              <td className="px-4 py-3 font-semibold">
                {report.finalBalanceLabel}
              </td>
              <td
                className={`px-4 py-3 text-right text-base font-bold ${
                  report.finalBalanceLabel === "Balance Amount to Landlord"
                    ? "text-emerald-600"
                    : "text-rose-600"
                }`}
              >
                {formatMoney(report.finalBalance)}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ReportTable({
  rows,
  totalRow,
}: {
  rows: { description: string; unitCount: number; amount: number }[];
  totalRow: { description: string; unitCount: number; amount: number };
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2 text-right">No of Units</th>
            <th className="px-4 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.description}>
              <td className="px-4 py-2.5">{row.description}</td>
              <td className="px-4 py-2.5 text-right text-muted-foreground">
                {row.unitCount}
              </td>
              <td className="px-4 py-2.5 text-right font-medium">
                {formatMoney(row.amount)}
              </td>
            </tr>
          ))}
          <tr className="bg-muted/30">
            <td className="px-4 py-2.5 font-semibold">{totalRow.description}</td>
            <td className="px-4 py-2.5 text-right font-semibold">
              {totalRow.unitCount}
            </td>
            <td className="px-4 py-2.5 text-right font-semibold">
              {formatMoney(totalRow.amount)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
