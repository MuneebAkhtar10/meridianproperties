import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { formatMoney } from "@/lib/finance";
import {
  getBuildingManagementReport,
  parseDateInput,
  REPORT_PERIOD_LABEL,
  resolveReportPeriod,
  summaryReportFileStem,
  sumLines,
  type ReportPeriodPreset,
} from "@/lib/building-management-report";
import { BuildingManagementReportDocument } from "@/lib/pdf/building-management-report";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const PRESETS = Object.keys(REPORT_PERIOD_LABEL) as ReportPeriodPreset[];

function trimOmr(value: number) {
  return formatMoney(value).replace("OMR", "").trim();
}

function toDetail(line: { unitLabel: string; description: string; amount: number }) {
  return {
    unitLabel: line.unitLabel,
    description: line.description,
    amount: trimOmr(line.amount),
  };
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

  const toLine = (line: { description: string; unitCount: number; amount: number }) => ({
    description: line.description,
    unitCount: line.unitCount,
    amount: trimOmr(line.amount),
  });

  const title = report.isBuildingManagement
    ? `${report.propertyName} Summary Report ${format(period.to, "MMMM yyyy")}`
    : `${report.propertyName} Summary Report ${format(period.to, "MMMM yyyy")}`;

  const pdfBuffer = await renderToBuffer(
    BuildingManagementReportDocument({
      propertyName: report.propertyName,
      title,
      periodLabel: `${REPORT_PERIOD_LABEL[preset]} · ${format(period.from, "d MMM yyyy")} – ${format(period.to, "d MMM yyyy")}`,
      rentalRows: [
        toLine(report.rentalCollection.withCompany),
        toLine(report.rentalCollection.withLandlord),
      ],
      rentalTotal: toLine(report.rentalCollection.total),
      expenseRows: report.expenseLines.map(toLine),
      expenseTotal: toLine(report.totalExpense),
      totalRentalCollection: trimOmr(report.rentalCollection.total.amount),
      companyCollection: trimOmr(report.rentalCollection.withCompany.amount),
      landlordCollection: trimOmr(report.rentalCollection.withLandlord.amount),
      totalExpense: trimOmr(report.totalExpense.amount),
      finalBalanceLabel: report.finalBalanceLabel,
      finalBalance: trimOmr(report.finalBalance),
      expenseDetails: report.expenseDetails.map(toDetail),
      agreementDetails: report.agreementDetails.map(toDetail),
      utilityDetails: report.utilityDetails.map(toDetail),
      expenseDetailsTotal: trimOmr(sumLines(report.expenseDetails)),
      agreementDetailsTotal: trimOmr(sumLines(report.agreementDetails)),
      utilityDetailsTotal: trimOmr(sumLines(report.utilityDetails)),
      companyRentDetails: report.companyRentDetails.map((row) => ({
        unitLabel: row.unitLabel,
        tenantName: row.tenantName,
        month: row.month,
        paidAt: format(row.paidAt, "d MMM yyyy"),
        amount: trimOmr(row.amount),
      })),
      landlordRentDetails: report.landlordRentDetails.map((row) => ({
        unitLabel: row.unitLabel,
        tenantName: row.tenantName,
        month: row.month,
        paidAt: format(row.paidAt, "d MMM yyyy"),
        amount: trimOmr(row.amount),
      })),
      generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
      chartSeries: [
        {
          label: "Total Rental Collection",
          amount: report.rentalCollection.total.amount,
          color: "#22C55E",
        },
        {
          label: "Admin fee &\nCleaning",
          amount:
            report.expenseLines.find((l) => l.description === "Administration fee + Cleaning")
              ?.amount ?? 0,
          color: "#C026D3",
        },
        {
          label: "Water",
          amount:
            report.expenseLines.find((l) => l.description === "General Water Bill")?.amount ?? 0,
          color: "#9CA3AF",
        },
        {
          label: "Electricity",
          amount:
            report.expenseLines.find((l) => l.description === "General Electricity Bill")
              ?.amount ?? 0,
          color: "#3F6212",
        },
        {
          label: "General Maintenance &\nExpenses",
          amount:
            report.expenseLines.find(
              (l) => l.description === "General Maintenance & Other Expenses",
            )?.amount ?? 0,
          color: "#166534",
        },
        {
          label: "Agreement fees",
          amount:
            report.expenseLines.find((l) => l.description === "Agreement Registration")
              ?.amount ?? 0,
          color: "#1D4ED8",
        },
      ],
    }),
  );

  const filename = `${summaryReportFileStem(report.propertyName, period.to)}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
