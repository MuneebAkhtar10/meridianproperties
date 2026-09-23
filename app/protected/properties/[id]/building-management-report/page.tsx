import { format } from "date-fns";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  Banknote,
  Building2,
  Download,
  FileSpreadsheet,
  Landmark,
  Receipt,
  Scale,
  Wallet,
  Zap,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";
import { SummaryPeriodFilter } from "@/components/summary-period-filter";
import { dateInputValue, formatMoney } from "@/lib/finance";
import {
  getBuildingManagementReport,
  parseDateInput,
  REPORT_PERIOD_LABEL,
  resolveReportPeriod,
  sumLines,
  type ReportPeriodPreset,
} from "@/lib/building-management-report";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";
import { cn } from "@/lib/utils";

const PRESETS = Object.keys(REPORT_PERIOD_LABEL) as ReportPeriodPreset[];

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
  const period = resolveReportPeriod(preset, parseDateInput(sp.from), parseDateInput(sp.to));

  const report = await getBuildingManagementReport(propertyId, period);
  if (!report) {
    notFound();
  }

  const reportTitle = report.isBuildingManagement
    ? "Building Management Summary"
    : "Summary Report";
  const toLandlord = report.finalBalanceLabel === "Balance Amount to Landlord";
  const companyAmt = report.rentalCollection.withCompany.amount;
  const landlordAmt = report.rentalCollection.withLandlord.amount;
  const rentTotal = Math.max(companyAmt + landlordAmt, 0.001);
  const expenseMax = Math.max(
    ...report.expenseLines.map((line) => line.amount),
    0.001,
  );

  const pdfParams = new URLSearchParams({
    period: preset,
    from: dateInputValue(period.from),
    to: dateInputValue(period.to),
  });

  return (
    <div className="w-full space-y-6 px-4 pt-4 pb-10 sm:px-6 lg:px-8">
      <PageHeader
        title={reportTitle}
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
        <ButtonLink
          href={`/api/properties/${propertyId}/building-management-report/excel?${pdfParams}`}
          target="_blank"
          variant="outline"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Download Excel
        </ButtonLink>
      </PageHeader>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-4">
          <SummaryPeriodFilter
            preset={preset}
            from={dateInputValue(period.from)}
            to={dateInputValue(period.to)}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Changing Period fills From and To. Edit the dates slightly and Apply — totals update to that window.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Collected by company"
          value={formatMoney(companyAmt)}
          hint={`${report.rentalCollection.withCompany.unitCount} unit${report.rentalCollection.withCompany.unitCount === 1 ? "" : "s"}`}
          icon={<Building2 className="h-4 w-4" />}
          accent="bg-emerald-500"
          iconBg="bg-emerald-50 text-emerald-700"
        />
        <KpiTile
          label="Collected by landlord"
          value={formatMoney(landlordAmt)}
          hint={`${report.rentalCollection.withLandlord.unitCount} unit${report.rentalCollection.withLandlord.unitCount === 1 ? "" : "s"}`}
          icon={<Landmark className="h-4 w-4" />}
          accent="bg-slate-500"
          iconBg="bg-slate-100 text-slate-700"
        />
        <KpiTile
          label="Company-paid expenses"
          value={formatMoney(report.totalExpense.amount)}
          hint="deducted from company collections"
          icon={<Receipt className="h-4 w-4" />}
          accent="bg-rose-500"
          iconBg="bg-rose-50 text-rose-700"
        />
        <KpiTile
          label={toLandlord ? "Payable to landlord" : "Collect from landlord"}
          value={formatMoney(report.finalBalance)}
          hint="net settlement"
          icon={<Scale className="h-4 w-4" />}
          accent={toLandlord ? "bg-emerald-500" : "bg-rose-500"}
          iconBg={
            toLandlord
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }
          valueClassName={toLandlord ? "text-emerald-700" : "text-rose-700"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          icon={<Banknote className="h-4 w-4" />}
          iconBg="bg-indigo-50 text-indigo-600"
          title="Rental collection"
          subtitle="Approved rent in this period"
        >
          <ReportTable
            rows={[
              report.rentalCollection.withCompany,
              report.rentalCollection.withLandlord,
            ]}
            totalRow={report.rentalCollection.total}
          />
          <div className="border-t px-4 py-3">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
              <span
                className="bg-emerald-500"
                style={{ width: `${(companyAmt / rentTotal) * 100}%` }}
              />
              <span
                className="bg-slate-400"
                style={{ width: `${(landlordAmt / rentTotal) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Company {formatMoney(companyAmt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Landlord {formatMoney(landlordAmt)}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={<Wallet className="h-4 w-4" />}
          iconBg="bg-rose-50 text-rose-600"
          title="Less expense"
          subtitle="Bills paid by the company"
        >
          <div className="divide-y">
            {report.expenseLines.map((line) => (
              <div key={line.description} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm">{line.description}</p>
                  <p className="shrink-0 tabular-nums text-sm font-medium">
                    {formatMoney(line.amount)}
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rose-50">
                    <div
                      className="h-full rounded-full bg-rose-400"
                      style={{
                        width: `${Math.max(2, (line.amount / expenseMax) * 100)}%`,
                        opacity: line.amount === 0 ? 0.2 : 1,
                      }}
                    />
                  </div>
                  <span className="w-16 text-right text-[11px] text-muted-foreground">
                    {line.unitCount} unit{line.unitCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            ))}
            <div className="flex items-baseline justify-between bg-rose-50/60 px-4 py-3">
              <p className="text-sm font-semibold">{report.totalExpense.description}</p>
              <p className="tabular-nums text-sm font-semibold text-rose-700">
                {formatMoney(report.totalExpense.amount)}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <div
        className={cn(
          "flex flex-col gap-1 overflow-hidden rounded-2xl px-5 py-4 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between",
          toLandlord
            ? "bg-gradient-to-r from-emerald-600 to-teal-600"
            : "bg-gradient-to-r from-rose-600 to-rose-500",
        )}
      >
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/80">
            Final position
          </p>
          <p className="mt-0.5 text-lg font-semibold">{report.finalBalanceLabel}</p>
          <p className="mt-1 text-sm text-white/80">
            Company collections {formatMoney(companyAmt)} − expenses{" "}
            {formatMoney(report.totalExpense.amount)}
          </p>
        </div>
        <p className="text-3xl font-semibold tabular-nums tracking-tight">
          {formatMoney(report.finalBalance)}
        </p>
      </div>

      <SectionCard
        icon={<Receipt className="h-4 w-4" />}
        iconBg="bg-violet-50 text-violet-600"
        title="Expense details"
        subtitle="Unit-level bills excluding agreement fees and utilities"
      >
        <DetailTable
          rows={report.expenseDetails}
          total={sumLines(report.expenseDetails)}
        />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          icon={<Scale className="h-4 w-4" />}
          iconBg="bg-amber-50 text-amber-700"
          title="Agreement registration"
        >
          <DetailTable
            rows={report.agreementDetails}
            total={sumLines(report.agreementDetails)}
          />
        </SectionCard>
        <SectionCard
          icon={<Zap className="h-4 w-4" />}
          iconBg="bg-sky-50 text-sky-700"
          title="Utilities"
        >
          <DetailTable
            rows={report.utilityDetails}
            total={sumLines(report.utilityDetails)}
          />
        </SectionCard>
      </div>

      <SectionCard
        icon={<Building2 className="h-4 w-4" />}
        iconBg="bg-emerald-50 text-emerald-700"
        title="Rent collected by company"
        subtitle="Payments received into company accounts"
      >
        <RentDetailTable
          rows={report.companyRentDetails}
          total={companyAmt}
        />
      </SectionCard>

      <SectionCard
        icon={<Landmark className="h-4 w-4" />}
        iconBg="bg-slate-100 text-slate-700"
        title="Rent collected by landlord"
        subtitle="Shown for the record — not included in the company settlement"
      >
        <RentDetailTable
          rows={report.landlordRentDetails}
          total={landlordAmt}
        />
      </SectionCard>
    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
  icon,
  accent,
  iconBg,
  valueClassName,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  accent: string;
  iconBg: string;
  valueClassName?: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/60 shadow-sm">
      <span className={cn("absolute inset-x-0 top-0 h-1", accent)} />
      <CardContent className="flex items-start gap-3 p-4">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            iconBg,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-1 truncate text-lg font-semibold tabular-nums tracking-tight",
              valueClassName,
            )}
          >
            {value}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({
  icon,
  iconBg,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <div className="flex items-start gap-3 border-b bg-muted/20 px-4 py-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            iconBg,
          )}
        >
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </Card>
  );
}

function DetailTable({
  rows,
  total,
}: {
  rows: { unitLabel: string; description: string; amount: number }[];
  total: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Unit</th>
            <th className="px-4 py-2.5 font-medium">Description</th>
            <th className="px-4 py-2.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                None in this period.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={`${row.unitLabel}-${row.description}-${index}`}
                className="hover:bg-muted/20"
              >
                <td className="px-4 py-2.5">
                  <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                    {row.unitLabel}
                  </span>
                </td>
                <td className="px-4 py-2.5">{row.description}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {formatMoney(row.amount)}
                </td>
              </tr>
            ))
          )}
          <tr className="bg-muted/40">
            <td className="px-4 py-3 text-sm font-semibold" colSpan={2}>
              Total
            </td>
            <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
              {formatMoney(total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RentDetailTable({
  rows,
  total,
}: {
  rows: {
    unitLabel: string;
    tenantName: string;
    title: string;
    month: string;
    paidAt: Date;
    amount: number;
  }[];
  total: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Unit</th>
            <th className="px-4 py-2.5 font-medium">Tenant</th>
            <th className="px-4 py-2.5 font-medium">Charge</th>
            <th className="px-4 py-2.5 font-medium">Paid on</th>
            <th className="px-4 py-2.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                No rent collected this way in the period.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={`${row.unitLabel}-${row.paidAt.toISOString()}-${index}`}
                className="hover:bg-muted/20"
              >
                <td className="px-4 py-2.5">
                  <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                    {row.unitLabel}
                  </span>
                </td>
                <td className="px-4 py-2.5">{row.tenantName}</td>
                <td className="px-4 py-2.5">
                  {row.title}
                  <span className="block text-xs text-muted-foreground">
                    {row.month}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                  {format(row.paidAt, "d MMM yyyy")}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {formatMoney(row.amount)}
                </td>
              </tr>
            ))
          )}
          <tr className="bg-muted/40">
            <td className="px-4 py-3 text-sm font-semibold" colSpan={4}>
              Total
            </td>
            <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
              {formatMoney(total)}
            </td>
          </tr>
        </tbody>
      </table>
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
        <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Description</th>
            <th className="px-4 py-2.5 text-right font-medium">Units</th>
            <th className="px-4 py-2.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row) => (
            <tr key={row.description} className="hover:bg-muted/20">
              <td className="px-4 py-3">{row.description}</td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {row.unitCount}
              </td>
              <td className="px-4 py-3 text-right font-medium tabular-nums">
                {formatMoney(row.amount)}
              </td>
            </tr>
          ))}
          <tr className="bg-indigo-50/70">
            <td className="px-4 py-3 font-semibold">{totalRow.description}</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums">
              {totalRow.unitCount}
            </td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums">
              {formatMoney(totalRow.amount)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
