import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { moneyValue } from "@/lib/finance";
import { getTenantReportData } from "@/lib/tenant-report";
import { TenantReportDocument, type TenantReportRow } from "@/lib/pdf/tenant-report";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const numberFormat = new Intl.NumberFormat("en-OM", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/**
 * Same data as the on-screen Tenant Report view (/protected/tenancies/report)
 * — every active tenancy in one property — rendered as a printable PDF.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (!isStaffAdmin(user.userType) && user.userType !== UserType.owner)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const propertyId = request.nextUrl.searchParams.get("property");
  if (!propertyId) {
    return NextResponse.json({ error: "A property is required." }, { status: 400 });
  }

  const report = await getTenantReportData(propertyId, user);
  if (!report) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const rows: TenantReportRow[] = report.rows.map((row) => ({
    tenantName: row.tenantName,
    contact: row.contact,
    area: row.area,
    agreementNo: row.agreementNo,
    buildingName: row.buildingName,
    unitNo: row.unitNo,
    rentPerMonth: numberFormat.format(moneyValue(row.rentPerMonth)),
    startDate: format(row.startDate, "dd/MM/yyyy"),
    endDate: row.leaseEndDate ? format(row.leaseEndDate, "dd/MM/yyyy") : "-",
    status: row.status,
  }));

  const totalMonthlyRent = report.rows.reduce(
    (sum, row) => sum + moneyValue(row.rentPerMonth),
    0,
  );

  const pdfBuffer = await renderToBuffer(
    TenantReportDocument({
      propertyName: report.propertyName,
      rows,
      activeCount: report.rows.length,
      totalMonthlyRent: numberFormat.format(totalMonthlyRent),
      isOwnerAssociation: report.isOwnerAssociation,
    }),
  );

  const filename = `tenant-report-${report.propertyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${format(new Date(), "yyyy-MM-dd")}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
