import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { formatMoney } from "@/lib/finance";
import {
  getBuildingManagementReport,
  REPORT_PERIOD_LABEL,
  resolveReportPeriod,
  type ReportPeriodPreset,
} from "@/lib/building-management-report";
import { BuildingManagementReportDocument } from "@/lib/pdf/building-management-report";
import { getCurrentUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const PRESETS = Object.keys(REPORT_PERIOD_LABEL) as ReportPeriodPreset[];

function trimOmr(value: number) {
  return formatMoney(value).replace("OMR", "").trim();
}

/** The printable version of the Building Management Summary Report
 * (spec #36) — /protected/properties/[id]/building-management-report. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.userType !== UserType.admin) {
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
    from ? new Date(from) : null,
    to ? new Date(to) : null,
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

  const pdfBuffer = await renderToBuffer(
    BuildingManagementReportDocument({
      propertyName: report.propertyName,
      periodLabel: `${REPORT_PERIOD_LABEL[preset]} · ${format(period.from, "d MMM yyyy")} – ${format(period.to, "d MMM yyyy")}`,
      rentalRows: [
        toLine(report.rentalCollection.withCompany),
        toLine(report.rentalCollection.withLandlord),
      ],
      rentalTotal: toLine(report.rentalCollection.total),
      expenseRows: report.expenseLines.map(toLine),
      expenseTotal: toLine(report.totalExpense),
      totalRentalCollection: trimOmr(report.rentalCollection.withCompany.amount),
      totalExpense: trimOmr(report.totalExpense.amount),
      finalBalanceLabel: report.finalBalanceLabel,
      finalBalance: trimOmr(report.finalBalance),
      generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
    }),
  );

  const filename = `building-management-report-${report.propertyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
