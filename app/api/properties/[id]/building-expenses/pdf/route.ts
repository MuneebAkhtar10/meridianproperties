import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { formatMoney } from "@/lib/finance";
import { getBuildingExpensesData } from "@/lib/building-expenses";
import { BuildingManagementExpensesDocument } from "@/lib/pdf/building-management-expenses";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const PAID_BY_LABEL: Record<string, string> = {
  management: "Management",
  owner: "Owner",
};

/** The printable version of the Building Management Expenses report
 * (spec #33) — /protected/properties/[id]/building-expenses. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: propertyId } = await params;
  const data = await getBuildingExpensesData(propertyId);
  if (!data) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const grandTotal = data.groups.reduce((sum, g) => sum + g.total, 0);

  const pdfBuffer = await renderToBuffer(
    BuildingManagementExpensesDocument({
      propertyName: data.propertyName,
      groups: data.groups.map((group) => ({
        unitLabel: group.unitLabel,
        total: formatMoney(group.total).replace("OMR", "").trim(),
        lines: group.lines.map((line) => ({
          description: line.description,
          amount: formatMoney(line.amount).replace("OMR", "").trim(),
          date: format(line.date, "d MMM yyyy"),
          category: line.categoryLabel,
          supplier: line.supplierLabel,
          paidBy: PAID_BY_LABEL[line.paidBy] ?? line.paidBy,
          reference: line.paymentReference,
        })),
      })),
      grandTotal: formatMoney(grandTotal).replace("OMR", "").trim(),
      generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
    }),
  );

  const filename = `building-expenses-${data.propertyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
