import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import {
  filterCollectionPositionRows,
  getCollectionPositionData,
  type CollectionPositionBucketFilter,
} from "@/lib/collection-position";
import { formatMoney } from "@/lib/finance";
import { CollectionPositionDocument } from "@/lib/pdf/collection-position";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const BUCKET_LABEL: Record<CollectionPositionBucketFilter, string> = {
  all: "All units",
  raised: "Units with charges raised",
  collected: "Units with a payment collected",
  outstanding: "Units with an outstanding balance",
  overdue: "Overdue units",
  dueToday: "Due today",
  dueSoon: "Due soon",
  dueThisMonth: "Due this month",
  partPaid: "Part paid",
  noPayment: "No payment",
  paymentPlan: "On a payment plan / instalment",
};

/** The printable version of /protected/service-charge-ledger/collection-position
 * (spec #18) — same property/bucket filters, same totals, same table. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.userType !== UserType.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const bucketFilter = (params.get("bucket") ??
    "all") as CollectionPositionBucketFilter;
  const propertyFilter = params.get("property") ?? "all";

  const [{ rows }, property] = await Promise.all([
    getCollectionPositionData(propertyFilter),
    propertyFilter !== "all"
      ? prisma.property.findUnique({
          where: { id: propertyFilter },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const displayedRows = filterCollectionPositionRows(rows, bucketFilter);

  const totalRaised = displayedRows.reduce((sum, r) => sum + r.raised, 0);
  const totalCollected = displayedRows.reduce((sum, r) => sum + r.paid, 0);
  const totalOutstanding = displayedRows.reduce(
    (sum, r) => sum + r.outstanding,
    0,
  );

  const scopeLabel = `${property ? property.name : "All properties"} · ${BUCKET_LABEL[bucketFilter]}`;

  const pdfBuffer = await renderToBuffer(
    CollectionPositionDocument({
      scopeLabel,
      totalRaised: formatMoney(totalRaised).replace("OMR", "").trim(),
      totalCollected: formatMoney(totalCollected).replace("OMR", "").trim(),
      totalOutstanding: formatMoney(totalOutstanding).replace("OMR", "").trim(),
      rows: displayedRows.map((row) => ({
        ownerLabel: row.ownerLabel,
        buildingLabel: row.buildingLabel,
        unitLabel: row.unitLabel,
        raised: formatMoney(row.raised).replace("OMR", "").trim(),
        paid: formatMoney(row.paid).replace("OMR", "").trim(),
        outstanding: formatMoney(row.outstanding).replace("OMR", "").trim(),
        dueDate: row.dueDate ? format(row.dueDate, "d MMM yyyy") : "—",
        daysOverdue: row.daysOverdue > 0 ? String(row.daysOverdue) : "—",
        lastReminder: row.lastReminder
          ? format(row.lastReminder, "d MMM yyyy")
          : "—",
        arrangement: row.activePlan
          ? `${row.activePlan.installments.filter((i) => i.paidAt).length}/${
              row.activePlan.installmentCount
            } paid`
          : "—",
      })),
      generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
    }),
  );

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="collection-position-${format(new Date(), "yyyy-MM-dd")}.pdf"`,
    },
  });
}
