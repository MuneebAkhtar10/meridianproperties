import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { formatMoney } from "@/lib/finance";
import { getUnitRentStatement } from "@/lib/unit-rent-statement";
import { UnitRentStatementDocument } from "@/lib/pdf/unit-rent-statement";
import { getCurrentUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

function trimOmr(value: number) {
  return formatMoney(value).replace("OMR", "").trim();
}

/** The printable per-tenancy rent statement — spec's "Building/Owner
 * Information", "Resident/Tenant Information", "Rental Collection" and
 * "Expense Sheet" sections, netted to a balance. */
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

  const pdfBuffer = await renderToBuffer(
    UnitRentStatementDocument({
      propertyName: statement.propertyName,
      periodLabel: `${format(statement.from, "d MMM yyyy")} – ${format(statement.to, "d MMM yyyy")}`,
      buildingInfo: [
        { label: "Building No.", value: statement.buildingNumber ?? "—" },
        { label: "Unit No.", value: statement.unitLabel },
        { label: "Owner Name", value: statement.ownerName },
        { label: "Owner Mobile", value: statement.ownerMobile ?? "—" },
        { label: "Rent (Monthly)", value: `OMR ${trimOmr(statement.monthlyRent)}` },
        {
          label: "BHK",
          value: statement.bedrooms != null ? `${statement.bedrooms} BHK` : "—",
        },
      ],
      tenantInfo: [
        { label: "Name", value: statement.tenantName },
        { label: "Mobile", value: statement.tenantMobile ?? "—" },
        { label: "ID No.", value: statement.tenantCivilId ?? "—" },
        { label: "Agreement No.", value: statement.agreementNo ?? "—" },
        { label: "Agreement Period", value: statement.agreementPeriod },
        { label: "Paid By", value: statement.paidBy ?? "—" },
        { label: "Check-in Date", value: format(statement.checkInDate, "d MMM yyyy") },
        {
          label: "Security Deposit",
          value: `OMR ${trimOmr(statement.securityDeposit)}`,
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
      totalExpenses: trimOmr(statement.totalExpenses),
      balanceLabel: statement.balanceOwedToLandlord
        ? "Balance Amount to Landlord"
        : "Balance Amount to Collect from Landlord",
      balance: trimOmr(statement.balance),
      generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
    }),
  );

  const filename = `rent-statement-${statement.unitLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
