import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

import { buildCsv } from "@/lib/csv";
import { buildExpenseWhere } from "@/lib/expenses";
import { moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

/**
 * Downloads exactly the rows the Expenses page is currently showing — same
 * category/property/year query params, same `where` (via buildExpenseWhere)
 * — as a CSV that opens directly in Excel or any spreadsheet app.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.userType !== UserType.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const category = params.get("category") ?? "all";
  const property = params.get("property") ?? "all";
  const year = params.get("year") ?? "all";

  const where = buildExpenseWhere({ category, property, year });

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      category: { select: { label: true } },
      property: { select: { name: true } },
      units: {
        include: {
          unit: {
            select: {
              label: true,
              property: {
                select: {
                  name: true,
                  propertyType: { select: { unitPrefix: true, hasFloors: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const rows = expenses.map((expense) => {
    const against =
      expense.units.length > 0
        ? `${expense.units[0].unit.property.name} - ${expense.units
            .map((u) => formatUnitLabel(u.unit.property.propertyType, u.unit.label))
            .join(", ")}`
        : expense.property
          ? `${expense.property.name} (property-wide)`
          : "";

    return [
      format(expense.date, "yyyy-MM-dd"),
      expense.category.label,
      expense.subcategory ?? "",
      against,
      expense.description,
      moneyValue(expense.amount),
      moneyValue(expense.vatAmount),
      expense.paymentReference ?? "",
      expense.notes ?? "",
      expense.receiptFileName ? "Yes" : "No",
    ];
  });

  const csv = buildCsv(
    [
      "Date",
      "Category",
      "Type",
      "Against",
      "Description",
      "Amount (OMR)",
      "VAT (OMR)",
      "Payment reference",
      "Notes",
      "Has receipt",
    ],
    rows,
  );

  const scope = [
    category !== "all" ? category : null,
    property !== "all" ? property : null,
    year !== "all" ? year : null,
  ]
    .filter(Boolean)
    .join("-");
  const filename = `expenses${scope ? `-${scope}` : ""}-${format(new Date(), "yyyy-MM-dd")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
