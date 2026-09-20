import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

import {
  buildSpreadsheetMl,
  type SpreadsheetCell,
  type SpreadsheetRow,
} from "@/lib/spreadsheet-ml";
import { getUnitRentStatement } from "@/lib/unit-rent-statement";
import { getCurrentUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

function slashDate(value: Date): string {
  return format(value, "d/M/yyyy");
}

function transactionDate(value: Date | null): string {
  if (!value) return "—";
  return `Tr.${format(value, "dd/MM/yy")}`;
}

function periodShort(from: Date, to: Date): string {
  return `${format(from, "MMM yy")} - ${format(to, "MMM yy")}`;
}

function dash(value: string | null | undefined): string {
  return value && value.trim() ? value : "—";
}

function empty(): SpreadsheetRow {
  return { cells: [], height: 8 };
}

function title(text: string): SpreadsheetRow {
  return {
    height: 24,
    cells: [{ value: text, style: "Title", mergeAcross: 3 }],
  };
}

function subtitle(text: string): SpreadsheetRow {
  return {
    height: 18,
    cells: [{ value: text, style: "Subtitle", mergeAcross: 3 }],
  };
}

function section(text: string): SpreadsheetRow {
  return {
    height: 22,
    cells: [{ value: text, style: "Section", mergeAcross: 3 }],
  };
}

function pairRow(
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string,
): SpreadsheetRow {
  return {
    height: 20,
    cells: [
      { value: leftLabel, style: "Label" },
      { value: leftValue, style: "Value" },
      { value: rightLabel, style: "Label" },
      { value: rightValue, style: "Value" },
    ],
  };
}

function headerRow(values: string[]): SpreadsheetRow {
  return {
    height: 20,
    cells: values.map((value) => ({ value, style: "Th" })),
  };
}

function amountCell(amount: number, style: string): SpreadsheetCell {
  return { value: amount, style, number: true };
}

/** Excel workbook matching the boxed landlord-statement layout (same figures
 * as the PDF). Served from the /csv route so existing download buttons work. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenancyId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.userType !== UserType.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenancyId } = await params;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required." }, { status: 400 });
  }

  const statement = await getUnitRentStatement(tenancyId, {
    from: new Date(from),
    to: new Date(to),
  });
  if (!statement) {
    return NextResponse.json({ error: "Tenancy not found." }, { status: 404 });
  }

  const period = periodShort(statement.from, statement.to);
  const companyTotalLabel = `Total Rent collected with Company (${period})`;
  const balanceLabel = statement.balanceOwedToLandlord
    ? "Balance Amount to Landlord"
    : "Balance Amount to Collect from Landlord";
  const balanceStyle = statement.balanceOwedToLandlord ? "BalancePay" : "BalanceCollect";
  const balanceRightStyle = statement.balanceOwedToLandlord
    ? "BalancePayRight"
    : "BalanceCollectRight";

  const collectionRows: SpreadsheetRow[] =
    statement.monthlyRows.length === 0
      ? [
          {
            height: 20,
            cells: [
              {
                value: "No rent collected against this unit for the period.",
                style: "Td",
                mergeAcross: 3,
              },
            ],
          },
        ]
      : statement.monthlyRows.map((row) => ({
          height: 18,
          cells: [
            { value: row.month, style: "Td" },
            { value: transactionDate(row.transactionDate), style: "Td" },
            amountCell(row.amount, "TdRight"),
            { value: row.receivedBy, style: "Td" },
          ],
        }));

  const expenseRows: SpreadsheetRow[] =
    statement.expenseRows.length === 0
      ? [
          {
            height: 20,
            cells: [
              {
                value: "No expenses logged against this unit for the period.",
                style: "Td",
                mergeAcross: 2,
              },
              { value: "", style: "Td" },
            ],
          },
        ]
      : statement.expenseRows.map((row) => ({
          height: 18,
          cells: [
            { value: row.description, style: "Td", mergeAcross: 2 },
            amountCell(row.amount, "TdRight"),
          ],
        }));

  const rows: SpreadsheetRow[] = [
    title("Landlord Statement"),
    subtitle(`${statement.propertyName}  ·  ${statement.unitLabel}  ·  ${period}`),
    empty(),
    section("Building / Owner Information"),
    pairRow(
      "Building no.",
      dash(statement.buildingNumber),
      "Flat. No",
      statement.unitLabel,
    ),
    pairRow(
      "Rent",
      String(statement.monthlyRent),
      "BHK",
      statement.bedrooms != null ? `${statement.bedrooms} BHK` : "—",
    ),
    pairRow("Owner name", statement.ownerName, "Mobile", dash(statement.ownerMobile)),
    empty(),
    section("Resident / Tenant Information"),
    pairRow("Name", statement.tenantName, "ID no.", dash(statement.tenantCivilId)),
    pairRow(
      "Mobile",
      dash(statement.tenantMobile),
      "Payment method",
      dash(statement.paymentMethod),
    ),
    pairRow(
      "Agreement no.",
      dash(statement.agreementNo),
      "Agreement Period",
      statement.agreementPeriod,
    ),
    pairRow(
      "Check in date",
      slashDate(statement.checkInDate),
      "Security amount",
      String(statement.securityDeposit),
    ),
    {
      height: 20,
      cells: [
        { value: "Paid By", style: "Label" },
        { value: dash(statement.paidBy), style: "Value", mergeAcross: 2 },
      ],
    },
    pairRow(
      "Starting Date",
      slashDate(statement.from),
      "Expire Date",
      slashDate(statement.to),
    ),
    empty(),
    section("Rental Collection"),
    headerRow(["Month", "Transaction Date", "Amount", "Received By"]),
    ...collectionRows,
    {
      height: 22,
      cells: [
        { value: companyTotalLabel, style: "Total", mergeAcross: 2 },
        amountCell(statement.totalRentCollected, "TotalRight"),
      ],
    },
    ...(statement.totalRentCollectedWithLandlord > 0
      ? [
          {
            height: 22,
            cells: [
              {
                value: "Total Rent collected with Landlord",
                style: "Total",
                mergeAcross: 2,
              },
              amountCell(statement.totalRentCollectedWithLandlord, "TotalRight"),
            ],
          } satisfies SpreadsheetRow,
        ]
      : []),
    empty(),
    section("Expense Sheet"),
    {
      height: 20,
      cells: [
        { value: "Description", style: "Th", mergeAcross: 2 },
        { value: "Amount", style: "Th" },
      ],
    },
    ...expenseRows,
    {
      height: 22,
      cells: [
        { value: "TOTAL", style: "Total", mergeAcross: 2 },
        amountCell(statement.totalExpenses, "TotalRight"),
      ],
    },
    empty(),
    section("Summary"),
    {
      height: 20,
      cells: [
        { value: companyTotalLabel, style: "Td", mergeAcross: 2 },
        amountCell(statement.totalRentCollected, "TdRight"),
      ],
    },
    {
      height: 20,
      cells: [
        { value: "Total Expenses", style: "Td", mergeAcross: 2 },
        amountCell(statement.totalExpenses, "TdRight"),
      ],
    },
    {
      height: 26,
      cells: [
        { value: balanceLabel, style: balanceStyle, mergeAcross: 2 },
        amountCell(statement.balance, balanceRightStyle),
      ],
    },
    {
      height: 20,
      cells: [
        { value: "Status", style: "Label" },
        {
          value: statement.balance === 0 ? "Settled" : "Total Outstanding",
          style: "Value",
          mergeAcross: 2,
        },
      ],
    },
  ];

  const xml = buildSpreadsheetMl({
    name: "Landlord Statement",
    columns: [120, 130, 110, 140],
    rows,
  });

  const propertySlug = statement.propertyName.replace(/[\\/:*?"<>|]+/g, " ").trim();
  const unitSlug = statement.unitLabel.replace(/[\\/:*?"<>|]+/g, " ").trim();
  const filename = `${propertySlug} ${unitSlug} - ${period}.xls`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
