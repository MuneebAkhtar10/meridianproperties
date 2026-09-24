import "server-only";

import { differenceInCalendarMonths, format } from "date-fns";

import { moneyValue, PAYMENT_METHOD_LABEL } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { ChargeType, PaymentStatus } from "@/lib/generated/prisma/client";

export type RentStatementMonthRow = {
  month: string;
  transactionDate: Date | null;
  amount: number;
  receivedBy: string;
  collectedBy: "management" | "owner";
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
  /** How the tenant most recently paid, for display alongside the other
   * resident fields — derived from the latest payment in the period rather
   * than stored on the tenancy itself, since a tenant's method can vary
   * charge to charge. Null when no payment has been recorded yet. */
  paymentMethod: string | null;
  checkInDate: Date;
  securityDeposit: number;
  from: Date;
  to: Date;
  monthlyRows: RentStatementMonthRow[];
  expenseRows: RentStatementExpenseRow[];
  /** Rent the company actually took in — this is what settles against expenses. */
  totalRentCollected: number;
  /** Rent the landlord already took directly — shown on the statement, not settled. */
  totalRentCollectedWithLandlord: number;
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
 * the period (including the unit's own OA-style general service charge as
 * a line, netted to a minus when it's already been settled separately —
 * see the service charge block below), and the resulting balance. Matches
 * the layout of Rawazen's existing per-unit statement documents ("Landlord
 * Statement"). Only offered for "Independent" property types — a
 * standalone rental with its own landlord — see isIndependentType.
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
              method: true,
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

  const monthlyRows: RentStatementMonthRow[] = tenancy.charges.flatMap((charge): RentStatementMonthRow[] => {
    const month = format(charge.periodStart ?? charge.dueDate, "MMM-yy");
    if (charge.payments.length === 0) {
      return [
        {
          month,
          transactionDate: null,
          amount: 0,
          receivedBy: "—",
          collectedBy: "management" as const,
        },
      ];
    }
    return charge.payments.map((payment) => ({
      month,
      transactionDate: payment.paidAt,
      amount: moneyValue(payment.amount),
      receivedBy: receivedByLabel(payment, ownerName),
      collectedBy:
        payment.collectedBy === "owner"
          ? ("owner" as const)
          : ("management" as const),
    }));
  });

  // How the tenant most recently paid — the latest payment found across the
  // period's charges, since a tenant's method can vary from month to month.
  const latestPayment = tenancy.charges
    .flatMap((charge) => charge.payments)
    .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())
    .at(-1);
  const paymentMethod = latestPayment ? PAYMENT_METHOD_LABEL[latestPayment.method] : null;

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
        select: {
          description: true,
          amount: true,
          paidBy: true,
          category: { select: { label: true } },
        },
      },
    },
    orderBy: { expense: { date: "asc" } },
  });

  // Only company-paid extras settle against rent Rawazen collected. Owner-paid
  // bills never entered company cash, so they must not reduce the remittance.
  const expenseRows: RentStatementExpenseRow[] = expenseUnits
    .filter(({ expense }) => expense.paidBy !== "owner")
    .map(({ expense }) => ({
      description: expense.description || expense.category.label,
      amount: moneyValue(expense.amount),
    }));

  // The unit's own OA-style general service charge (Rawazen's management
  // fee for this landlord) is billed separately from tenant rent, but still
  // reduces what's remitted back to the landlord — unless the landlord has
  // already settled it directly, in which case deducting it here again
  // would double-count it, so it's added back as a negative line instead.
  // Reported against the unit's latest invoice regardless of whether it
  // falls inside this statement's own rent period, since the next service
  // charge cycle is typically already invoiced by the time a statement is
  // produced (matches Rawazen's own reference statements).
  const latestServiceChargeInvoice = await prisma.serviceChargeInvoice.findFirst({
    where: { unitId: tenancy.unitId },
    orderBy: { issueDate: "desc" },
    select: {
      currentAmount: true,
      periodStart: true,
      periodEnd: true,
      fund: { select: { label: true, id: true } },
    },
  });
  if (latestServiceChargeInvoice) {
    const fundBalance = await prisma.unitFundBalance.findUnique({
      where: {
        unitId_fundId: { unitId: tenancy.unitId, fundId: latestServiceChargeInvoice.fund.id },
      },
      select: { balance: true },
    });
    const settled = (fundBalance ? moneyValue(fundBalance.balance) : 0) <= 0;
    const amount = moneyValue(latestServiceChargeInvoice.currentAmount);
    expenseRows.push({
      description: `${latestServiceChargeInvoice.fund.label} (${format(
        latestServiceChargeInvoice.periodStart,
        "MMM yy",
      )} to ${format(latestServiceChargeInvoice.periodEnd, "MMM yy")})`,
      amount: settled ? -amount : amount,
    });
  }

  const totalRentCollected = monthlyRows
    .filter((row) => row.collectedBy !== "owner")
    .reduce((sum, row) => sum + row.amount, 0);
  const totalRentCollectedWithLandlord = monthlyRows
    .filter((row) => row.collectedBy === "owner")
    .reduce((sum, row) => sum + row.amount, 0);
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
    paymentMethod,
    checkInDate: tenancy.startDate,
    securityDeposit: moneyValue(tenancy.securityDeposit),
    from: period.from,
    to: period.to,
    monthlyRows,
    expenseRows,
    totalRentCollected,
    totalRentCollectedWithLandlord,
    totalExpenses,
    balance: Math.abs(balance),
    balanceOwedToLandlord: balance >= 0,
  };
}
