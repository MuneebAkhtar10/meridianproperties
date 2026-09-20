import { NextRequest, NextResponse } from "next/server";

import { renderInstallmentInvoicePdf } from "@/lib/pdf/render-service-charge-invoice";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
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
  const installment = await prisma.serviceChargeInstallment.findUnique({
    where: { id },
    select: {
      plan: {
        select: {
          unit: { select: { ownerId: true } },
          sourceInvoice: { select: { billedOwnerId: true } },
        },
      },
    },
  });

  if (!installment) {
    return NextResponse.json({ error: "Installment not found." }, { status: 404 });
  }

  const billedOwnerId = installment.plan.sourceInvoice?.billedOwnerId;
  const isOwn =
    user.userType === UserType.owner &&
    (user.id === installment.plan.unit.ownerId || user.id === billedOwnerId);
  if (user.userType !== UserType.admin && !isOwn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pdf = await renderInstallmentInvoicePdf(id);
  if (!pdf) {
    return NextResponse.json(
      { error: "No annual invoice is on file to print this installment from." },
      { status: 404 },
    );
  }

  return new NextResponse(pdf.buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
    },
  });
}
