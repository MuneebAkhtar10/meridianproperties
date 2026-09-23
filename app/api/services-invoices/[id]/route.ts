import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { moneyValue } from "@/lib/finance";
import { ServicesInvoiceDocument } from "@/lib/pdf/services-invoice";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { deleteServicesInvoice } from "@/lib/services-invoice";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await prisma.servicesInvoice.findUnique({
    where: { id },
    include: { lines: { orderBy: { sequence: "asc" } } },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const pdfBuffer = await renderToBuffer(
    ServicesInvoiceDocument({
      invoiceNumber: String(invoice.invoiceNumber),
      issueDate: format(invoice.issueDate, "dd/MM/yyyy"),
      billedName: invoice.billedName,
      billedAddress: invoice.billedAddress,
      paid: invoice.status === "paid",
      lines: invoice.lines.map((line) => ({
        qty: moneyValue(line.qty),
        item: line.item,
        description: line.description,
        unitPrice: moneyValue(line.unitPrice),
      })),
    }),
  );

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Rawazen-Services-Invoice-${invoice.invoiceNumber}.pdf"`,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as { status?: string };
  if (body.status !== "paid" && body.status !== "issued") {
    return NextResponse.json({ error: "status must be paid or issued." }, { status: 400 });
  }

  const invoice = await prisma.servicesInvoice.update({
    where: { id },
    data: { status: body.status },
    select: { id: true, status: true },
  });
  return NextResponse.json(invoice);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteServicesInvoice(id);
  if (!deleted) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
