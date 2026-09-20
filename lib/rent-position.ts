import "server-only";

import {
  approvedTotal,
  chargeBalance,
  moneyValue,
  pendingTotal,
} from "@/lib/finance";
import { formatUnitLabel, isIndependentType } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { ChargeStatus } from "@/lib/generated/prisma/client";

export type RentPositionBucket = "overdue" | "duesoon" | "partial" | "paid";

export type RentPositionRow = {
  id: string;
  tenancyId: string;
  propertyId: string;
  propertyName: string;
  ownerLabel: string;
  buildingLabel: string;
  floor: number | null;
  unitLabel: string;
  tenantName: string;
  monthlyRent: number;
  raised: number;
  collected: number;
  outstanding: number;
  nextDueDate: Date | null;
  bucket: RentPositionBucket;
  independent: boolean;
};

export type RentPositionTotals = {
  totalRaised: number;
  totalCollected: number;
  totalOutstanding: number;
  paidCount: number;
  partialCount: number;
  dueSoonCount: number;
  overdueCount: number;
};

/** Shared between the Rent Position dashboard and its PDF export (spec
 * #32) so the two never drift apart — same query, same bucket math.
 * "Paid | Partially Paid | Due | Overdue" per unit, reusing the same
 * chargeBalance/chargeDisplayStatus building blocks the Finances ledger
 * already uses per-charge, rolled up to one bucket per unit. */
export async function getRentPositionData(
  propertyFilter: string,
): Promise<{ rows: RentPositionRow[]; totals: RentPositionTotals }> {
  const tenancies = await prisma.tenancy.findMany({
    where: {
      endDate: null,
      unit: {
        rentBillsEnabled: true,
        ...(propertyFilter !== "all" ? { propertyId: propertyFilter } : {}),
        property: { propertyType: { isOwnerAssociation: false } },
      },
    },
    orderBy: [{ unit: { property: { name: "asc" } } }, { unit: { label: "asc" } }],
    select: {
      id: true,
      unitId: true,
      monthlyRent: true,
      tenant: { select: { firstName: true, lastName: true, email: true } },
      unit: {
        select: {
          id: true,
          label: true,
          floor: true,
          propertyId: true,
          property: {
            select: {
              name: true,
              buildingNumber: true,
              propertyType: {
                select: {
                  unitPrefix: true,
                  hasFloors: true,
                  isOwnerAssociation: true,
                  isBuildingManagement: true,
                  showRentBills: true,
                  showMaintenance: true,
                  hasCommonAreas: true,
                },
              },
            },
          },
          owner: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      charges: {
        where: { status: { not: ChargeStatus.waived } },
        select: {
          amount: true,
          status: true,
          dueDate: true,
          payments: { select: { amount: true, status: true } },
        },
      },
    },
  });

  const totals: RentPositionTotals = {
    totalRaised: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    paidCount: 0,
    partialCount: 0,
    dueSoonCount: 0,
    overdueCount: 0,
  };

  const today = new Date();

  const rows: RentPositionRow[] = tenancies.map((tenancy) => {
    const raised = tenancy.charges.reduce(
      (sum, c) => sum + moneyValue(c.amount),
      0,
    );
    const collected = tenancy.charges.reduce(
      (sum, c) => sum + approvedTotal(c.payments),
      0,
    );
    const pending = tenancy.charges.reduce(
      (sum, c) => sum + pendingTotal(c.payments),
      0,
    );
    const outstanding = tenancy.charges.reduce(
      (sum, c) => sum + chargeBalance(c),
      0,
    );

    const openCharges = tenancy.charges.filter((c) => chargeBalance(c) > 0);
    const hasOverdue = openCharges.some((c) => c.dueDate < today);
    const hasPartialPayment = collected > 0 || pending > 0;

    let bucket: RentPositionBucket;
    if (outstanding <= 0) {
      bucket = "paid";
    } else if (hasOverdue) {
      bucket = "overdue";
    } else if (hasPartialPayment) {
      bucket = "partial";
    } else {
      bucket = "duesoon";
    }

    const nextDueDate = openCharges.length
      ? openCharges.reduce(
          (earliest, c) => (c.dueDate < earliest ? c.dueDate : earliest),
          openCharges[0].dueDate,
        )
      : null;

    totals.totalRaised += raised;
    totals.totalCollected += collected;
    totals.totalOutstanding += outstanding;
    if (bucket === "paid") totals.paidCount++;
    if (bucket === "partial") totals.partialCount++;
    if (bucket === "duesoon") totals.dueSoonCount++;
    if (bucket === "overdue") totals.overdueCount++;

    return {
      id: tenancy.unitId,
      tenancyId: tenancy.id,
      propertyId: tenancy.unit.propertyId,
      propertyName: tenancy.unit.property.name,
      ownerLabel: tenancy.unit.owner
        ? [tenancy.unit.owner.firstName, tenancy.unit.owner.lastName]
            .filter(Boolean)
            .join(" ") || tenancy.unit.owner.email
        : "Unassigned",
      buildingLabel: tenancy.unit.property.buildingNumber ?? tenancy.unit.property.name,
      floor: tenancy.unit.floor,
      unitLabel: formatUnitLabel(tenancy.unit.property.propertyType, tenancy.unit.label),
      tenantName:
        [tenancy.tenant.firstName, tenancy.tenant.lastName]
          .filter(Boolean)
          .join(" ") || tenancy.tenant.email,
      monthlyRent: moneyValue(tenancy.monthlyRent),
      raised,
      collected,
      outstanding,
      nextDueDate,
      bucket,
      independent: isIndependentType(tenancy.unit.property.propertyType),
    };
  });

  return { rows, totals };
}

export type RentPositionBucketFilter = "all" | RentPositionBucket;

export function filterRentPositionRows(
  rows: RentPositionRow[],
  bucketFilter: RentPositionBucketFilter,
): RentPositionRow[] {
  if (bucketFilter === "all") return rows;
  return rows.filter((row) => row.bucket === bucketFilter);
}
