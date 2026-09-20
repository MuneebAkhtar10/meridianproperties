"use server";

import { addMonths, format } from "date-fns";
import { revalidatePath } from "next/cache";

import { parseDate, parsePositiveMoney } from "@/lib/finance";
import { notifyInstallmentDue } from "@/lib/notifications";
import {
  pdfAttachmentFromResult,
  renderInstallmentInvoicePdf,
} from "@/lib/pdf/render-service-charge-invoice";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { encodedRedirect } from "@/utils/utils";
import { UserType } from "@/lib/generated/prisma/client";

const MIN_INSTALLMENTS = 2;
const MAX_INSTALLMENTS = 24;
const ALLOWED_FREQUENCIES = [1, 2, 3, 6];

/** Splits `totalAmount` (a 3-decimal-place money string) into `count` equal
 * parts, the last one absorbing whatever's left over from rounding, so the
 * parts always sum back to exactly the total — done in integer
 * thousandths to avoid floating-point drift on the Decimal(14,3) column. */
function splitIntoInstallments(totalAmount: number, count: number): number[] {
  const totalThousandths = Math.round(totalAmount * 1000);
  const baseThousandths = Math.floor(totalThousandths / count);
  const amounts = new Array(count).fill(baseThousandths / 1000);
  const distributed = baseThousandths * (count - 1);
  amounts[count - 1] = (totalThousandths - distributed) / 1000;
  return amounts;
}

/**
 * Sets up a payment plan for whatever a unit currently owes
 * (Unit.serviceChargeBalance), splitting it evenly across N installments.
 * Deliberately unitId-scoped (see the plan/installment models in
 * schema.prisma) — a plan carries forward automatically if the unit
 * changes owners mid-schedule, since updateUnitAction never touches
 * service-charge fields when reassigning ownership.
 */
export const createServiceChargeInstallmentPlanAction = async (
  formData: FormData,
) => {
  const admin = await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  const installmentCount = Number(formData.get("installmentCount"));
  const frequencyMonths = Number(formData.get("frequencyMonths"));
  const startDate = parseDate(formData.get("startDate")?.toString());

  if (!unitId) {
    return encodedRedirect("error", "/protected/properties", "Invalid unit.");
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      propertyId: true,
      serviceChargeBalance: true,
      installmentPlans: {
        where: { cancelledAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { installments: true },
      },
      serviceChargeInvoices: {
        orderBy: { issueDate: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!unit) {
    return encodedRedirect("error", "/protected/properties", "Unit not found.");
  }

  const back = `/protected/properties/${unit.propertyId}`;

  if (
    !Number.isInteger(installmentCount) ||
    installmentCount < MIN_INSTALLMENTS ||
    installmentCount > MAX_INSTALLMENTS
  ) {
    return encodedRedirect(
      "error",
      back,
      `Enter between ${MIN_INSTALLMENTS} and ${MAX_INSTALLMENTS} installments.`,
    );
  }
  if (!ALLOWED_FREQUENCIES.includes(frequencyMonths)) {
    return encodedRedirect("error", back, "Select a valid installment frequency.");
  }
  if (!startDate) {
    return encodedRedirect("error", back, "Enter a valid start date.");
  }

  const totalAmount = Number(unit.serviceChargeBalance);
  if (totalAmount <= 0) {
    return encodedRedirect(
      "error",
      back,
      "This unit doesn't owe anything to split into installments.",
    );
  }

  const activePlan = unit.installmentPlans[0];
  if (
    activePlan &&
    activePlan.installments.some((installment) => !installment.paidAt)
  ) {
    return encodedRedirect(
      "error",
      back,
      "This unit already has an active payment plan — cancel it first.",
    );
  }

  const amounts = splitIntoInstallments(totalAmount, installmentCount);

  await prisma.serviceChargeInstallmentPlan.create({
    data: {
      unitId,
      totalAmount,
      installmentCount,
      frequencyMonths,
      startDate,
      createdById: admin.id,
      sourceInvoiceId: unit.serviceChargeInvoices[0]?.id ?? null,
      installments: {
        create: amounts.map((amount, index) => ({
          sequence: index + 1,
          amount,
          dueDate: addMonths(startDate, frequencyMonths * index),
        })),
      },
    },
  });

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect("success", back, "Payment plan created.");
};

/**
 * Marks one scheduled installment as paid. Money still moves through the
 * same ServiceChargePayment ledger "Record payment" already uses (so
 * Unit.serviceChargeBalance stays the single source of truth) — this just
 * also links that payment back to its installment row.
 */
export const markInstallmentPaidAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const installmentId = formData.get("installmentId")?.toString();
  const amount = parsePositiveMoney(formData.get("amount"));
  const paidAt = parseDate(formData.get("paidAt")?.toString());

  if (!installmentId) {
    return encodedRedirect("error", "/protected/properties", "Invalid installment.");
  }

  const installment = await prisma.serviceChargeInstallment.findUnique({
    where: { id: installmentId },
    include: {
      plan: { select: { unitId: true, unit: { select: { propertyId: true } } } },
    },
  });
  if (!installment) {
    return encodedRedirect("error", "/protected/properties", "Installment not found.");
  }

  const back = `/protected/properties/${installment.plan.unit.propertyId}`;

  if (installment.paidAt) {
    return encodedRedirect("error", back, "That installment is already paid.");
  }
  if (!amount || !paidAt) {
    return encodedRedirect("error", back, "Enter a valid amount and date.");
  }

  const unitId = installment.plan.unitId;
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { serviceChargeBalance: true, ownerId: true },
  });
  if (!unit) {
    return encodedRedirect("error", back, "Unit not found.");
  }

  const newBalance = Number(unit.serviceChargeBalance) - Number(amount);

  await prisma.$transaction(async (tx) => {
    const payment = await tx.serviceChargePayment.create({
      data: {
        unitId,
        amount,
        paidAt,
        note: `Installment #${installment.sequence} of payment plan`,
        billedOwnerId: unit.ownerId,
        createdById: admin.id,
      },
    });
    await tx.serviceChargeInstallment.update({
      where: { id: installmentId },
      data: { paidAt, paymentId: payment.id },
    });
    await tx.unit.update({
      where: { id: unitId },
      data: { serviceChargeBalance: newBalance },
    });
  });

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect("success", back, "Installment marked as paid.");
};

/**
 * Manually sends the "installment due soon" invoice email right now,
 * instead of waiting for the daily cron (lib/installment-reminders.ts) —
 * same notification either way, and this also marks it sent so the cron
 * doesn't send a second one for the same installment.
 */
export const sendInstallmentInvoiceAction = async (formData: FormData) => {
  const actor = await requireRole(UserType.admin);

  const installmentId = formData.get("installmentId")?.toString();
  if (!installmentId) {
    return encodedRedirect("error", "/protected/properties", "Invalid installment.");
  }

  const installment = await prisma.serviceChargeInstallment.findUnique({
    where: { id: installmentId },
    include: {
      plan: {
        select: {
          installmentCount: true,
          unit: {
            select: {
              label: true,
              ownerId: true,
              propertyId: true,
              property: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!installment) {
    return encodedRedirect("error", "/protected/properties", "Installment not found.");
  }

  const unit = installment.plan.unit;
  const back = `/protected/properties/${unit.propertyId}`;

  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin, id: { not: actor.id } },
    select: { id: true },
  });
  const recipientIds = Array.from(
    new Set(
      [unit.ownerId, ...admins.map((admin) => admin.id)].filter(
        (recipientId): recipientId is string => Boolean(recipientId),
      ),
    ),
  );

  if (recipientIds.length === 0) {
    return encodedRedirect(
      "error",
      back,
      "This unit has no owner to send an invoice to.",
    );
  }

  const pdf = await renderInstallmentInvoicePdf(installmentId);
  const attachments = pdf ? [pdfAttachmentFromResult(pdf)] : undefined;

  await notifyInstallmentDue({
    propertyId: unit.propertyId,
    propertyName: unit.property.name,
    unitLabel: unit.label,
    sequence: installment.sequence,
    installmentCount: installment.plan.installmentCount,
    amount: `OMR ${Number(installment.amount).toFixed(3)}`,
    dueDate: format(installment.dueDate, "d MMM yyyy"),
    recipientIds,
    attachments,
  });

  await prisma.serviceChargeInstallment.update({
    where: { id: installmentId },
    data: { reminderSentAt: new Date() },
  });

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect("success", back, "Invoice sent to the owner.");
};

export const cancelServiceChargeInstallmentPlanAction = async (
  formData: FormData,
) => {
  await requireRole(UserType.admin);

  const planId = formData.get("planId")?.toString();
  if (!planId) {
    return encodedRedirect("error", "/protected/properties", "Invalid plan.");
  }

  const plan = await prisma.serviceChargeInstallmentPlan.findUnique({
    where: { id: planId },
    select: { unit: { select: { propertyId: true } } },
  });
  if (!plan) {
    return encodedRedirect("error", "/protected/properties", "Plan not found.");
  }

  const back = `/protected/properties/${plan.unit.propertyId}`;

  await prisma.serviceChargeInstallmentPlan.update({
    where: { id: planId },
    data: { cancelledAt: new Date() },
  });

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect("success", back, "Payment plan cancelled.");
};
