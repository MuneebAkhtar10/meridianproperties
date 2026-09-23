import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { formatMoney } from "@/lib/finance";
import { getUnitRentStatement } from "@/lib/unit-rent-statement";
import { UnitRentStatementDocument } from "@/lib/pdf/unit-rent-statement";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

function trimOmr(value: number) {
  // formatMoney puts the sign before "OMR" (e.g. "-OMR 120.000") — stripping
  // the currency label naively would leave a stray space before the digits
  // ("- 120.000"), so the sign is pulled out and reattached to the number.
  const negative = value < 0;
  const digits = formatMoney(Math.abs(value)).replace("OMR", "").trim();
  return negative ? `-${digits}` : digits;
}

/** The printable per-tenancy rent statement — spec's "Building/Owner
 * Information", "Resident/Tenant Information", "Rental Collection" and
 * "Expense Sheet" sections, netted to a balance. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenancyId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
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

  const pdfBuffer = await renderToBuffer(
    UnitRentStatementDocument({
      propertyName: statement.propertyName,
      unitLabel: statement.unitLabel,
      periodLabel: `${format(statement.from, "d MMM yyyy")} – ${format(statement.to, "d MMM yyyy")}`,
      buildingInfo: [
        { label: "Building No.", value: statement.buildingNumber ?? "—", icon: "hash" },
        { label: "Unit No.", value: statement.unitLabel, icon: "home" },
        { label: "Owner Name", value: statement.ownerName, icon: "user" },
        { label: "Owner Mobile", value: statement.ownerMobile ?? "—", icon: "phone" },
        {
          label: "Rent (Monthly)",
          value: `OMR ${trimOmr(statement.monthlyRent)}`,
          icon: "coins",
        },
        {
          label: "BHK",
          value: statement.bedrooms != null ? `${statement.bedrooms} BHK` : "—",
          icon: "bedDouble",
        },
      ],
      tenantInfo: [
        { label: "Name", value: statement.tenantName, icon: "user" },
        { label: "ID No.", value: statement.tenantCivilId ?? "—", icon: "idCard" },
        { label: "Mobile", value: statement.tenantMobile ?? "—", icon: "phone" },
        {
          label: "Payment Method",
          value: statement.paymentMethod ?? "—",
          icon: "creditCard",
        },
        { label: "Agreement No.", value: statement.agreementNo ?? "—", icon: "fileText" },
        {
          label: "Agreement Period",
          value: statement.agreementPeriod,
          icon: "calendar",
        },
        {
          label: "Check-in Date",
          value: format(statement.checkInDate, "d MMM yyyy"),
          icon: "calendarCheck",
        },
        {
          label: "Security Deposit",
          value: `OMR ${trimOmr(statement.securityDeposit)}`,
          icon: "shield",
        },
        { label: "Paid By", value: statement.paidBy ?? "—", icon: "wallet" },
        {
          label: "Starting Date",
          value: format(statement.from, "d MMM yyyy"),
          icon: "calendarCheck",
        },
        {
          label: "Expire Date",
          value: format(statement.to, "d MMM yyyy"),
          icon: "calendarX",
        },
      ],
      monthlyRows: statement.monthlyRows.map((row) => ({
        month: row.month,
        transactionDate: row.transactionDate
          ? format(row.transactionDate, "d MMM yyyy")
          : "—",
        amount: trimOmr(row.amount),
        receivedBy: row.receivedBy,
      })),
      expenseRows: statement.expenseRows.map((row) => ({
        description: row.description,
        amount: trimOmr(row.amount),
      })),
      totalRentCollected: trimOmr(statement.totalRentCollected),
      totalRentCollectedWithLandlord:
        statement.totalRentCollectedWithLandlord > 0
          ? trimOmr(statement.totalRentCollectedWithLandlord)
          : null,
      totalExpenses: trimOmr(statement.totalExpenses),
      balanceLabel: statement.balanceOwedToLandlord
        ? "Balance Amount to Landlord"
        : "Balance Amount to Collect from Landlord",
      balance: trimOmr(statement.balance),
      generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
    }),
  );

  const filename = `landlord-statement-${statement.unitLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
