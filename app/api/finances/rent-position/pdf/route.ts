import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { formatMoney } from "@/lib/finance";
import { getRentPositionData } from "@/lib/rent-position";
import { RentPositionDocument } from "@/lib/pdf/rent-position";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  partial: "Partially Paid",
  duesoon: "Due",
  overdue: "Overdue",
};

/** The printable version of /protected/finances/rent-position (spec #32). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const propertyFilter = request.nextUrl.searchParams.get("property") ?? "all";

  const [{ rows, totals }, property] = await Promise.all([
    getRentPositionData(propertyFilter),
    propertyFilter !== "all"
      ? prisma.property.findUnique({
          where: { id: propertyFilter },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const pdfBuffer = await renderToBuffer(
    RentPositionDocument({
      scopeLabel: property ? property.name : "All properties",
      totalRaised: formatMoney(totals.totalRaised).replace("OMR", "").trim(),
      totalCollected: formatMoney(totals.totalCollected).replace("OMR", "").trim(),
      totalOutstanding: formatMoney(totals.totalOutstanding).replace("OMR", "").trim(),
      rows: rows.map((row) => ({
        ownerLabel: row.ownerLabel,
        buildingLabel: row.buildingLabel,
        unitLabel: row.unitLabel,
        tenantName: row.tenantName,
        raised: formatMoney(row.raised).replace("OMR", "").trim(),
        collected: formatMoney(row.collected).replace("OMR", "").trim(),
        outstanding: formatMoney(row.outstanding).replace("OMR", "").trim(),
        nextDueDate: row.nextDueDate ? format(row.nextDueDate, "d MMM yyyy") : "—",
        status: STATUS_LABEL[row.bucket],
      })),
      generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
    }),
  );

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rent-position-${format(new Date(), "yyyy-MM-dd")}.pdf"`,
    },
  });
}
