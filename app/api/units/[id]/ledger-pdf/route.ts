import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { formatMoney, moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import {
  UnitLedgerStatementDocument,
  type UnitLedgerRow,
} from "@/lib/pdf/unit-ledger-statement";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { ownerAtDate, personName } from "@/lib/unit-owner-at";

/** Admin, or the unit's own owner — same access rule as the ledger page
 * itself (app/protected/properties/[id]/units/[unitId]/ledger/page.tsx). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: unitId } = await params;
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: {
      property: {
        select: {
          name: true,
          buildingNumber: true,
          propertyType: { select: { unitPrefix: true, hasFloors: true } },
        },
      },
      owner: { select: { firstName: true, lastName: true, email: true } },
      ownershipTransfers: {
        orderBy: { transferDate: "asc" },
        select: {
          transferDate: true,
          fromOwner: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      serviceChargeInvoices: {
        select: {
          invoiceNumber: true,
          issueDate: true,
          dueDate: true,
          graceDays: true,
          periodStart: true,
          periodEnd: true,
          currentAmount: true,
          billedOwner: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { issueDate: "asc" },
      },
      serviceChargePayments: {
        select: {
          paidAt: true,
          amount: true,
          transactionNumber: true,
          note: true,
          billedOwner: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { paidAt: "asc" },
      },
    },
  });

  if (!unit) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }
  if (!isStaffAdmin(user.userType) && unit.ownerId !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerName = unit.owner
    ? [unit.owner.firstName, unit.owner.lastName].filter(Boolean).join(" ") ||
      unit.owner.email
    : "Unassigned owner";

  const unitLabel = formatUnitLabel(unit.property.propertyType, unit.label);

  const entries: {
    dueOrPaidDate: Date;
    sortDate: Date;
    issueDate: Date | null;
    graceDays: number | null;
    transNumber: string | null;
    description: string;
    ownerName: string;
    periodLabel: string | null;
    debit: number;
    credit: number;
  }[] = [
    ...unit.serviceChargeInvoices.map((i) => ({
      dueOrPaidDate: i.dueDate,
      sortDate: i.issueDate,
      issueDate: i.issueDate,
      graceDays: i.graceDays,
      transNumber: i.invoiceNumber,
      description: "Service charge invoice",
      ownerName:
        personName(
          ownerAtDate({
            asOf: i.issueDate,
            currentOwner: unit.owner,
            billedOwner: i.billedOwner,
            transfers: unit.ownershipTransfers,
          }),
        ) ?? "Unassigned",
      periodLabel: `${format(i.periodStart, "MMM yyyy")} – ${format(i.periodEnd, "MMM yyyy")}`,
      debit: moneyValue(i.currentAmount),
      credit: 0,
    })),
    ...unit.serviceChargePayments.map((p) => ({
      dueOrPaidDate: p.paidAt,
      sortDate: p.paidAt,
      issueDate: null,
      graceDays: null,
      transNumber: p.transactionNumber,
      description: p.note ? `Payment — ${p.note}` : "Payment",
      ownerName:
        personName(
          ownerAtDate({
            asOf: p.paidAt,
            currentOwner: unit.owner,
            billedOwner: p.billedOwner,
            transfers: unit.ownershipTransfers,
          }),
        ) ?? "Unassigned",
      periodLabel: null,
      debit: 0,
      credit: moneyValue(p.amount),
    })),
  ].sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

  let running = 0;
  const rowsChronological: UnitLedgerRow[] = entries.map((entry) => {
    running += entry.debit - entry.credit;
    const amount = entry.debit > 0 ? entry.debit : -entry.credit;
    return {
      dueOrPaidDate: format(entry.dueOrPaidDate, "dd/MM/yyyy"),
      issueDate: entry.issueDate ? format(entry.issueDate, "dd/MM/yyyy") : "—",
      grace: entry.graceDays ? `${entry.graceDays}d` : "—",
      transNumber: entry.transNumber ?? "—",
      description: entry.description,
      ownerName: entry.ownerName,
      period: entry.periodLabel ?? "—",
      amount:
        amount < 0 ? `(${formatMoney(Math.abs(amount))})` : formatMoney(amount),
      amountNegative: amount < 0,
      running:
        running < 0
          ? `Credit ${formatMoney(Math.abs(running))}`
          : formatMoney(running),
      runningNegative: running < 0,
    };
  });

  // Oldest first, matching the on-screen ledger.
  const rows = rowsChronological;
  const totalBalance = moneyValue(unit.serviceChargeBalance);

  const pdfBuffer = await renderToBuffer(
    UnitLedgerStatementDocument({
      associationName: unit.property.name,
      buildingNumber: unit.property.buildingNumber ?? "—",
      unitNo: unitLabel,
      entitlements: unit.entitlements != null ? String(unit.entitlements) : "—",
      ownerName,
      totalBalance:
        totalBalance < 0
          ? `Credit ${formatMoney(Math.abs(totalBalance))}`
          : formatMoney(totalBalance),
      totalNegative: totalBalance < 0,
      rows,
      generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
    }),
  );

  const filename = `unit-ledger-${unitLabel.replace(/\s+/g, "-")}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
