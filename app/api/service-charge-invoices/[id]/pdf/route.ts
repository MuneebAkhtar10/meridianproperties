import { NextRequest, NextResponse } from "next/server";

import { renderServiceChargeInvoicePdf } from "@/lib/pdf/render-service-charge-invoice";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

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
    select: {
      billedOwnerId: true,
      unit: { select: { ownerId: true } },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const isOwnInvoice =
    user.userType === UserType.owner &&
    (user.id === invoice.unit.ownerId || user.id === invoice.billedOwnerId);
  if (!isStaffAdmin(user.userType) && !isOwnInvoice) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pdf = await renderServiceChargeInvoicePdf(id);
  if (!pdf) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  return new NextResponse(pdf.buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
    },
  });
}
