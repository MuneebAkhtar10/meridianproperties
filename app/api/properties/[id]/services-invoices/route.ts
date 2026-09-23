import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { parseDateInput } from "@/lib/report-period";
import { ServicesInvoiceDocument } from "@/lib/pdf/services-invoice";
import {
  assembleServicesInvoiceDraft,
  createServicesInvoice,
  listServicesInvoices,
} from "@/lib/services-invoice";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { formatUnitLabel } from "@/lib/property-types";
import { moneyValue } from "@/lib/finance";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: propertyId } = await params;
  const unitId = request.nextUrl.searchParams.get("unit");
  const from = parseDateInput(request.nextUrl.searchParams.get("from"));
  const to = parseDateInput(request.nextUrl.searchParams.get("to"));

  if (unitId && from && to) {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    const draft = await assembleServicesInvoiceDraft(unitId, { from, to });
    if (!draft || draft.propertyId !== propertyId) {
      return NextResponse.json({ error: "Unit not found." }, { status: 404 });
    }
    return NextResponse.json({
      billedName: draft.billedName,
      billedAddress: draft.billedAddress,
      lines: draft.lines,
      total: draft.total,
    });
  }

  try {
    const invoices = await listServicesInvoices(propertyId);
    return NextResponse.json({
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: format(invoice.issueDate, "dd/MM/yyyy"),
        status: invoice.status,
        total: moneyValue(invoice.total),
        billedName: invoice.billedName,
        unitLabel: formatUnitLabel(invoice.unit.property.propertyType, invoice.unit.label),
      })),
    });
  } catch {
    return NextResponse.json({ invoices: [] });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: propertyId } = await params;
  const body = (await request.json()) as {
    unitId?: string;
    from?: string;
    to?: string;
  };
  const from = parseDateInput(body.from);
  const to = parseDateInput(body.to);
  if (!body.unitId || !from || !to) {
    return NextResponse.json(
      { error: "A unit and date range are required." },
      { status: 400 },
    );
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  try {
    const invoice = await createServicesInvoice(body.unitId, { from, to }, user.id);
    if (!invoice || invoice.propertyId !== propertyId) {
      return NextResponse.json({ error: "Unit not found." }, { status: 404 });
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
        "X-Invoice-Id": invoice.id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
