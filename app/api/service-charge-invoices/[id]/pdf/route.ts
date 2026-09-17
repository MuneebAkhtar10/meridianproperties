import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { moneyValue } from "@/lib/finance";
import { formatOmanAddress } from "@/lib/oman";
import { ServiceChargeInvoiceDocument } from "@/lib/pdf/service-charge-invoice";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

const numberFormat = new Intl.NumberFormat("en-OM", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/** Admin-only, same as the other owner-facing document downloads in this
 * app (see app/api/tenancies/report-pdf/route.ts). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await prisma.serviceChargeInvoice.findUnique({
    where: { id },
    include: {
      unit: {
        include: {
          property: true,
          owner: { select: { firstName: true, lastName: true, email: true, mailingAddress: true } },
        },
      },
      fund: { select: { label: true } },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  // Admins manage every invoice; an owner may only ever open their own —
  // this is the link a "Send Invoice" notification hands them.
  const isOwnInvoice = user.userType === UserType.owner && user.id === invoice.unit.ownerId;
  if (user.userType !== UserType.admin && !isOwnInvoice) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { unit } = invoice;
  const property = unit.property;
  const owner = unit.owner;
  const ownerName = owner
    ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email
    : "Unassigned owner";

  const unitNo = property.buildingNumber
    ? `${property.buildingNumber}/${unit.floor ?? "-"}/${unit.label}`
    : unit.label;

  const isCredit = Number(invoice.previousBalance) < 0;

  const pdfBuffer = await renderToBuffer(
    ServiceChargeInvoiceDocument({
      associationName: property.name,
      associationAddress: formatOmanAddress(property),
      associationRegistrationNumber: property.associationRegistrationNumber,
      associationPhone: property.associationPhone,
      ownerName,
      ownerAddress: owner?.mailingAddress ?? "-",
      invoiceNumber: invoice.invoiceNumber,
      issueDate: format(invoice.issueDate, "dd/MM/yyyy"),
      dueDate: format(invoice.dueDate, "dd/MM/yyyy"),
      unitNo,
      entitlements: unit.entitlements != null ? String(unit.entitlements) : "-",
      previousBalance: numberFormat.format(moneyValue(invoice.previousBalance)),
      currentAmount: numberFormat.format(moneyValue(invoice.currentAmount)),
      amountPayable: `OMR ${numberFormat.format(moneyValue(invoice.amountPayable))}`,
      isCredit,
      periodLabel: `${format(invoice.periodStart, "MMMM yyyy")} to ${format(invoice.periodEnd, "MMMM yyyy")}`,
      chequePayableTo: property.chequePayableTo,
      poBox: property.poBox,
      postalCode: property.postalCode,
      area: property.area,
      bankName: property.bankName,
      bankSwiftCode: property.bankSwiftCode,
      bankAccountNumber: property.bankAccountNumber,
      paymentReference: property.paymentReference,
      fundLabel: invoice.fund.label,
      graceDays: invoice.graceDays,
    }),
  );

  const filename = `invoice-${invoice.invoiceNumber}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
