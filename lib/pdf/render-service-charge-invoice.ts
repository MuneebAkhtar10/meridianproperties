import "server-only";

import { readFileSync } from "fs";
import { join } from "path";
import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";

import { moneyValue } from "@/lib/finance";
import { formatServiceChargeLetterheadAddress } from "@/lib/oman";
import { ServiceChargeInvoiceDocument } from "@/lib/pdf/service-charge-invoice";
import { ServicesInvoiceDocument } from "@/lib/pdf/services-invoice";
import { prisma } from "@/lib/prisma";
import { ownerAtDate, personName } from "@/lib/unit-owner-at";
import { isBuildingType } from "@/lib/property-types";

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
          property: {
            include: {
              propertyType: {
                select: { isOwnerAssociation: true },
              },
            },
          },
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

  const isOA = isBuildingType(property.propertyType);
  const associationName = isOA && !/owners?\s*association/i.test(property.name)
    ? `${property.name} - Owners Association`
    : property.name;

  let logoSrc: string | null = null;
  try {
    const logo = readFileSync(
      join(process.cwd(), "lib/pdf/assets/oa-invoice-logo.png"),
    );
    logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  } catch {
    logoSrc = null;
  }

  const phone = property.associationPhone?.trim() || null;
  const formattedPhone = phone
    ? phone.startsWith("+")
      ? phone
      : phone.replace(/\D/g, "").startsWith("968")
        ? `+${phone.replace(/\D/g, "")}`
        : `+968 ${phone.replace(/\D/g, "")}`
    : null;

  return {
    logoSrc,
    associationName,
    letterheadAddressLines: formatServiceChargeLetterheadAddress(property),
    associationRegistrationNumber: property.associationRegistrationNumber,
    associationPhone: formattedPhone,
    ownerName,
    ownerAddress,
    invoiceNumber: overlay
      ? `${invoice.invoiceNumber}-${String(overlay.sequence).padStart(2, "0")}`
      : invoice.invoiceNumber,
    issueDate: format(invoice.issueDate, "dd/MM/yy"),
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

/**
 * The same invoice on the Rawazen Services layout (qty / item / description /
 * unit price) — used for additional-charge invoices, which are ordinary
 * services billed to an owner rather than a service-charge statement.
 */
export async function renderServicesTemplateInvoicePdf(
  invoiceId: string,
): Promise<InvoicePdfResult | null> {
  const full = await prisma.serviceChargeInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: true,
      billedOwner: {
        select: { firstName: true, lastName: true, email: true, mailingAddress: true },
      },
      unit: {
        select: {
          property: { select: { name: true } },
          owner: {
            select: { firstName: true, lastName: true, email: true, mailingAddress: true },
          },
        },
      },
    },
  });
  if (!full) return null;

  const owner = full.billedOwner ?? full.unit.owner;
  const billedName = owner
    ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email
    : "Unassigned owner";
  const buffer = await renderToBuffer(
    ServicesInvoiceDocument({
      invoiceNumber: full.invoiceNumber,
      issueDate: format(full.issueDate, "dd/MM/yyyy"),
      dueDate: format(full.dueDate, "dd/MM/yyyy"),
      billedName,
      billedAddress:
        owner?.mailingAddress?.trim() || `${full.unit.property.name}, Sultanate of Oman`,
      paid: false,
      lines: full.lines.map((line) => {
        // Lines are stored as "Category — description".
        const [item, ...rest] = line.description.split(" — ");
        return {
          qty: Number(line.qty),
          item: rest.length > 0 ? item : "Service",
          description: rest.length > 0 ? rest.join(" — ") : line.description,
          unitPrice: Number(line.unitRate),
        };
      }),
    }),
  );
  return {
    buffer,
    filename: `Rawazen-Services-Invoice-${full.invoiceNumber}.pdf`,
    invoiceId,
  };
}
