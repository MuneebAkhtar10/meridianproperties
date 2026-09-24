import "server-only";

import { chargeBalance, moneyValue, PAYMENT_METHOD_LABEL } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import {
  ChargeStatus,
  ChargeType,
  PaymentStatus,
} from "@/lib/generated/prisma/client";

export type RentSummaryStatus = "paid" | "partial" | "unpaid" | "vacant";

export type BuildingRentSummaryRow = {
  unitId: string;
  unitLabel: string;
  tenantName: string | null;
  rentDue: number;
  paid: number;
  balance: number;
  paidOn: Date | null;
  method: string | null;
  status: RentSummaryStatus;
};

export type BuildingRentSummary = {
  propertyName: string;
  monthStart: Date;
  rows: BuildingRentSummaryRow[];
  totals: { rentDue: number; paid: number; balance: number; unitCount: number; paidCount: number };
} | null;

/**
 * Every unit in one building for one month — what rent was due, what has
 * been collected (and how/when), and what's still outstanding. The
 * building-wide monthly view (e.g. all 16 units of one building) rather than
 * one tenancy's own ledger. `month` is any date inside the month wanted.
 */
export async function getBuildingRentSummary(
  propertyId: string,
  month: Date,
  ownerId?: string,
): Promise<BuildingRentSummary> {
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      name: true,
      propertyType: { select: { unitPrefix: true, hasFloors: true } },
      units: {
        where: ownerId ? { ownerId } : undefined,
        orderBy: [{ floor: "asc" }, { label: "asc" }],
        select: {
          id: true,
          label: true,
          tenant: { select: { firstName: true, lastName: true, email: true } },
          charges: {
            where: {
              type: ChargeType.rent,
              status: { not: ChargeStatus.waived },
              OR: [
                { periodStart: { gte: monthStart, lte: monthEnd } },
                { periodStart: null, dueDate: { gte: monthStart, lte: monthEnd } },
              ],
            },
            select: {
              amount: true,
              status: true,
              payments: {
                where: { status: PaymentStatus.approved },
                orderBy: { paidAt: "desc" },
                select: { amount: true, status: true, paidAt: true, method: true },
              },
            },
          },
        },
      },
    },
  });
  if (!property) return null;

  const rows: BuildingRentSummaryRow[] = property.units.map((unit) => {
    const rentDue = unit.charges.reduce((s, c) => s + moneyValue(c.amount), 0);
    const payments = unit.charges.flatMap((c) => c.payments);
    const paid = payments.reduce((s, p) => s + moneyValue(p.amount), 0);
    const balance = unit.charges.reduce((s, c) => s + chargeBalance(c), 0);
    const latest = [...payments].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0];
    const status: RentSummaryStatus =
      unit.charges.length === 0
        ? "vacant"
        : balance <= 0
          ? "paid"
          : paid > 0
            ? "partial"
            : "unpaid";
    return {
      unitId: unit.id,
      unitLabel: formatUnitLabel(property.propertyType, unit.label),
      tenantName: unit.tenant
        ? [unit.tenant.firstName, unit.tenant.lastName].filter(Boolean).join(" ") ||
          unit.tenant.email
        : null,
      rentDue,
      paid,
      balance,
      paidOn: latest?.paidAt ?? null,
      method: latest ? PAYMENT_METHOD_LABEL[latest.method] : null,
      status,
    };
  });

  return {
    propertyName: property.name,
    monthStart,
    rows,
    totals: {
      rentDue: rows.reduce((s, r) => s + r.rentDue, 0),
      paid: rows.reduce((s, r) => s + r.paid, 0),
      balance: rows.reduce((s, r) => s + r.balance, 0),
      unitCount: rows.length,
      paidCount: rows.filter((r) => r.status === "paid").length,
    },
  };
}
