import "server-only";

import { moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";

export type BuildingExpenseLine = {
  id: string;
  description: string;
  amount: number;
  date: Date;
  categoryLabel: string;
  supplierLabel: string;
  paymentReference: string | null;
  paidBy: string;
  notes: string | null;
  hasReceipt: boolean;
  receiptHref: string | null;
};

export type BuildingExpenseUnitGroup = {
  unitId: string;
  unitLabel: string;
  total: number;
  lines: BuildingExpenseLine[];
};

/** Spec #33 "Building Management Expenses" — a per-unit breakdown of the
 * same Expense rows already logged on the Expenses page, reusing the
 * existing ExpenseUnit join (no new unit-scoping column needed: an
 * expense already gets linked to one or more units there whenever it
 * isn't logged as property-wide/common-area). Shared between the
 * on-screen report and its PDF export. */
export async function getBuildingExpensesData(
  propertyId: string,
): Promise<{ propertyName: string; groups: BuildingExpenseUnitGroup[] } | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { name: true },
  });
  if (!property) return null;

  const expenseUnits = await prisma.expenseUnit.findMany({
    where: { unit: { propertyId } },
    orderBy: { expense: { date: "desc" } },
    select: {
      unit: {
        select: {
          id: true,
          label: true,
          property: {
            select: { propertyType: { select: { unitPrefix: true, hasFloors: true } } },
          },
        },
      },
      expense: {
        select: {
          id: true,
          description: true,
          amount: true,
          date: true,
          paymentReference: true,
          paidBy: true,
          notes: true,
          receiptFileName: true,
          category: { select: { label: true } },
          supplier: { select: { companyName: true } },
        },
      },
    },
  });

  const groupsByUnit = new Map<string, BuildingExpenseUnitGroup>();

  for (const eu of expenseUnits) {
    const unitLabel = formatUnitLabel(eu.unit.property.propertyType, eu.unit.label);
    const group = groupsByUnit.get(eu.unit.id) ?? {
      unitId: eu.unit.id,
      unitLabel,
      total: 0,
      lines: [],
    };

    const amount = moneyValue(eu.expense.amount);
    group.total += amount;
    group.lines.push({
      id: eu.expense.id,
      description: eu.expense.description,
      amount,
      date: eu.expense.date,
      categoryLabel: eu.expense.category.label,
      supplierLabel: eu.expense.supplier?.companyName ?? "Company default",
      paymentReference: eu.expense.paymentReference,
      paidBy: eu.expense.paidBy,
      notes: eu.expense.notes,
      hasReceipt: Boolean(eu.expense.receiptFileName),
      receiptHref: eu.expense.receiptFileName
        ? `/api/expense-receipt/${eu.expense.id}`
        : null,
    });

    groupsByUnit.set(eu.unit.id, group);
  }

  const groups = [...groupsByUnit.values()].sort((a, b) =>
    a.unitLabel.localeCompare(b.unitLabel, undefined, { numeric: true }),
  );

  return { propertyName: property.name, groups };
}
