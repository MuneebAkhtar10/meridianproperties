import "server-only";

import { approvedTotal, moneyValue } from "@/lib/finance";
import {
  formatUnitLabel,
  PROPERTY_MANAGEMENT_CATEGORY_LABEL,
  propertyManagementCategory,
} from "@/lib/property-types";
import { personDisplayName } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { ChargeType, PaymentStatus } from "@/lib/generated/prisma/client";

export type OwnerReportUnitRow = {
  unitId: string;
  propertyId: string;
  propertyName: string;
  buildingNumber: string | null;
  unitLabel: string;
  managementCategory: string;
  tenantName: string | null;
  monthlyRent: number;
  rentCollected: number;
  expenses: number;
  serviceChargeBalance: number;
  net: number;
};

export type OwnerReportData = {
  owner: { id: string; name: string; email: string; phone: string | null };
  from: Date;
  to: Date;
  rows: OwnerReportUnitRow[];
  totals: {
    propertyCount: number;
    unitCount: number;
    occupiedCount: number;
    totalMonthlyRent: number;
    totalRentCollected: number;
    totalExpenses: number;
    totalServiceChargeBalance: number;
    netToOwner: number;
  };
};

/**
 * A portfolio-wide statement for one landlord — every unit they own across
 * every property, with rent collected and expenses logged against each one
 * over the chosen period, netting to what's owed back to them overall.
 * Mirrors the single-tenancy Landlord Statement (lib/unit-rent-statement.ts)
 * rolled up across an owner's whole portfolio instead of one unit.
 */
export async function getOwnerReport(
  ownerId: string,
  period: { from: Date; to: Date },
): Promise<OwnerReportData | null> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true },
  });
  if (!owner) return null;

  const units = await prisma.unit.findMany({
    where: { ownerId },
    orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
    select: {
      id: true,
      propertyId: true,
      label: true,
      serviceChargeBalance: true,
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
      tenancies: {
        where: { endDate: null },
        take: 1,
        select: {
          monthlyRent: true,
          tenant: { select: { firstName: true, lastName: true, email: true } },
          charges: {
            where: {
              type: ChargeType.rent,
              periodStart: { gte: period.from, lte: period.to },
            },
            select: {
              payments: {
                where: { status: PaymentStatus.approved },
                select: { amount: true, status: true, collectedBy: true },
              },
            },
          },
        },
      },
      expenseLinks: {
        where: {
          expense: {
            date: { gte: period.from, lte: period.to },
            ownerChargeMethod: "extra_charge",
          },
        },
        select: { expense: { select: { amount: true, paidBy: true } } },
      },
    },
  });

  const rows: OwnerReportUnitRow[] = units.map((unit) => {
    const tenancy = unit.tenancies[0] ?? null;
    const rentCollected = tenancy
      ? tenancy.charges.reduce(
          (sum, charge) =>
            sum +
            approvedTotal(
              charge.payments.filter((payment) => payment.collectedBy !== "owner"),
            ),
          0,
        )
      : 0;
    const expenses = unit.expenseLinks.reduce(
      (sum, link) =>
        link.expense.paidBy === "owner"
          ? sum
          : sum + moneyValue(link.expense.amount),
      0,
    );
    const serviceChargeBalance = moneyValue(unit.serviceChargeBalance);

    return {
      unitId: unit.id,
      propertyId: unit.propertyId,
      propertyName: unit.property.name,
      buildingNumber: unit.property.buildingNumber,
      unitLabel: formatUnitLabel(unit.property.propertyType, unit.label),
      managementCategory:
        PROPERTY_MANAGEMENT_CATEGORY_LABEL[
          propertyManagementCategory(unit.property.propertyType)
        ],
      tenantName: tenancy ? personDisplayName(tenancy.tenant) : null,
      monthlyRent: tenancy ? moneyValue(tenancy.monthlyRent) : 0,
      rentCollected,
      expenses,
      serviceChargeBalance,
      net: rentCollected - expenses,
    };
  });

  const propertyIds = new Set(rows.map((row) => row.propertyId));

  const totals = {
    propertyCount: propertyIds.size,
    unitCount: rows.length,
    occupiedCount: rows.filter((row) => row.tenantName).length,
    totalMonthlyRent: rows.reduce((sum, row) => sum + row.monthlyRent, 0),
    totalRentCollected: rows.reduce((sum, row) => sum + row.rentCollected, 0),
    totalExpenses: rows.reduce((sum, row) => sum + row.expenses, 0),
    totalServiceChargeBalance: rows.reduce((sum, row) => sum + row.serviceChargeBalance, 0),
    netToOwner: rows.reduce((sum, row) => sum + row.net, 0),
  };

  return {
    owner: {
      id: owner.id,
      name: personDisplayName(owner),
      email: owner.email,
      phone: owner.phone,
    },
    from: period.from,
    to: period.to,
    rows,
    totals,
  };
}
