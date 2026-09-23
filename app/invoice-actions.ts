"use server";

import { revalidatePath } from "next/cache";

import {
  formatMoney,
  parseDate,
  parsePositiveMoney,
} from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { notifyOwnerServiceChargeIssued } from "@/lib/notifications";
import {
  ensureInvoiceColumns,
  nextInvoiceNumber,
} from "@/lib/invoices";
import {
  isInvoiceKind,
  type InvoiceKind,
} from "@/lib/invoice-options";
import {
  collectsServiceCharge,
  formatUnitLabel,
} from "@/lib/property-types";
import { encodedRedirect, internalPath } from "@/utils/utils";
import { UserType } from "@/lib/generated/prisma/client";

function revalidateInvoiceSurfaces(propertyId?: string, unitId?: string) {
  revalidatePath("/protected/invoices");
  revalidatePath("/protected/service-charge-ledger");
  if (propertyId) {
    revalidatePath(`/protected/properties/${propertyId}`);
    if (unitId) {
      revalidatePath(
        `/protected/properties/${propertyId}/units/${unitId}/ledger`,
      );
    }
  }
}

type LineInput = { description: string; qty: number; unitRate: number; total: number };

function parseLines(formData: FormData, fallbackDescription: string): LineInput[] {
  const categories = formData.getAll("lineCategory").map((v) => v.toString());
  const descriptions = formData.getAll("lineDescription").map((v) => v.toString());
  const qtys = formData.getAll("lineQty").map((v) => v.toString());
  const rates = formData.getAll("lineRate").map((v) => v.toString());

  const lines: LineInput[] = [];
  for (let i = 0; i < Math.max(descriptions.length, categories.length, 1); i++) {
    const category = (categories[i] ?? "").trim();
    const description =
      (descriptions[i] ?? "").trim() || category || fallbackDescription;
    const qty = Number(qtys[i] ?? "1");
    const unitRate = parsePositiveMoney(rates[i]);
    if (!unitRate) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    lines.push({
      description: category && description !== category ? `${category} — ${description}` : description,
      qty,
      unitRate: Number(unitRate),
      total: qty * Number(unitRate),
    });
  }

  if (lines.length === 0) {
    const amount = parsePositiveMoney(formData.get("currentAmount"));
    if (amount) {
      lines.push({
        description: fallbackDescription,
        qty: 1,
        unitRate: Number(amount),
        total: Number(amount),
      });
    }
  }

  return lines;
}

async function applyIssuedBalances(input: {
  unitId: string;
  fundId: string;
  currentAmount: number;
  dueDate: Date;
  issueDate: Date;
}) {
  const unit = await prisma.unit.findUnique({
    where: { id: input.unitId },
    select: {
      fundBalances: { where: { fundId: input.fundId }, select: { balance: true } },
    },
  });
  const previousBalance = Number(unit?.fundBalances[0]?.balance ?? 0);
  const closingBalance = previousBalance + input.currentAmount;
  const amountPayable = Math.max(0, closingBalance);

  await prisma.$transaction([
    prisma.unitFundBalance.upsert({
      where: { unitId_fundId: { unitId: input.unitId, fundId: input.fundId } },
      create: { unitId: input.unitId, fundId: input.fundId, balance: closingBalance },
      update: { balance: closingBalance },
    }),
    prisma.unit.update({
      where: { id: input.unitId },
      data: {
        serviceChargeBalance: { increment: input.currentAmount },
        serviceChargeDueDate: input.dueDate,
        serviceChargeLastStage: null,
        serviceChargeLastReceivedAt: input.issueDate,
      },
    }),
  ]);

  return { previousBalance, closingBalance, amountPayable };
}

export const createOwnerInvoiceAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);
  await ensureInvoiceColumns();

  const back = internalPath(formData.get("redirectTo"), "/protected/invoices/new");
  const unitId = formData.get("unitId")?.toString();
  let fundId = formData.get("fundId")?.toString();
  const kindRaw = formData.get("kind")?.toString() ?? "additional";
  const kind: InvoiceKind = isInvoiceKind(kindRaw) ? kindRaw : "additional";
  const intent = formData.get("intent")?.toString() === "draft" ? "draft" : "issue";
  const notes = formData.get("notes")?.toString().trim() || null;

  const issueDate = parseDate(formData.get("issueDate")?.toString());
  const dueDate = parseDate(formData.get("dueDate")?.toString());
  const graceDays = 0;

  if (!unitId) {
    return encodedRedirect("error", back, "Choose a unit to bill.");
  }
  if (!fundId) {
    const fallbackFund = await prisma.fund.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    fundId = fallbackFund?.id;
  }
  if (!fundId) {
    return encodedRedirect("error", back, "No fund is configured to bill against.");
  }
  if (!issueDate || !dueDate) {
    return encodedRedirect("error", back, "Enter issued and due dates.");
  }
  if (dueDate < issueDate) {
    return encodedRedirect("error", back, "The due date can't be before the issue date.");
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      ownerId: true,
      propertyId: true,
      label: true,
      property: {
        select: {
          name: true,
          propertyType: {
            select: {
              isOwnerAssociation: true,
              isBuildingManagement: true,
              showRentBills: true,
              showMaintenance: true,
              hasCommonAreas: true,
              unitPrefix: true,
              hasFloors: true,
            },
          },
        },
      },
    },
  });
  if (!unit) {
    return encodedRedirect("error", back, "Unit not found.");
  }
  if (kind === "service_charge" && !collectsServiceCharge(unit.property.propertyType)) {
    return encodedRedirect(
      "error",
      back,
      "Independent properties do not take a service charge. Use an additional charge instead.",
    );
  }
  if (intent === "issue" && !unit.ownerId) {
    return encodedRedirect(
      "error",
      back,
      "Assign an owner to this unit before issuing the invoice.",
    );
  }

  const fallbackDescription =
    kind === "service_charge" ? "Service Charge" : "Additional charge";
  const lines = parseLines(formData, fallbackDescription);
  if (lines.length === 0) {
    return encodedRedirect("error", back, "Add at least one charge line with an amount.");
  }
  const currentAmount = lines.reduce((sum, line) => sum + line.total, 0);

  if (kind === "service_charge" && intent === "issue") {
    const overlapping = await prisma.serviceChargeInvoice.findFirst({
      where: {
        unitId,
        fundId,
        kind: "service_charge",
        status: "issued",
        periodStart: { lte: dueDate },
        periodEnd: { gte: issueDate },
      },
      select: { invoiceNumber: true },
    });
    if (overlapping) {
      return encodedRedirect(
        "error",
        back,
        `Invoice #${overlapping.invoiceNumber} already covers that service-charge period.`,
      );
    }
  }

  let previousBalance = 0;
  let closingBalance = currentAmount;
  let amountPayable = currentAmount;

  const invoice = await prisma.$transaction(async (tx) => {
    if (intent === "issue") {
      const fundRow = await tx.unitFundBalance.findUnique({
        where: { unitId_fundId: { unitId, fundId } },
        select: { balance: true },
      });
      previousBalance = Number(fundRow?.balance ?? 0);
      closingBalance = previousBalance + currentAmount;
      amountPayable = Math.max(0, closingBalance);
      await tx.unitFundBalance.upsert({
        where: { unitId_fundId: { unitId, fundId } },
        create: { unitId, fundId, balance: closingBalance },
        update: { balance: closingBalance },
      });
      await tx.unit.update({
        where: { id: unitId },
        data: {
          serviceChargeBalance: { increment: currentAmount },
          serviceChargeDueDate: dueDate,
          serviceChargeLastStage: null,
          serviceChargeLastReceivedAt: issueDate,
        },
      });
    }

    return tx.serviceChargeInvoice.create({
      data: {
        unitId,
        fundId,
        invoiceNumber: await nextInvoiceNumber(),
        issueDate,
        dueDate,
        graceDays,
        periodStart: issueDate,
        periodEnd: dueDate,
        previousBalance,
        currentAmount,
        amountPayable,
        closingBalance,
        billedOwnerId: unit.ownerId,
        createdById: admin.id,
        kind,
        status: intent === "draft" ? "draft" : "issued",
        notes,
        lines: {
          create: lines.map((line) => ({
            fundId,
            description: line.description,
            unitRate: line.unitRate,
            qty: line.qty,
            total: line.total,
          })),
        },
      },
      select: { id: true, invoiceNumber: true },
    });
  });

  revalidateInvoiceSurfaces(unit.propertyId, unitId);

  if (intent === "issue" && unit.ownerId) {
    try {
      await notifyOwnerServiceChargeIssued({
        ownerId: unit.ownerId,
        propertyId: unit.propertyId,
        propertyName: unit.property.name,
        unitLabel: formatUnitLabel(unit.property.propertyType, unit.label),
        amount: formatMoney(amountPayable),
        dueDate: dueDate.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        invoiceNumber: invoice.invoiceNumber,
      });
    } catch (error) {
      console.error("Owner invoice alert failed:", error);
    }
  }

  return encodedRedirect(
    "success",
    `/protected/invoices/${invoice.id}`,
    intent === "draft" ? "Draft saved." : "Invoice issued.",
  );
};

export const issueOwnerInvoiceAction = async (formData: FormData) => {
  await requireRole(UserType.admin);
  await ensureInvoiceColumns();

  const invoiceId = formData.get("invoiceId")?.toString();
  if (!invoiceId) {
    return encodedRedirect("error", "/protected/invoices", "Invalid invoice.");
  }

  const invoice = await prisma.serviceChargeInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      unit: {
        select: {
          ownerId: true,
          propertyId: true,
          label: true,
          property: {
            select: {
              name: true,
              propertyType: { select: { unitPrefix: true, hasFloors: true } },
            },
          },
        },
      },
    },
  });
  if (!invoice) {
    return encodedRedirect("error", "/protected/invoices", "Invoice not found.");
  }

  const back = internalPath(
    formData.get("redirectTo"),
    `/protected/invoices/${invoice.id}`,
  );

  if (invoice.status !== "draft") {
    return encodedRedirect("error", back, "Only drafts can be issued.");
  }
  if (!invoice.unit.ownerId) {
    return encodedRedirect(
      "error",
      back,
      "Assign an owner to this unit before issuing.",
    );
  }

  if (invoice.kind === "service_charge") {
    const overlapping = await prisma.serviceChargeInvoice.findFirst({
      where: {
        unitId: invoice.unitId,
        fundId: invoice.fundId,
        kind: "service_charge",
        status: "issued",
        id: { not: invoice.id },
        periodStart: { lte: invoice.periodEnd },
        periodEnd: { gte: invoice.periodStart },
      },
      select: { invoiceNumber: true },
    });
    if (overlapping) {
      return encodedRedirect(
        "error",
        back,
        `Invoice #${overlapping.invoiceNumber} already covers that period.`,
      );
    }
  }

  const posted = await applyIssuedBalances({
    unitId: invoice.unitId,
    fundId: invoice.fundId,
    currentAmount: Number(invoice.currentAmount),
    dueDate: invoice.dueDate,
    issueDate: invoice.issueDate,
  });

  await prisma.serviceChargeInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "issued",
      billedOwnerId: invoice.unit.ownerId,
      previousBalance: posted.previousBalance,
      closingBalance: posted.closingBalance,
      amountPayable: posted.amountPayable,
    },
  });

  revalidateInvoiceSurfaces(invoice.unit.propertyId, invoice.unitId);

  try {
    await notifyOwnerServiceChargeIssued({
      ownerId: invoice.unit.ownerId,
      propertyId: invoice.unit.propertyId,
      propertyName: invoice.unit.property.name,
      unitLabel: formatUnitLabel(
        invoice.unit.property.propertyType,
        invoice.unit.label,
      ),
      amount: formatMoney(posted.amountPayable),
      dueDate: invoice.dueDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      invoiceNumber: invoice.invoiceNumber,
    });
  } catch (error) {
    console.error("Owner invoice alert failed:", error);
  }

  return encodedRedirect("success", back, "Invoice issued.");
};

export const voidOwnerInvoiceAction = async (formData: FormData) => {
  await requireRole(UserType.admin);
  await ensureInvoiceColumns();

  const invoiceId = formData.get("invoiceId")?.toString();
  if (!invoiceId) {
    return encodedRedirect("error", "/protected/invoices", "Invalid invoice.");
  }

  const invoice = await prisma.serviceChargeInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, unit: { select: { propertyId: true, id: true } } },
  });
  if (!invoice) {
    return encodedRedirect("error", "/protected/invoices", "Invoice not found.");
  }
  const back = internalPath(formData.get("redirectTo"), `/protected/invoices/${invoice.id}`);
  if (invoice.status !== "draft") {
    return encodedRedirect(
      "error",
      back,
      "Issued invoices stay on the ledger. Create a credit or correct the last invoice instead.",
    );
  }

  await prisma.serviceChargeInvoice.update({
    where: { id: invoice.id },
    data: { status: "void" },
  });

  revalidateInvoiceSurfaces(invoice.unit.propertyId, invoice.unit.id);
  return encodedRedirect("success", "/protected/invoices?bucket=drafts", "Draft voided.");
};
