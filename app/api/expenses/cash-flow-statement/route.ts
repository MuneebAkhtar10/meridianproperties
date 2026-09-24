import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/lib/generated/prisma/client";

import { getExpenseCategoriesWithSubcategories } from "@/lib/expenses";
import { moneyValue } from "@/lib/finance";
import {
  CashFlowStatementDocument,
  type CashFlowCategoryGroup,
} from "@/lib/pdf/cash-flow-statement";
import { formatOmanAddress } from "@/lib/oman";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const numberFormat = new Intl.NumberFormat("en-OM", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/**
 * Detailed cash flow for one property + From/To window (all funds).
 * Revenue is billed service charge (invoices) for the period — matching the
 * Urbanise-style statement — falling back to collected receipts if nothing
 * has been invoiced yet. Expenditure is logged expenses in the same window,
 * grouped by category. Fund tagging is only used on the annual budget.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const propertyId = params.get("property");
  const fromParam = params.get("from");
  const toParam = params.get("to");

  const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : null;
  const to = toParam ? new Date(`${toParam}T00:00:00.000Z`) : null;
  const toExclusive = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : null;

  if (
    !propertyId ||
    !from ||
    !toExclusive ||
    Number.isNaN(from.getTime()) ||
    Number.isNaN(toExclusive.getTime())
  ) {
    return NextResponse.json(
      { error: "A property and date range are required." },
      { status: 400 },
    );
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      name: true,
      address: true,
      area: true,
      wilayat: true,
      governorate: true,
      buildingNumber: true,
      wayNumber: true,
      postalCode: true,
    },
  });

  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const scopedPropertyId: string = propertyId;

  function expenseWhere(dateFilter: Prisma.ExpenseWhereInput): Prisma.ExpenseWhereInput {
    return {
      AND: [
        {
          OR: [
            { propertyId: scopedPropertyId },
            { units: { some: { unit: { propertyId: scopedPropertyId } } } },
          ],
        },
        dateFilter,
      ],
    };
  }

  async function sumInvoiced(issuedBefore: Date | null, issuedInRange: [Date, Date] | null) {
    const result = await prisma.serviceChargeInvoice.aggregate({
      where: {
        unit: { propertyId: scopedPropertyId },
        ...(issuedBefore
          ? { issueDate: { lt: issuedBefore } }
          : issuedInRange
            ? { issueDate: { gte: issuedInRange[0], lt: issuedInRange[1] } }
            : {}),
      },
      _sum: { currentAmount: true },
    });
    return moneyValue(result._sum.currentAmount ?? 0);
  }

  async function sumCollected(paidBefore: Date | null, paidInRange: [Date, Date] | null) {
    const result = await prisma.serviceChargePayment.aggregate({
      where: {
        unit: { propertyId: scopedPropertyId },
        ...(paidBefore
          ? { paidAt: { lt: paidBefore } }
          : paidInRange
            ? { paidAt: { gte: paidInRange[0], lt: paidInRange[1] } }
            : {}),
      },
      _sum: { amount: true },
    });
    return moneyValue(result._sum.amount ?? 0);
  }

  async function sumExpenditure(before: Date | null, range: [Date, Date] | null) {
    const result = await prisma.expense.aggregate({
      where: expenseWhere(
        before
          ? { date: { lt: before } }
          : range
            ? { date: { gte: range[0], lt: range[1] } }
            : {},
      ),
      _sum: { amount: true, vatAmount: true },
    });
    return moneyValue(result._sum.amount ?? 0) + moneyValue(result._sum.vatAmount ?? 0);
  }

  const [
    pastInvoiced,
    periodInvoiced,
    pastCollected,
    periodCollected,
    pastExpenditure,
    categories,
    expenses,
  ] = await Promise.all([
    sumInvoiced(from, null),
    sumInvoiced(null, [from, toExclusive]),
    sumCollected(from, null),
    sumCollected(null, [from, toExclusive]),
    sumExpenditure(from, null),
    getExpenseCategoriesWithSubcategories(),
    prisma.expense.findMany({
      where: expenseWhere({ date: { gte: from, lt: toExclusive } }),
      select: { categoryId: true, subcategory: true, amount: true, vatAmount: true },
    }),
  ]);

  const useInvoices = pastInvoiced > 0 || periodInvoiced > 0;
  const pastRevenue = useInvoices ? pastInvoiced : pastCollected;
  const revenueTotal = useInvoices ? periodInvoiced : periodCollected;
  const calculatedOpening = pastRevenue - pastExpenditure;

  // The modal asks for the calculated figure first, so it can pre-fill an
  // editable field with it.
  if (params.get("preview") === "1") {
    return NextResponse.json({ openingBalance: calculatedOpening });
  }

  // A typed-in opening balance replaces the calculated one, and the
  // statement says so.
  const openingParam = params.get("opening");
  const openingOverride =
    openingParam !== null && openingParam.trim() !== "" ? Number(openingParam) : null;
  const openingModified =
    openingOverride !== null &&
    Number.isFinite(openingOverride) &&
    Math.abs(openingOverride - calculatedOpening) > 0.0005;
  const openingBalance = openingModified ? (openingOverride as number) : calculatedOpening;

  const expenditureGroups: CashFlowCategoryGroup[] = [];
  let expenditureTotal = 0;
  const knownCategoryIds = new Set(categories.map((category) => category.id));

  for (const category of categories) {
    const inCategory = expenses.filter((expense) => expense.categoryId === category.id);
    if (inCategory.length === 0) continue;

    const bySubcategory = new Map<string, number>();
    for (const expense of inCategory) {
      const key = expense.subcategory ?? "Other";
      const total = moneyValue(expense.amount) + moneyValue(expense.vatAmount);
      bySubcategory.set(key, (bySubcategory.get(key) ?? 0) + total);
    }

    const lines = [...bySubcategory.entries()].map(([label, amount]) => ({
      label,
      amount: numberFormat.format(amount),
    }));
    const groupTotal = [...bySubcategory.values()].reduce((a, b) => a + b, 0);
    expenditureTotal += groupTotal;

    expenditureGroups.push({
      categoryLabel: category.label,
      lines,
      total: numberFormat.format(groupTotal),
    });
  }

  const leftover = expenses.filter((expense) => !knownCategoryIds.has(expense.categoryId));
  if (leftover.length > 0) {
    const groupTotal = leftover.reduce(
      (sum, expense) => sum + moneyValue(expense.amount) + moneyValue(expense.vatAmount),
      0,
    );
    expenditureTotal += groupTotal;
    expenditureGroups.push({
      categoryLabel: "Other",
      lines: leftover.map((expense) => ({
        label: expense.subcategory ?? "Other",
        amount: numberFormat.format(
          moneyValue(expense.amount) + moneyValue(expense.vatAmount),
        ),
      })),
      total: numberFormat.format(groupTotal),
    });
  }

  const closingBalance = openingBalance + revenueTotal - expenditureTotal;

  const periodLabel = `For the period ${format(from, "d MMMM yyyy")} to ${format(to!, "d MMMM yyyy")}`;
  const address = formatOmanAddress(property);
  const revenueLabel = useInvoices ? "Service Charge" : "Service Charge Revenue";
  const formatSigned = (value: number) =>
    value < 0 ? `(${numberFormat.format(Math.abs(value))})` : numberFormat.format(value);

  const pdfBuffer = await renderToBuffer(
    CashFlowStatementDocument({
      propertyName: property.name,
      propertyAddress: address,
      periodLabel,
      openingBalance: formatSigned(openingBalance),
      openingIsDeficit: openingBalance < 0,
      openingModified,
      revenueLines:
        revenueTotal > 0
          ? [{ label: revenueLabel, amount: numberFormat.format(revenueTotal) }]
          : [],
      revenueTotal: numberFormat.format(revenueTotal),
      expenditureGroups,
      expenditureTotal: numberFormat.format(expenditureTotal),
      closingBalance: formatSigned(closingBalance),
      closingIsDeficit: closingBalance < 0,
      closingLabel: `TOTAL BALANCE AS AT ${format(to!, "d MMM").toUpperCase()}`,
    }),
  );

  const filename = `cash-flow-statement-${property.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${fromParam}-to-${toParam}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
