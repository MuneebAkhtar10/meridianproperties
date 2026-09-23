import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

import {
  getBuildingManagementReport,
  parseDateInput,
  REPORT_PERIOD_LABEL,
  resolveReportPeriod,
  summaryReportFileStem,
  sumLines,
  type ReportPeriodPreset,
} from "@/lib/building-management-report";
import {
  buildSpreadsheetMl,
  type SpreadsheetRow,
} from "@/lib/spreadsheet-ml";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const PRESETS = Object.keys(REPORT_PERIOD_LABEL) as ReportPeriodPreset[];

function empty(): SpreadsheetRow {
  return { cells: [], height: 8 };
}

function title(text: string): SpreadsheetRow {
  return { height: 24, cells: [{ value: text, style: "Title", mergeAcross: 3 }] };
}

function subtitle(text: string): SpreadsheetRow {
  return { height: 18, cells: [{ value: text, style: "Subtitle", mergeAcross: 3 }] };
}

function section(text: string): SpreadsheetRow {
  return { height: 22, cells: [{ value: text, style: "Section", mergeAcross: 3 }] };
}

function money(amount: number, style: string) {
  return { value: amount, style, number: true as const };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: propertyId } = await params;
  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period");
  const preset: ReportPeriodPreset = PRESETS.includes(
    periodParam as ReportPeriodPreset,
  )
    ? (periodParam as ReportPeriodPreset)
    : "monthly";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const period = resolveReportPeriod(
    preset,
    parseDateInput(from),
    parseDateInput(to),
  );

  const report = await getBuildingManagementReport(propertyId, period);
  if (!report) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const periodLabel = `${REPORT_PERIOD_LABEL[preset]} · ${format(period.from, "d MMM yyyy")} – ${format(period.to, "d MMM yyyy")}`;
  const balanceStyle = report.finalBalanceLabel === "Balance Amount to Landlord"
    ? "BalancePay"
    : "BalanceCollect";
  const balanceRightStyle = report.finalBalanceLabel === "Balance Amount to Landlord"
    ? "BalancePayRight"
    : "BalanceCollectRight";

  const rentDetailBlock = (
    heading: string,
    lines: typeof report.companyRentDetails,
    total: number,
  ): SpreadsheetRow[] => [
    section(heading),
    {
      height: 20,
      cells: [
        { value: "Unit", style: "Th" },
        { value: "Tenant", style: "Th" },
        { value: "Period / paid on", style: "Th" },
        { value: "Amount", style: "Th" },
      ],
    },
    ...(lines.length === 0
      ? [
          {
            height: 20,
            cells: [
              {
                value: "No rent collected this way in the period.",
                style: "Td",
                mergeAcross: 3,
              },
            ],
          },
        ]
      : lines.map((line) => ({
          height: 18,
          cells: [
            { value: line.unitLabel, style: "Td" },
            { value: line.tenantName, style: "Td" },
            {
              value: `${line.month} · ${format(line.paidAt, "d MMM yyyy")} · ${line.title}`,
              style: "Td",
            },
            money(line.amount, "TdRight"),
          ],
        }))),
    {
      height: 22,
      cells: [
        { value: "TOTAL", style: "Total", mergeAcross: 2 },
        money(total, "TotalRight"),
      ],
    },
  ];

  const detailBlock = (
    heading: string,
    lines: { unitLabel: string; description: string; amount: number }[],
  ): SpreadsheetRow[] => [
    section(heading),
    {
      height: 20,
      cells: [
        { value: "Unit", style: "Th" },
        { value: "Description", style: "Th", mergeAcross: 1 },
        { value: "Amount", style: "Th" },
      ],
    },
    ...(lines.length === 0
      ? [
          {
            height: 20,
            cells: [{ value: "None in this period.", style: "Td", mergeAcross: 3 }],
          },
        ]
      : lines.map((line) => ({
          height: 18,
          cells: [
            { value: line.unitLabel, style: "Td" },
            { value: line.description, style: "Td", mergeAcross: 1 },
            money(line.amount, "TdRight"),
          ],
        }))),
    {
      height: 22,
      cells: [
        { value: "TOTAL", style: "Total", mergeAcross: 2 },
        money(sumLines(lines), "TotalRight"),
      ],
    },
  ];

  const rows: SpreadsheetRow[] = [
    title(`${report.propertyName} Summary Report`),
    subtitle(periodLabel),
    empty(),
    section("Rental Collection"),
    {
      height: 20,
      cells: [
        { value: "Description", style: "Th", mergeAcross: 1 },
        { value: "No of Units", style: "Th" },
        { value: "Amount", style: "Th" },
      ],
    },
    ...[
      report.rentalCollection.withCompany,
      report.rentalCollection.withLandlord,
    ].map((line) => ({
      height: 18,
      cells: [
        { value: line.description, style: "Td", mergeAcross: 1 },
        { value: String(line.unitCount), style: "Td" },
        money(line.amount, "TdRight"),
      ],
    })),
    {
      height: 22,
      cells: [
        { value: report.rentalCollection.total.description, style: "Total", mergeAcross: 1 },
        { value: String(report.rentalCollection.total.unitCount), style: "TotalRight" },
        money(report.rentalCollection.total.amount, "TotalRight"),
      ],
    },
    empty(),
    section("Less Expense"),
    {
      height: 20,
      cells: [
        { value: "Description", style: "Th", mergeAcross: 1 },
        { value: "No of Units", style: "Th" },
        { value: "Amount", style: "Th" },
      ],
    },
    ...report.expenseLines.map((line) => ({
      height: 18,
      cells: [
        { value: line.description, style: "Td", mergeAcross: 1 },
        { value: String(line.unitCount), style: "Td" },
        money(line.amount, "TdRight"),
      ],
    })),
    {
      height: 22,
      cells: [
        { value: report.totalExpense.description, style: "Total", mergeAcross: 1 },
        { value: String(report.totalExpense.unitCount), style: "TotalRight" },
        money(report.totalExpense.amount, "TotalRight"),
      ],
    },
    empty(),
    section("Final Position"),
    {
      height: 20,
      cells: [
        { value: "Rental Collection with Company", style: "Td", mergeAcross: 2 },
        money(report.rentalCollection.withCompany.amount, "TdRight"),
      ],
    },
    {
      height: 20,
      cells: [
        { value: "Total Expense", style: "Td", mergeAcross: 2 },
        money(report.totalExpense.amount, "TdRight"),
      ],
    },
    {
      height: 26,
      cells: [
        { value: report.finalBalanceLabel, style: balanceStyle, mergeAcross: 2 },
        money(report.finalBalance, balanceRightStyle),
      ],
    },
    empty(),
    ...detailBlock("Expenses", report.expenseDetails),
    empty(),
    ...detailBlock("Agreement Registration", report.agreementDetails),
    empty(),
    ...detailBlock("Utilities", report.utilityDetails),
    empty(),
    ...rentDetailBlock(
      "Rent collected by company",
      report.companyRentDetails,
      report.rentalCollection.withCompany.amount,
    ),
    empty(),
    ...rentDetailBlock(
      "Rent collected by landlord",
      report.landlordRentDetails,
      report.rentalCollection.withLandlord.amount,
    ),
  ];

  const xml = buildSpreadsheetMl({
    name: "Summary",
    columns: [140, 160, 90, 110],
    rows,
  });

  const filename = `${summaryReportFileStem(report.propertyName, period.to)}.xls`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
