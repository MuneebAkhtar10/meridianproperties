import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

import { getBuildingRentSummary } from "@/lib/building-rent-summary";
import { buildCsv } from "@/lib/csv";
import { monthInputValue } from "@/lib/finance";
import { getCurrentUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || (user.userType !== UserType.admin && user.userType !== UserType.owner)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const raw = request.nextUrl.searchParams.get("month") ?? "";
  const monthValue = /^\d{4}-\d{2}$/.test(raw) ? raw : monthInputValue();

  const summary = await getBuildingRentSummary(
    id,
    new Date(`${monthValue}-01T00:00:00.000Z`),
    user.userType === UserType.owner ? user.id : undefined,
  );
  if (!summary) return NextResponse.json({ error: "Property not found." }, { status: 404 });

  const csv = buildCsv(
    ["Unit", "Tenant", "Rent due", "Paid", "Balance", "Paid on", "Method", "Status"],
    [
      ...summary.rows.map((r) => [
        r.unitLabel,
        r.tenantName ?? "",
        r.rentDue.toFixed(3),
        r.paid.toFixed(3),
        r.balance.toFixed(3),
        r.paidOn ? format(r.paidOn, "dd/MM/yyyy") : "",
        r.method ?? "",
        r.status,
      ]),
      ["Total", "", summary.totals.rentDue.toFixed(3), summary.totals.paid.toFixed(3), summary.totals.balance.toFixed(3), "", "", ""],
    ],
  );
  const filename = `rent-summary-${summary.propertyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${monthValue}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
