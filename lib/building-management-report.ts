import "server-only";

import { format } from "date-fns";

import { moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { personDisplayName } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { ChargeType, PaymentStatus } from "@/lib/generated/prisma/client";

export type {
  ReportPeriodPreset,
} from "@/lib/report-period";
export {
  REPORT_PERIOD_LABEL,
  parseDateInput,
  resolveReportPeriod,
} from "@/lib/report-period";

export function summaryReportFileStem(propertyName: string, from: Date): string {
  const safe = propertyName.replace(/[\\/:*?"<>|]+/g, " ").trim();
  return `${safe} - ${format(from, "MMMM")} Summary`;
}

export function sumLines(lines: { amount: number }[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}

/** Spec #36 Darsait-style summary — rent collected vs expenses for one
 * Independent or Building Management property over an admin-chosen period. */

export type BuildingManagementReportLine = {
  description: string;
  unitCount: number;
  amount: number;
};

export type RentCollectionDetail = {
  unitLabel: string;
  tenantName: string;
  title: string;
  month: string;
  paidAt: Date;
  amount: number;
};

export type BuildingManagementReportDetailLine = {
  unitLabel: string;
  description: string;
  amount: number;
};

export type BuildingManagementReport = {
  propertyName: string;
  from: Date;
  to: Date;
  /** Independent ("Others") vs BM — drives the report title, not the figures. */
  isBuildingManagement: boolean;
  rentalCollection: {
    withCompany: BuildingManagementReportLine;
    withLandlord: BuildingManagementReportLine;
    total: BuildingManagementReportLine;
  };
  expenseLines: BuildingManagementReportLine[];
  totalExpense: BuildingManagementReportLine;
  finalBalance: number;
  /** "Collect from Landlord" when company-paid expenses outran rent the
   * company collected; "to Landlord" when company collection outran those
   * expenses. Landlord-direct collections are excluded from this net. */
  finalBalanceLabel: "Balance Amount to Collect from Landlord" | "Balance Amount to Landlord";
  expenseDetails: BuildingManagementReportDetailLine[];
  agreementDetails: BuildingManagementReportDetailLine[];
  utilityDetails: BuildingManagementReportDetailLine[];
  companyRentDetails: RentCollectionDetail[];
  landlordRentDetails: RentCollectionDetail[];
};

type ExpenseBucketKey =
  | "adminCleaning"
  | "water"
  | "electricity"
  | "agreementRegistration"
  | "maintenanceOther";

const EXPENSE_BUCKETS: { key: ExpenseBucketKey; label: string }[] = [
  { key: "adminCleaning", label: "Administration fee + Cleaning" },
  { key: "water", label: "General Water Bill" },
  { key: "electricity", label: "General Electricity Bill" },
  { key: "agreementRegistration", label: "Agreement Registration" },
  { key: "maintenanceOther", label: "General Maintenance & Other Expenses" },
];

function bucketFor(categoryName: string, subcategory: string | null): ExpenseBucketKey {
  const sub = (subcategory ?? "").toLowerCase();
  if (categoryName === "agreement_registration") return "agreementRegistration";
  if (categoryName === "administration" || sub.includes("cleaning")) {
    return "adminCleaning";
  }
  if (categoryName === "utilities" && sub.includes("water")) return "water";
  if (categoryName === "utilities" && sub.includes("electric")) return "electricity";
  return "maintenanceOther";
}

function expenseDescription(expense: {
  description: string;
  subcategory: string | null;
  category: { label: string };
}): string {
  return expense.description.trim() || expense.subcategory || expense.category.label;
}

function expenseScopeLabel(
  units: {
    unit: {
      label: string;
      property: { propertyType: { unitPrefix: string | null; hasFloors: boolean } };
    };
  }[],
): string {
  if (units.length === 0) return "General";
  if (units.length === 1) {
    return formatUnitLabel(units[0].unit.property.propertyType, units[0].unit.label);
  }
  return `${units.length} units`;
}

/** Darsait-style summary — rent collected vs expenses for one multi-unit
 * rental property (Building Management or Independent / Others). Shared by
 * the on-screen view, PDF, and Excel. */
export async function getBuildingManagementReport(
  propertyId: string,
  period: { from: Date; to: Date },
): Promise<BuildingManagementReport | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      name: true,
      propertyType: {
        select: {
          isBuildingManagement: true,
          unitPrefix: true,
          hasFloors: true,
        },
      },
      units: { select: { id: true, label: true } },
    },
  });
  if (!property) return null;

  const allUnitIds = property.units.map((u) => u.id);
  const unitNameById = new Map(
    property.units.map((unit) => [
      unit.id,
      formatUnitLabel(property.propertyType, unit.label),
    ]),
  );

  const payments = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.approved,
      paidAt: { gte: period.from, lte: period.to },
      charge: { type: ChargeType.rent, unit: { propertyId } },
    },
    select: {
      amount: true,
      collectedBy: true,
      paidAt: true,
      charge: {
        select: {
          unitId: true,
          title: true,
          periodStart: true,
          dueDate: true,
          tenant: { select: { email: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  const companyUnits = new Set<string>();
  const landlordUnits = new Set<string>();
  let companyAmount = 0;
  let landlordAmount = 0;
  const companyRentDetails: RentCollectionDetail[] = [];
  const landlordRentDetails: RentCollectionDetail[] = [];

  for (const payment of payments) {
    const amount = moneyValue(payment.amount);
    const detail: RentCollectionDetail = {
      unitLabel: unitNameById.get(payment.charge.unitId) ?? payment.charge.unitId,
      tenantName: personDisplayName(payment.charge.tenant),
      title: payment.charge.title,
      month: format(payment.charge.periodStart ?? payment.charge.dueDate, "MMM yy"),
      paidAt: payment.paidAt,
      amount,
    };
    if (payment.collectedBy === "owner") {
      landlordUnits.add(payment.charge.unitId);
      landlordAmount += amount;
      landlordRentDetails.push(detail);
    } else {
      companyUnits.add(payment.charge.unitId);
      companyAmount += amount;
      companyRentDetails.push(detail);
    }
  }

  const totalRentalUnits = new Set([...companyUnits, ...landlordUnits]);
  const totalRentalAmount = companyAmount + landlordAmount;

  const expenses = await prisma.expense.findMany({
    where: {
      date: { gte: period.from, lte: period.to },
      OR: [{ propertyId }, { units: { some: { unit: { propertyId } } } }],
      // An expense marked to be deducted from the service charge already
      // being collected isn't billed against rent again here — it belongs
      // to the OA/service-charge side of the books instead.
      ownerChargeMethod: "extra_charge",
    },
    select: {
      amount: true,
      paidBy: true,
      description: true,
      subcategory: true,
      category: { select: { name: true, label: true } },
      units: {
        select: {
          unit: {
            select: {
              id: true,
              label: true,
              property: {
                select: {
                  propertyType: { select: { unitPrefix: true, hasFloors: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const bucketAmounts: Record<ExpenseBucketKey, number> = {
    adminCleaning: 0,
    water: 0,
    electricity: 0,
    agreementRegistration: 0,
    maintenanceOther: 0,
  };
  const bucketUnits: Record<ExpenseBucketKey, Set<string>> = {
    adminCleaning: new Set(),
    water: new Set(),
    electricity: new Set(),
    agreementRegistration: new Set(),
    maintenanceOther: new Set(),
  };

  const expenseDetails: BuildingManagementReportDetailLine[] = [];
  const agreementDetails: BuildingManagementReportDetailLine[] = [];
  const utilityDetails: BuildingManagementReportDetailLine[] = [];

  for (const expense of expenses) {
    if (expense.paidBy === "owner") continue;
    const bucket = bucketFor(expense.category.name, expense.subcategory);
    const amount = moneyValue(expense.amount);
    bucketAmounts[bucket] += amount;
    if (expense.units.length > 0) {
      expense.units.forEach((u) => bucketUnits[bucket].add(u.unit.id));
    } else {
      allUnitIds.forEach((id) => bucketUnits[bucket].add(id));
    }

    const detail = {
      unitLabel: expenseScopeLabel(expense.units),
      description: expenseDescription(expense),
      amount,
    };
    if (bucket === "agreementRegistration") agreementDetails.push(detail);
    else if (bucket === "water" || bucket === "electricity") utilityDetails.push(detail);
    else expenseDetails.push(detail);
  }

  const expenseLines: BuildingManagementReportLine[] = EXPENSE_BUCKETS.map(
    ({ key, label }) => ({
      description: label,
      unitCount: bucketUnits[key].size,
      amount: bucketAmounts[key],
    }),
  );

  const totalExpenseAmount = expenseLines.reduce((sum, l) => sum + l.amount, 0);
  const totalExpenseUnits = new Set<string>();
  EXPENSE_BUCKETS.forEach(({ key }) => bucketUnits[key].forEach((id) => totalExpenseUnits.add(id)));

  // Settlement is company cash vs company-paid expenses. Landlord-collected
  // rent never entered Rawazen's books, so it must not offset what we spent.
  const finalBalance = companyAmount - totalExpenseAmount;

  companyRentDetails.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  landlordRentDetails.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());

  return {
    propertyName: property.name,
    from: period.from,
    to: period.to,
    isBuildingManagement: property.propertyType.isBuildingManagement,
    rentalCollection: {
      withCompany: {
        description: "Rental Collection with Company",
        unitCount: companyUnits.size,
        amount: companyAmount,
      },
      withLandlord: {
        description: "Rental Collection with Landlord",
        unitCount: landlordUnits.size,
        amount: landlordAmount,
      },
      total: {
        description: "Total Rental Collection",
        unitCount: totalRentalUnits.size,
        amount: totalRentalAmount,
      },
    },
    expenseLines,
    totalExpense: {
      description: "Total Expense",
      unitCount: totalExpenseUnits.size,
      amount: totalExpenseAmount,
    },
    finalBalance: Math.abs(finalBalance),
    finalBalanceLabel:
      finalBalance >= 0
        ? "Balance Amount to Landlord"
        : "Balance Amount to Collect from Landlord",
    expenseDetails,
    agreementDetails,
    utilityDetails,
    companyRentDetails,
    landlordRentDetails,
  };
}
