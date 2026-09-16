import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { getExpenseCategoriesWithSubcategories } from "@/lib/expenses";
import { moneyValue } from "@/lib/finance";
import {
  CashFlowStatementDocument,
  type CashFlowCategoryGroup,
} from "@/lib/pdf/cash-flow-statement";
import { formatOmanAddress } from "@/lib/oman";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const numberFormat = new Intl.NumberFormat("en-OM", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/**
 * A real cash flow statement, scoped to one property, one fund, and an
 * arbitrary From/To date range — REVENUE (actual collected
 * ServiceChargePayment receipts, not a budgeted estimate), then
 * EXPENDITURE broken down by category with subtotals, then a SUMMARY with
 * the fund's opening/closing balance. See lib/pdf/cash-flow-statement.tsx.
 * This is distinct from the general Expense Report PDF
 * (/api/expenses/export-pdf), which is the flat "owner association"
 * line-item sheet.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.userType !== UserType.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const propertyId = params.get("property");
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const fundId = params.get("fund");

  const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : null;
  // Exclusive end — "to" is the last day INCLUDED in the period.
  const to = toParam ? new Date(`${toParam}T00:00:00.000Z`) : null;
  const toExclusive = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : null;

  if (
    !propertyId ||
    !fundId ||
    !from ||
    !toExclusive ||
    Number.isNaN(from.getTime()) ||
    Number.isNaN(toExclusive.getTime())
  ) {
    return NextResponse.json(
      { error: "A property, fund, and date range are required." },
      { status: 400 },
    );
  }

  const [property, fund] = await Promise.all([
    prisma.property.findUnique({
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
    }),
    prisma.fund.findUnique({ where: { id: fundId }, select: { id: true, name: true, label: true } }),
  ]);

  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  if (!fund) {
    return NextResponse.json({ error: "Fund not found." }, { status: 404 });
  }

  const scopedPropertyId: string = propertyId;
  const scopedFundId: string = fund.id;

  // Legacy/no-fund payments only ever moved a unit's total balance, never a
  // specific fund's — treated as General Administrative Fund activity for
  // reporting, since that's what they conceptually were before Funds
  // existed.
  const isGeneralFund = fund.name === "general_administrative";
  const paymentFundWhere = isGeneralFund
    ? { OR: [{ fundId: scopedFundId }, { fundId: null }] }
    : { fundId: scopedFundId };

  async function sumRevenue(paidBefore: Date | null, paidInRange: [Date, Date] | null) {
    const result = await prisma.serviceChargePayment.aggregate({
      where: {
        unit: { propertyId: scopedPropertyId },
        ...paymentFundWhere,
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
      where: {
        fundId: scopedFundId,
        OR: [
          { propertyId: scopedPropertyId },
          { units: { some: { unit: { propertyId: scopedPropertyId } } } },
        ],
        ...(before ? { date: { lt: before } } : range ? { date: { gte: range[0], lt: range[1] } } : {}),
      },
      _sum: { amount: true, vatAmount: true },
    });
    return moneyValue(result._sum.amount ?? 0) + moneyValue(result._sum.vatAmount ?? 0);
  }

  const [pastRevenue, pastExpenditure, revenueTotal, categories, expenses] = await Promise.all([
    sumRevenue(from, null),
    sumExpenditure(from, null),
    sumRevenue(null, [from, toExclusive]),
    getExpenseCategoriesWithSubcategories(),
    prisma.expense.findMany({
      where: {
        fundId: fund.id,
        OR: [{ propertyId }, { units: { some: { unit: { propertyId } } } }],
        date: { gte: from, lt: toExclusive },
      },
      select: { categoryId: true, subcategory: true, amount: true, vatAmount: true },
    }),
  ]);

  const openingBalance = pastRevenue - pastExpenditure;

  const expenditureGroups: CashFlowCategoryGroup[] = [];
  let expenditureTotal = 0;

  for (const category of categories) {
    const inCategory = expenses.filter((e) => e.categoryId === category.id);
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

  const closingBalance = openingBalance + revenueTotal - expenditureTotal;
  const net = revenueTotal - expenditureTotal;

  const periodLabel = `For the period ${format(from, "d MMMM yyyy")} to ${format(to!, "d MMMM yyyy")}`;
  const address = formatOmanAddress(property);

  const pdfBuffer = await renderToBuffer(
    CashFlowStatementDocument({
      propertyName: property.name,
      propertyAddress: address,
      fundLabel: fund.label,
      periodLabel,
      openingBalance: numberFormat.format(Math.abs(openingBalance)),
      openingIsDeficit: openingBalance < 0,
      revenueLines:
        revenueTotal > 0
          ? [{ label: "Service Charge Revenue", amount: numberFormat.format(revenueTotal) }]
          : [],
      revenueTotal: numberFormat.format(revenueTotal),
      expenditureGroups,
      expenditureTotal: numberFormat.format(expenditureTotal),
      closingBalance: numberFormat.format(Math.abs(closingBalance)),
      closingIsDeficit: closingBalance < 0,
      netTotal: numberFormat.format(Math.abs(net)),
      isSurplus: net >= 0,
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
