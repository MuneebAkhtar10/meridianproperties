import "server-only";

import { differenceInCalendarMonths, format } from "date-fns";

import { moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { ChargeType, PaymentStatus } from "@/lib/generated/prisma/client";

export type RentStatementMonthRow = {
  month: string;
  transactionDate: Date | null;
  amount: number;
  receivedBy: string;
};

export type RentStatementExpenseRow = {
  description: string;
  amount: number;
};

export type UnitRentStatement = {
  propertyName: string;
  buildingNumber: string | null;
  unitLabel: string;
  bedrooms: number | null;
  monthlyRent: number;
  ownerName: string;
  ownerMobile: string | null;
  tenantName: string;
  tenantMobile: string | null;
  tenantCivilId: string | null;
  agreementNo: string | null;
  agreementPeriod: string;
  paidBy: string | null;
  checkInDate: Date;
  securityDeposit: number;
  from: Date;
  to: Date;
  monthlyRows: RentStatementMonthRow[];
  expenseRows: RentStatementExpenseRow[];
  totalRentCollected: number;
  totalExpenses: number;
  balance: number;
  /** true = surplus owed to the landlord; false = shortfall the landlord
   * owes back (expenses outran what was collected on their behalf). */
  balanceOwedToLandlord: boolean;
};

/** The person who actually took the cash/cheque — falls back to a sensible
 * label when a payment doesn't name someone specifically. */
function receivedByLabel(
  payment: { receivedByName: string | null; collectedBy: string },
  ownerName: string,
): string {
  if (payment.receivedByName) return payment.receivedByName;
  return payment.collectedBy === "owner" ? ownerName : "Rawazen";
}

/**
 * A single tenancy's rent statement — Building/Owner info, Resident/Tenant
 * info, a month-by-month rent collection log, the unit's own expenses for
 * the period, and the resulting balance. Matches the layout of Rawazen's
 * existing per-unit statement documents. Only offered for the property
 * types that bill individual tenant rent — see isUnitRentStatementType.
 */
export async function getUnitRentStatement(
  tenancyId: string,
  period: { from: Date; to: Date },
): Promise<UnitRentStatement | null> {
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: {
      tenant: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          civilId: true,
        },
      },
      unit: {
        include: {
          property: {
            select: {
              name: true,
              buildingNumber: true,
              propertyType: { select: { unitPrefix: true, hasFloors: true } },
            },
          },
          owner: {
            select: { firstName: true, lastName: true, email: true, phone: true },
          },
        },
      },
      charges: {
        where: {
          type: ChargeType.rent,
          periodStart: { gte: period.from, lte: period.to },
        },
        orderBy: { periodStart: "asc" },
        include: {
          payments: {
            where: { status: PaymentStatus.approved },
            orderBy: { paidAt: "asc" },
            select: {
              amount: true,
              paidAt: true,
              receivedByName: true,
              collectedBy: true,
            },
          },
        },
      },
    },
  });

  if (!tenancy) return null;

  const ownerName = tenancy.unit.owner
    ? [tenancy.unit.owner.firstName, tenancy.unit.owner.lastName]
        .filter(Boolean)
        .join(" ") || tenancy.unit.owner.email
    : "Unassigned owner";
  const tenantName =
    [tenancy.tenant.firstName, tenancy.tenant.lastName].filter(Boolean).join(" ") ||
    tenancy.tenant.email;

  const monthlyRows: RentStatementMonthRow[] = tenancy.charges.map((charge) => {
    const payment = charge.payments[0];
    return {
      month: format(charge.periodStart ?? charge.dueDate, "MMM-yy"),
      transactionDate: payment?.paidAt ?? null,
      amount: payment ? moneyValue(payment.amount) : 0,
      receivedBy: payment ? receivedByLabel(payment, ownerName) : "—",
    };
  });

  const expenseUnits = await prisma.expenseUnit.findMany({
    where: {
      unitId: tenancy.unitId,
      expense: {
        date: { gte: period.from, lte: period.to },
        // Deducted-from-service-charge expenses don't reduce the balance
        // owed to the landlord here — they're absorbed by the OA service
        // charge already being collected, not billed against this rent.
        ownerChargeMethod: "extra_charge",
      },
    },
    select: {
      expense: {
        select: { description: true, amount: true, category: { select: { label: true } } },
      },
    },
    orderBy: { expense: { date: "asc" } },
  });

  const expenseRows: RentStatementExpenseRow[] = expenseUnits.map(({ expense }) => ({
    description: expense.description || expense.category.label,
    amount: moneyValue(expense.amount),
  }));

  const totalRentCollected = monthlyRows.reduce((sum, row) => sum + row.amount, 0);
  const totalExpenses = expenseRows.reduce((sum, row) => sum + row.amount, 0);
  const balance = totalRentCollected - totalExpenses;

  const agreementStart = tenancy.agreementStartDate ?? tenancy.startDate;
  const agreementMonths = tenancy.leaseEndDate
    ? Math.max(1, differenceInCalendarMonths(tenancy.leaseEndDate, agreementStart) + 1)
    : null;

  return {
    propertyName: tenancy.unit.property.name,
    buildingNumber: tenancy.unit.property.buildingNumber,
    unitLabel: formatUnitLabel(tenancy.unit.property.propertyType, tenancy.unit.label),
    bedrooms: tenancy.unit.bedrooms,
    monthlyRent: moneyValue(tenancy.monthlyRent),
    ownerName,
    ownerMobile: tenancy.unit.owner?.phone ?? null,
    tenantName,
    tenantMobile: tenancy.tenant.phone,
    tenantCivilId: tenancy.tenant.civilId,
    agreementNo: tenancy.agreementRef,
    agreementPeriod: agreementMonths ? `${agreementMonths} Months` : "—",
    paidBy: tenancy.paidBy,
    checkInDate: tenancy.startDate,
    securityDeposit: moneyValue(tenancy.securityDeposit),
    from: period.from,
    to: period.to,
    monthlyRows,
    expenseRows,
    totalRentCollected,
    totalExpenses,
    balance: Math.abs(balance),
    balanceOwedToLandlord: balance >= 0,
  };
}
