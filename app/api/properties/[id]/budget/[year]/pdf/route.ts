import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { formatMoney, moneyValue } from "@/lib/finance";
import { AnnualBudgetDocument } from "@/lib/pdf/annual-budget";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

/** Admin, or an owner of a unit in this property — same access rule as the
 * budget page itself. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; year: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: propertyId, year: yearParam } = await params;
  const year = Number(yearParam);
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      name: true,
      units: { select: { ownerId: true } },
      propertyType: { select: { isOwnerAssociation: true } },
    },
  });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  if (
    !isStaffAdmin(user.userType) &&
    !property.units.some((u) => u.ownerId === user.id)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!property.propertyType.isOwnerAssociation) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const budget = await prisma.annualBudget.findUnique({
    where: { propertyId_year: { propertyId, year } },
    include: {
      incomeLines: { orderBy: { description: "asc" } },
      expenseLines: { orderBy: { description: "asc" } },
    },
  });

  const incomeLines = budget?.incomeLines ?? [];
  const expenseLines = budget?.expenseLines ?? [];

  const totalIncome = incomeLines.reduce(
    (sum, line) => sum + moneyValue(line.totalYearly),
    0,
  );
  const totalExpenseYearly = expenseLines.reduce(
    (sum, line) => sum + moneyValue(line.ratePerYear),
    0,
  );
  const totalExpenseMonthly = expenseLines.reduce(
    (sum, line) => sum + moneyValue(line.ratePerMonth),
    0,
  );
  const net = totalIncome - totalExpenseYearly;

  const title = property.propertyType.isOwnerAssociation
    ? `Owner Association — ${property.name} Annual Budget ${year}`
    : `${property.name} Annual Budget ${year}`;

  const pdfBuffer = await renderToBuffer(
    AnnualBudgetDocument({
      title,
      incomeLines: incomeLines.map((line) => ({
        description: line.description,
        units: line.units,
        amount: formatMoney(line.amount),
        totalYearly: formatMoney(line.totalYearly),
      })),
      expenseLines: expenseLines.map((line) => ({
        description: line.description,
        ratePerMonth: formatMoney(line.ratePerMonth),
        ratePerYear: formatMoney(line.ratePerYear),
      })),
      totalIncome: formatMoney(totalIncome),
      totalExpense: formatMoney(totalExpenseYearly),
      totalExpenseMonth: formatMoney(totalExpenseMonthly),
      net: formatMoney(net),
      netNegative: net < 0,
      generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
    }),
  );

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="annual-budget-${year}.pdf"`,
    },
  });
}
