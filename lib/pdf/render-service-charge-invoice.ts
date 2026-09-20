import "server-only";

import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";

import { moneyValue } from "@/lib/finance";
import { formatOmanAddress } from "@/lib/oman";
import { ServiceChargeInvoiceDocument } from "@/lib/pdf/service-charge-invoice";
import { prisma } from "@/lib/prisma";
import { ownerAtDate, personName } from "@/lib/unit-owner-at";

const numberFormat = new Intl.NumberFormat("en-OM", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export type InvoicePdfResult = {
  buffer: Buffer;
  filename: string;
  invoiceId: string;
};

type InstallmentOverlay = {
  sequence: number;
  count: number;
  amount: number;
  dueDate: Date;
};

async function loadInvoiceForPdf(invoiceId: string) {
  return prisma.serviceChargeInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      unit: {
        include: {
          property: true,
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              mailingAddress: true,
            },
          },
          ownershipTransfers: {
            orderBy: { transferDate: "asc" },
            include: {
              fromOwner: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                  mailingAddress: true,
                },
              },
            },
          },
        },
      },
      billedOwner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          mailingAddress: true,
        },
      },
      fund: { select: { label: true } },
    },
  });
}

function documentProps(
  invoice: NonNullable<Awaited<ReturnType<typeof loadInvoiceForPdf>>>,
  overlay?: InstallmentOverlay,
) {
  const { unit } = invoice;
  const property = unit.property;
  const billed = ownerAtDate({
    asOf: invoice.issueDate,
    currentOwner: unit.owner,
    billedOwner: invoice.billedOwner,
    transfers: unit.ownershipTransfers,
  });
  const ownerName = personName(billed) ?? "Unassigned owner";
  const ownerAddress =
    (billed && "mailingAddress" in billed && typeof billed.mailingAddress === "string"
      ? billed.mailingAddress
      : null) ??
    unit.owner?.mailingAddress ??
    "-";

  const unitNo = property.buildingNumber
    ? `${property.buildingNumber}/${unit.floor ?? "-"}/${unit.label}`
    : unit.label;

  const isCredit = Number(invoice.previousBalance) < 0;
  const payable = overlay
    ? overlay.amount
    : moneyValue(invoice.amountPayable);
  const dueDate = overlay ? overlay.dueDate : invoice.dueDate;

  return {
    associationName: property.name,
    associationAddress: formatOmanAddress(property),
    associationRegistrationNumber: property.associationRegistrationNumber,
    associationPhone: property.associationPhone,
    ownerName,
    ownerAddress,
    invoiceNumber: overlay
      ? `${invoice.invoiceNumber}-${String(overlay.sequence).padStart(2, "0")}`
      : invoice.invoiceNumber,
    issueDate: format(invoice.issueDate, "dd/MM/yyyy"),
    dueDate: format(dueDate, "dd/MM/yyyy"),
    unitNo,
    entitlements: unit.entitlements != null ? String(unit.entitlements) : "-",
    previousBalance: numberFormat.format(moneyValue(invoice.previousBalance)),
    currentAmount: numberFormat.format(
      overlay ? overlay.amount : moneyValue(invoice.currentAmount),
    ),
    amountPayable: `OMR ${numberFormat.format(payable)}`,
    isCredit: overlay ? false : isCredit,
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
    graceDays: overlay ? 0 : invoice.graceDays,
    installmentLabel: overlay
      ? `Installment ${overlay.sequence} of ${overlay.count}`
      : undefined,
  };
}

export async function renderServiceChargeInvoicePdf(
  invoiceId: string,
  overlay?: InstallmentOverlay,
): Promise<InvoicePdfResult | null> {
  const invoice = await loadInvoiceForPdf(invoiceId);
  if (!invoice) return null;

  const props = documentProps(invoice, overlay);
  const pdfBuffer = await renderToBuffer(ServiceChargeInvoiceDocument(props));
  const filename = overlay
    ? `invoice-${invoice.invoiceNumber}-installment-${overlay.sequence}.pdf`
    : `invoice-${invoice.invoiceNumber}.pdf`;

  return { buffer: Buffer.from(pdfBuffer), filename, invoiceId: invoice.id };
}

export async function renderInstallmentInvoicePdf(
  installmentId: string,
): Promise<InvoicePdfResult | null> {
  const installment = await prisma.serviceChargeInstallment.findUnique({
    where: { id: installmentId },
    include: {
      plan: {
        select: {
          installmentCount: true,
          sourceInvoiceId: true,
          unitId: true,
        },
      },
    },
  });
  if (!installment) return null;

  let invoiceId = installment.plan.sourceInvoiceId;
  if (!invoiceId) {
    const latest = await prisma.serviceChargeInvoice.findFirst({
      where: { unitId: installment.plan.unitId },
      orderBy: { issueDate: "desc" },
      select: { id: true },
    });
    invoiceId = latest?.id ?? null;
  }
  if (!invoiceId) return null;

  return renderServiceChargeInvoicePdf(invoiceId, {
    sequence: installment.sequence,
    count: installment.plan.installmentCount,
    amount: Number(installment.amount),
    dueDate: installment.dueDate,
  });
}

export function pdfAttachmentFromResult(result: InvoicePdfResult) {
  return {
    filename: result.filename,
    content: result.buffer.toString("base64"),
  };
}
