import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { formatMoney, moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import {
  UnitLedgerStatementDocument,
  type UnitLedgerFundGroup,
  type UnitLedgerRow,
} from "@/lib/pdf/unit-ledger-statement";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

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
      fundBalances: {
        select: { fundId: true, balance: true, fund: { select: { label: true } } },
      },
      serviceChargeInvoices: {
        select: {
          invoiceNumber: true,
          issueDate: true,
          currentAmount: true,
          fundId: true,
          fund: { select: { label: true } },
        },
        orderBy: { issueDate: "asc" },
      },
      serviceChargePayments: {
        select: {
          paidAt: true,
          amount: true,
          fundId: true,
          fund: { select: { label: true } },
          note: true,
        },
        orderBy: { paidAt: "asc" },
      },
    },
  });

  if (!unit) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }
  if (user.userType !== UserType.admin && unit.ownerId !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerName = unit.owner
    ? [unit.owner.firstName, unit.owner.lastName].filter(Boolean).join(" ") ||
      unit.owner.email
    : "Unassigned owner";

  const unitLabel = formatUnitLabel(unit.property.propertyType, unit.label);

  const fundIds = new Set<string>();
  unit.fundBalances.forEach((b) => fundIds.add(b.fundId));
  unit.serviceChargeInvoices.forEach((i) => fundIds.add(i.fundId));
  unit.serviceChargePayments.forEach((p) => p.fundId && fundIds.add(p.fundId));

  const fundLabelById = new Map<string, string>();
  unit.fundBalances.forEach((b) => fundLabelById.set(b.fundId, b.fund.label));
  unit.serviceChargeInvoices.forEach((i) =>
    fundLabelById.set(i.fundId, i.fund.label),
  );
  unit.serviceChargePayments.forEach(
    (p) => p.fundId && p.fund && fundLabelById.set(p.fundId, p.fund.label),
  );

  const fundGroups: UnitLedgerFundGroup[] = Array.from(fundIds)
    .map((fundId) => {
      const entries: {
        date: Date;
        description: string;
        debit: number;
        credit: number;
      }[] = [
        ...unit.serviceChargeInvoices
          .filter((i) => i.fundId === fundId)
          .map((i) => ({
            date: i.issueDate,
            description: `Service charge invoice #${i.invoiceNumber}`,
            debit: moneyValue(i.currentAmount),
            credit: 0,
          })),
        ...unit.serviceChargePayments
          .filter((p) => p.fundId === fundId)
          .map((p) => ({
            date: p.paidAt,
            description: p.note ? `Payment — ${p.note}` : "Payment",
            debit: 0,
            credit: moneyValue(p.amount),
          })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime());

      let running = 0;
      const rows: UnitLedgerRow[] = entries.map((entry) => {
        running += entry.debit - entry.credit;
        return {
          date: format(entry.date, "dd/MM/yyyy"),
          description: entry.description,
          debit: entry.debit > 0 ? formatMoney(entry.debit) : null,
          credit: entry.credit > 0 ? formatMoney(entry.credit) : null,
          running:
            running < 0
              ? `Credit ${formatMoney(Math.abs(running))}`
              : formatMoney(running),
          runningNegative: running < 0,
        };
      });

      return {
        label: fundLabelById.get(fundId) ?? "Fund",
        closingBalance:
          running < 0
            ? `Credit ${formatMoney(Math.abs(running))}`
            : formatMoney(running),
        closingNegative: running < 0,
        rows,
      };
    })
    .filter((g) => g.rows.length > 0);

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
      fundGroups,
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
