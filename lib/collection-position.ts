import "server-only";

import { moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { collectionBucket, type CollectionBucket } from "@/lib/service-charge-status";

export type CollectionPositionRow = {
  id: string;
  propertyId: string;
  ownerLabel: string;
  buildingLabel: string;
  floor: number | null;
  unitLabel: string;
  raised: number;
  paid: number;
  outstanding: number;
  dueDate: Date | null;
  daysOverdue: number;
  lastReminder: Date | null;
  hasPaid: boolean;
  activePlan: {
    installmentCount: number;
    installments: { paidAt: Date | null }[];
  } | null;
  bucket: CollectionBucket;
};

export type CollectionPositionTotals = {
  totalRaised: number;
  totalCollected: number;
  totalOutstanding: number;
  overdueCount: number;
  dueTodayCount: number;
  dueSoonCount: number;
  dueThisMonthCount: number;
  partPaidCount: number;
  noPaymentCount: number;
  paymentPlanCount: number;
  collectedUnitCount: number;
};

/** Shared between the Collection Position dashboard and its PDF export
 * (spec #18) so the two never drift apart — same query, same bucket math. */
export async function getCollectionPositionData(
  propertyFilter: string,
): Promise<{ rows: CollectionPositionRow[]; totals: CollectionPositionTotals }> {
  const units = await prisma.unit.findMany({
    where: {
      serviceChargeAmount: { not: null },
      ...(propertyFilter !== "all" ? { propertyId: propertyFilter } : {}),
    },
    orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
    select: {
      id: true,
      label: true,
      floor: true,
      propertyId: true,
      serviceChargeAmount: true,
      serviceChargeBalance: true,
      serviceChargeDueDate: true,
      serviceChargeLastReminderAt: true,
      property: {
        select: {
          name: true,
          buildingNumber: true,
          propertyType: { select: { unitPrefix: true, hasFloors: true } },
        },
      },
      owner: { select: { firstName: true, lastName: true, email: true } },
      serviceChargeInvoices: { select: { currentAmount: true } },
      serviceChargePayments: { select: { amount: true } },
      installmentPlans: {
        where: { cancelledAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          installmentCount: true,
          installments: { select: { paidAt: true } },
        },
      },
    },
  });

  const totals: CollectionPositionTotals = {
    totalRaised: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    overdueCount: 0,
    dueTodayCount: 0,
    dueSoonCount: 0,
    dueThisMonthCount: 0,
    partPaidCount: 0,
    noPaymentCount: 0,
    paymentPlanCount: 0,
    collectedUnitCount: 0,
  };

  const rows: CollectionPositionRow[] = units.map((unit) => {
    const raised = unit.serviceChargeInvoices.reduce(
      (sum, i) => sum + moneyValue(i.currentAmount),
      0,
    );
    const paid = unit.serviceChargePayments.reduce(
      (sum, p) => sum + moneyValue(p.amount),
      0,
    );
    const balance = moneyValue(unit.serviceChargeBalance);
    const outstanding = Math.max(0, balance);
    const bucket = collectionBucket(unit);
    const activePlan = unit.installmentPlans[0] ?? null;
    const daysOverdue =
      unit.serviceChargeDueDate && bucket === "overdue"
        ? Math.abs(
            Math.round(
              (Date.now() - unit.serviceChargeDueDate.getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : 0;

    totals.totalRaised += raised;
    totals.totalCollected += paid;
    totals.totalOutstanding += outstanding;
    if (paid > 0) totals.collectedUnitCount++;
    if (bucket === "overdue") totals.overdueCount++;
    if (bucket === "dueToday") totals.dueTodayCount++;
    if (bucket === "dueSoon") totals.dueSoonCount++;
    if (bucket === "dueThisMonth") totals.dueThisMonthCount++;
    if (activePlan) totals.paymentPlanCount++;
    if (outstanding > 0 && paid > 0) totals.partPaidCount++;
    if (outstanding > 0 && paid === 0) totals.noPaymentCount++;

    return {
      id: unit.id,
      propertyId: unit.propertyId,
      ownerLabel: unit.owner
        ? [unit.owner.firstName, unit.owner.lastName].filter(Boolean).join(" ") ||
          unit.owner.email
        : "Unassigned",
      buildingLabel: unit.property.buildingNumber ?? unit.property.name,
      floor: unit.floor,
      unitLabel: formatUnitLabel(unit.property.propertyType, unit.label),
      raised,
      paid,
      outstanding,
      dueDate: unit.serviceChargeDueDate,
      daysOverdue,
      lastReminder: unit.serviceChargeLastReminderAt,
      hasPaid: paid > 0,
      activePlan,
      bucket,
    };
  });

  return { rows, totals };
}

export type CollectionPositionBucketFilter =
  | "all"
  | "raised"
  | "collected"
  | "outstanding"
  | "overdue"
  | "dueToday"
  | "dueSoon"
  | "dueThisMonth"
  | "partPaid"
  | "noPayment"
  | "paymentPlan";

export function filterCollectionPositionRows(
  rows: CollectionPositionRow[],
  bucketFilter: CollectionPositionBucketFilter,
): CollectionPositionRow[] {
  return rows.filter((row) => {
    switch (bucketFilter) {
      case "all":
        return true;
      case "raised":
        return row.raised > 0;
      case "collected":
        return row.hasPaid;
      case "outstanding":
        return row.outstanding > 0;
      case "partPaid":
        return row.outstanding > 0 && row.hasPaid;
      case "noPayment":
        return row.outstanding > 0 && !row.hasPaid;
      case "paymentPlan":
        return Boolean(row.activePlan);
      default:
        return row.bucket === bucketFilter;
    }
  });
}
