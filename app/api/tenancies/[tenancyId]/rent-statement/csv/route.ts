import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

import { buildCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/finance";
import { getUnitRentStatement } from "@/lib/unit-rent-statement";
import { getCurrentUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

function trimOmr(value: number) {
  return formatMoney(value).replace("OMR", "").trim();
}

/** Same data as the PDF rent statement, as a flat CSV: building/tenant
 * info rows, then the month-by-month collection log, then the expense
 * sheet, then the summary — one sheet, opens directly in Excel. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenancyId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.userType !== UserType.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenancyId } = await params;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required." }, { status: 400 });
  }

  const statement = await getUnitRentStatement(tenancyId, {
    from: new Date(from),
    to: new Date(to),
  });
  if (!statement) {
    return NextResponse.json({ error: "Tenancy not found." }, { status: 404 });
  }

  const rows: (string | number)[][] = [
    ["Building No.", statement.buildingNumber ?? "—"],
    ["Unit No.", statement.unitLabel],
    ["Owner Name", statement.ownerName],
    ["Owner Mobile", statement.ownerMobile ?? "—"],
    ["Rent (Monthly)", trimOmr(statement.monthlyRent)],
    ["BHK", statement.bedrooms ?? "—"],
    [],
    ["Resident / Tenant Information"],
    ["Name", statement.tenantName],
    ["Mobile", statement.tenantMobile ?? "—"],
    ["ID No.", statement.tenantCivilId ?? "—"],
    ["Agreement No.", statement.agreementNo ?? "—"],
    ["Agreement Period", statement.agreementPeriod],
    ["Paid By", statement.paidBy ?? "—"],
    ["Check-in Date", format(statement.checkInDate, "dd/MM/yyyy")],
    ["Security Deposit", trimOmr(statement.securityDeposit)],
    [],
    ["Rental Collection"],
    ["Month", "Transaction Date", "Amount", "Received By"],
    ...statement.monthlyRows.map((row) => [
      row.month,
      row.transactionDate ? format(row.transactionDate, "dd/MM/yyyy") : "—",
      trimOmr(row.amount),
      row.receivedBy,
    ]),
    ["Total Rent Collected with Company", "", trimOmr(statement.totalRentCollected), ""],
    [],
    ["Expense Sheet"],
    ["Description", "Amount"],
    ...statement.expenseRows.map((row) => [row.description, trimOmr(row.amount)]),
    ["Total Expenses", trimOmr(statement.totalExpenses)],
    [],
    ["Summary"],
    [
      statement.balanceOwedToLandlord
        ? "Balance Amount to Landlord"
        : "Balance Amount to Collect from Landlord",
      trimOmr(statement.balance),
    ],
  ];

  const csv = buildCsv(["Building / Owner Information"], rows);
  const filename = `rent-statement-${statement.unitLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
