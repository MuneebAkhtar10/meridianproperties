import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { buildExpenseWhere } from "@/lib/expenses";
import { moneyValue } from "@/lib/finance";
import {
  ExpenseReportDocument,
  type ExpenseReportRow,
} from "@/lib/pdf/expense-report";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const numberFormat = new Intl.NumberFormat("en-OM", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/** Drops a trailing " - <year> yearly budget" note some entries were
 * imported with, so the printed description reads as cleanly as the
 * client's own sheet did. Purely cosmetic — the stored description is
 * untouched. */
function cleanDescription(description: string): string {
  return description.replace(/\s*-\s*\d{4}\s+yearly budget\s*$/i, "").trim();
}

/**
 * Same scope as the CSV export (category/property/year query params, same
 * `where`), rendered as a printable PDF styled exactly after the owners'
 * association budget sheet the client sent — see lib/pdf/expense-report.tsx.
 * This is the general, filterable "Download PDF"; the separate Cash Flow
 * Statement (/api/expenses/cash-flow-statement) is always one property/year
 * and looks like a real financial statement instead.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const category = params.get("category") ?? "all";
  const property = params.get("property") ?? "all";
  const year = params.get("year") ?? "all";

  const where = buildExpenseWhere({ category, property, year });

  const [expenses, propertyRecord] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
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
    }),
    property !== "all"
      ? prisma.property.findUnique({
          where: { id: property },
          select: {
            name: true,
            units: { select: { label: true, serviceChargeAmount: true, serviceChargeCycleMonths: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const isSingleProperty = propertyRecord !== null;

  const expenditureRows: ExpenseReportRow[] = expenses.map((expense) => {
    const yearly = moneyValue(expense.amount);
    const against =
      expense.units.length > 0
        ? `${expense.units[0].unit.property.name} - ${expense.units
            .map((u) => formatUnitLabel(u.unit.property.propertyType, u.unit.label))
            .join(", ")}`
        : expense.property
          ? `${expense.property.name} (property-wide)`
          : "";
    const description = cleanDescription(expense.description);
    return {
      // When several properties are in scope, prefix each line with what
      // it's against — otherwise that context would be lost entirely,
      // since this flat layout (unlike the general list view) has no
      // separate "Against" column.
      description: isSingleProperty ? description : `${against}: ${description}`,
      ratePerMonth: numberFormat.format(yearly / 12),
      ratePerYear: numberFormat.format(yearly),
    };
  });

  const totalRatePerYear = expenses.reduce((sum, e) => sum + moneyValue(e.amount), 0);

  let income: { residentialUnitCount: number; amount: string | null; totalYearly: string | null } | undefined;
  if (propertyRecord) {
    const residentialUnits = propertyRecord.units.filter(
      (u) => !u.label.trim().toUpperCase().startsWith("CU"),
    );
    const unitsWithCharge = residentialUnits.filter((u) => u.serviceChargeAmount);
    const revenueTotal = unitsWithCharge.reduce((sum, u) => {
      const cycleMonths = u.serviceChargeCycleMonths ?? 12;
      return sum + moneyValue(u.serviceChargeAmount!) * (12 / cycleMonths);
    }, 0);
    income = {
      residentialUnitCount: residentialUnits.length,
      amount: null,
      totalYearly: unitsWithCharge.length > 0 ? numberFormat.format(revenueTotal) : null,
    };
  }

  const titleText = propertyRecord
    ? `OWNER ASSOCIATION - ${propertyRecord.name.toUpperCase()}`
    : "EXPENSE REPORT - ALL PROPERTIES";

  const pdfBuffer = await renderToBuffer(
    ExpenseReportDocument({
      titleText,
      income,
      expenditureRows,
      totalRatePerMonth: numberFormat.format(totalRatePerYear / 12),
      totalRatePerYear: numberFormat.format(totalRatePerYear),
    }),
  );

  const filenameScope = [
    property !== "all" ? property : null,
    category !== "all" ? category : null,
    year !== "all" ? year : null,
  ]
    .filter(Boolean)
    .join("-");
  const filename = `expenses${filenameScope ? `-${filenameScope}` : ""}-${format(new Date(), "yyyy-MM-dd")}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
