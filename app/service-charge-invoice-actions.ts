"use server";

import { revalidatePath } from "next/cache";

import { parseDate, parsePositiveMoney } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { uploadEntityDocument } from "@/lib/storage";
import { notifyOwnerCustom } from "@/lib/notifications";
import { formatUnitLabel } from "@/lib/property-types";
import { encodedRedirect } from "@/utils/utils";
import { PaymentMethod, UserType } from "@/lib/generated/prisma/client";

/** Zero-padded to 7 digits, matching the reference invoice's numbering
 * ("0000804"). Backed by a real Postgres sequence so numbers never repeat
 * or collide, even with concurrent admins. */
async function nextInvoiceNumber(): Promise<string> {
  const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('service_charge_invoice_seq')
  `;
  return nextval.toString().padStart(7, "0");
}

/**
 * Generates one invoice against ONE fund's running balance (see
 * UnitFundBalance) — billing two funds in the same period means
 * generating two invoices, same as two real invoice numbers. Reads/writes
 * that fund's own balance row (creating it at 0 first if the unit has
 * never been billed against this fund before), and keeps
 * Unit.serviceChargeBalance (the maintained grand total across every
 * fund) moving by the exact same delta in the same transaction.
 */
export const generateServiceChargeInvoiceAction = async (
  formData: FormData,
) => {
  const admin = await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  const fundId = formData.get("fundId")?.toString();
  const periodStart = parseDate(formData.get("periodStart")?.toString());
  const periodEnd = parseDate(formData.get("periodEnd")?.toString());
  const issueDate = parseDate(formData.get("issueDate")?.toString());
  const dueDate = parseDate(formData.get("dueDate")?.toString());
  const graceDaysRaw = formData.get("graceDays")?.toString();
  const graceDays = graceDaysRaw ? Number(graceDaysRaw) : 0;

  if (!unitId) {
    return encodedRedirect("error", "/protected/properties", "Invalid unit.");
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      propertyId: true,
      serviceChargeAmount: true,
      fundBalances: { select: { fundId: true, balance: true } },
    },
  });
  if (!unit) {
    return encodedRedirect("error", "/protected/properties", "Unit not found.");
  }

  const back = `/protected/properties/${unit.propertyId}`;

  if (!fundId) {
    return encodedRedirect("error", back, "Select which fund this invoice bills.");
  }
  if (!periodStart || !periodEnd || !issueDate || !dueDate) {
    return encodedRedirect("error", back, "Enter valid dates.");
  }
  if (periodEnd < periodStart) {
    return encodedRedirect(
      "error",
      back,
      "The period end can't be before its start.",
    );
  }
  if (!Number.isInteger(graceDays) || graceDays < 0) {
    return encodedRedirect("error", back, "Enter a valid grace period.");
  }
  if (!unit.serviceChargeAmount || Number(unit.serviceChargeAmount) <= 0) {
    return encodedRedirect(
      "error",
      back,
      "Set this unit's service charge amount before invoicing it.",
    );
  }

  const existingFundBalance = unit.fundBalances.find((b) => b.fundId === fundId);
  const previousBalance = existingFundBalance?.balance ?? 0;
  const currentAmount = unit.serviceChargeAmount;
  const closingBalance = Number(previousBalance) + Number(currentAmount);
  const amountPayable = Math.max(0, closingBalance);
  const totalDelta = Number(currentAmount);

  await prisma.$transaction([
    prisma.serviceChargeInvoice.create({
      data: {
        unitId,
        fundId,
        invoiceNumber: await nextInvoiceNumber(),
        issueDate,
        dueDate,
        graceDays,
        periodStart,
        periodEnd,
        previousBalance,
        currentAmount,
        amountPayable,
        closingBalance,
        createdById: admin.id,
        lines: {
          create: {
            fundId,
            description: "Service Charge",
            unitRate: currentAmount,
            qty: 1,
            total: currentAmount,
          },
        },
      },
    }),
    prisma.unitFundBalance.upsert({
      where: { unitId_fundId: { unitId, fundId } },
      create: { unitId, fundId, balance: closingBalance },
      update: { balance: closingBalance },
    }),
    // Generating the invoice is now the single "this cycle was billed"
    // event — it both updates the ledger and rolls the reminder schedule
    // forward to this invoice's own due date, replacing the old separate
    // "mark received" toggle.
    prisma.unit.update({
      where: { id: unitId },
      data: {
        serviceChargeBalance: { increment: totalDelta },
        serviceChargeDueDate: dueDate,
        serviceChargeLastStage: null,
        serviceChargeLastReceivedAt: issueDate,
      },
    }),
  ]);

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect("success", back, "Invoice generated.");
};

/**
 * Records a payment/credit. When a fund is picked, that fund's own
 * UnitFundBalance row moves (created at 0 first if needed) alongside the
 * unit's total; left as "General balance" (no fund), only the total
 * moves — the same behavior installment-plan payments
 * (app/service-charge-installment-actions.ts) already rely on.
 */
export const recordServiceChargePaymentAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  const fundId = formData.get("fundId")?.toString() || null;
  const amount = parsePositiveMoney(formData.get("amount"));
  const paidAt = parseDate(formData.get("paidAt")?.toString());
  const note = formData.get("note")?.toString().trim() || null;
  const transactionNumber =
    formData.get("transactionNumber")?.toString().trim() || null;
  const paymentMethodRaw = formData.get("paymentMethod")?.toString();
  const paymentMethod = (
    Object.values(PaymentMethod) as string[]
  ).includes(paymentMethodRaw ?? "")
    ? (paymentMethodRaw as PaymentMethod)
    : null;
  const chequeNumber = formData.get("chequeNumber")?.toString().trim() || null;
  const chequeDate = parseDate(formData.get("chequeDate")?.toString());
  const bank = formData.get("bank")?.toString().trim() || null;
  const clearanceStatus =
    formData.get("clearanceStatus")?.toString().trim() || null;

  if (!unitId) {
    return encodedRedirect("error", "/protected/properties", "Invalid unit.");
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { propertyId: true },
  });
  if (!unit) {
    return encodedRedirect("error", "/protected/properties", "Unit not found.");
  }

  const back = `/protected/properties/${unit.propertyId}`;

  if (!amount || !paidAt) {
    return encodedRedirect(
      "error",
      back,
      "Enter a valid amount and date.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceChargePayment.create({
      data: {
        unitId,
        fundId,
        amount,
        paidAt,
        note,
        transactionNumber,
        paymentMethod,
        chequeNumber,
        chequeDate,
        bank,
        clearanceStatus,
        createdById: admin.id,
      },
    });
    await tx.unit.update({
      where: { id: unitId },
      data: { serviceChargeBalance: { decrement: Number(amount) } },
    });
    if (fundId) {
      await tx.unitFundBalance.upsert({
        where: { unitId_fundId: { unitId, fundId } },
        create: { unitId, fundId, balance: -Number(amount) },
        update: { balance: { decrement: Number(amount) } },
      });
    }
  });

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect("success", back, "Payment recorded.");
};

/**
 * Spec #19 "OA Reminder" — an ad-hoc, admin-composed "Notify Owner" message
 * for a unit's service charge, distinct from the automatic staged reminders
 * (lib/service-charge-reminders.ts) and the installment-only "Send invoice"
 * button (app/service-charge-installment-actions.ts). An optional file is
 * stored as an EntityDocument (this app's email sender has no real
 * attachment API) and its download link is embedded in the message.
 */
export const sendServiceChargeReminderAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  const message = formData.get("message")?.toString().trim();
  const attachment = formData.get("attachment");

  if (!unitId) {
    return encodedRedirect("error", "/protected/properties", "Invalid unit.");
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      propertyId: true,
      label: true,
      ownerId: true,
      property: {
        select: { name: true, propertyType: { select: { unitPrefix: true, hasFloors: true } } },
      },
    },
  });
  if (!unit) {
    return encodedRedirect("error", "/protected/properties", "Unit not found.");
  }

  const back = `/protected/properties/${unit.propertyId}`;

  if (!message) {
    return encodedRedirect("error", back, "Write a message before sending.");
  }
  if (!unit.ownerId) {
    return encodedRedirect(
      "error",
      back,
      "This unit has no owner to notify.",
    );
  }

  let attachmentUrl: string | undefined;
  if (attachment instanceof File && attachment.size > 0) {
    const uploaded = await uploadEntityDocument(attachment, "unit", unitId);
    const document = await prisma.entityDocument.create({
      data: {
        unitId,
        category: "other",
        label: "Service charge reminder attachment",
        fileName: uploaded.fileName,
        filePath: uploaded.objectKey,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
        uploadedById: admin.id,
      },
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    attachmentUrl = `${appUrl}/api/entity-document/${document.id}`;
  }

  const unitLabel = formatUnitLabel(unit.property.propertyType, unit.label);
  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin, id: { not: admin.id } },
    select: { id: true },
  });

  await notifyOwnerCustom({
    propertyId: unit.propertyId,
    propertyName: unit.property.name,
    unitLabel,
    message,
    attachmentUrl,
    recipientIds: [unit.ownerId, ...admins.map((a) => a.id)],
  });

  await prisma.unit.update({
    where: { id: unitId },
    data: { serviceChargeLastReminderAt: new Date() },
  });

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect("success", back, "Reminder sent to the owner.");
};
