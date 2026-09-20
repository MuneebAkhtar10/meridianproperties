import "server-only";

import { subMonths } from "date-fns";

import { moneyValue } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { PaymentStatus } from "@/lib/generated/prisma/client";

export type ReportPeriodPreset =
  | "monthly"
  | "quarterly"
  | "six_monthly"
  | "nine_monthly"
  | "yearly"
  | "custom";

export const REPORT_PERIOD_LABEL: Record<ReportPeriodPreset, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  six_monthly: "Six Monthly",
  nine_monthly: "Nine Monthly",
  yearly: "Yearly",
  custom: "Custom Date Range",
};

const PRESET_MONTHS: Record<Exclude<ReportPeriodPreset, "custom">, number> = {
  monthly: 1,
  quarterly: 3,
  six_monthly: 6,
  nine_monthly: 9,
  yearly: 12,
};

/** Resolves a preset (or an explicit custom range) into a concrete From/To
 * window. Presets are trailing windows ending today, rather than
 * calendar-fixed quarters/half-years — the portfolio has no single fiscal
 * year convention, so "trailing N months from today" is the one reading
 * that's always well-defined. */
export function resolveReportPeriod(
  preset: ReportPeriodPreset,
  customFrom: Date | null,
  customTo: Date | null,
): { from: Date; to: Date } {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (preset === "custom") {
    const to = customTo ?? today;
    const from = customFrom ?? subMonths(to, 1);
    return { from, to };
  }

  const from = subMonths(today, PRESET_MONTHS[preset]);
  from.setHours(0, 0, 0, 0);
  return { from, to: today };
}

export type BuildingManagementReportLine = {
  description: string;
  unitCount: number;
  amount: number;
};

export type BuildingManagementReport = {
  propertyName: string;
  from: Date;
  to: Date;
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

/** Spec #36 "Building Management Summary Report" — a Darsait-style
 * reconciliation of rent collected against building expenses over a
 * period, for one "Building Management" property. Built entirely from
 * existing data (Payment.collectedBy, Expense.paidBy/units) — no new
 * schema needed. Shared between the on-screen view and its PDF export. */
export async function getBuildingManagementReport(
  propertyId: string,
  period: { from: Date; to: Date },
): Promise<BuildingManagementReport | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { name: true, units: { select: { id: true } } },
  });
  if (!property) return null;

  const allUnitIds = property.units.map((u) => u.id);

  const payments = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.approved,
      paidAt: { gte: period.from, lte: period.to },
      charge: { unit: { propertyId } },
    },
    select: {
      amount: true,
      collectedBy: true,
      charge: { select: { unitId: true } },
    },
  });

  const companyUnits = new Set<string>();
  const landlordUnits = new Set<string>();
  let companyAmount = 0;
  let landlordAmount = 0;

  for (const payment of payments) {
    const amount = moneyValue(payment.amount);
    if (payment.collectedBy === "owner") {
      landlordUnits.add(payment.charge.unitId);
      landlordAmount += amount;
    } else {
      companyUnits.add(payment.charge.unitId);
      companyAmount += amount;
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
      category: { select: { name: true } },
      subcategory: true,
      units: { select: { unitId: true } },
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

  for (const expense of expenses) {
    if (expense.paidBy === "owner") continue;
    const bucket = bucketFor(expense.category.name, expense.subcategory);
    bucketAmounts[bucket] += moneyValue(expense.amount);
    if (expense.units.length > 0) {
      expense.units.forEach((u) => bucketUnits[bucket].add(u.unitId));
    } else {
      // Property-wide (common-area) expense — applies across every unit.
      allUnitIds.forEach((id) => bucketUnits[bucket].add(id));
    }
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

  return {
    propertyName: property.name,
    from: period.from,
    to: period.to,
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
  };
}
