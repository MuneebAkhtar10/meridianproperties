import "server-only";

import { differenceInCalendarDays, format } from "date-fns";

import { notifyInstallmentDue } from "@/lib/notifications";
import {
  pdfAttachmentFromResult,
  renderInstallmentInvoicePdf,
} from "@/lib/pdf/render-service-charge-invoice";
import { prisma } from "@/lib/prisma";
import { UserType } from "@/lib/generated/prisma/client";

const REMINDER_WINDOW_DAYS = 7;

/**
 * Runs daily (see app/api/cron/installment-reminders/route.ts). Emails the
 * owner an "installment due soon" invoice for every unpaid installment
 * that's within a week of its due date and hasn't been reminded yet —
 * `reminderSentAt` makes this a one-shot per installment (not a repeating
 * nag like the main service-charge cron), and also gets set by the admin's
 * manual "Send invoice" button so the two never double-send.
 */
export async function runInstallmentReminders(): Promise<{
  checked: number;
  notified: number;
}> {
  const installments = await prisma.serviceChargeInstallment.findMany({
    where: {
      paidAt: null,
      reminderSentAt: null,
      plan: { cancelledAt: null },
    },
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

  if (installments.length === 0) {
    return { checked: 0, notified: 0 };
  }

  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin },
    select: { id: true },
  });
  const adminIds = admins.map((admin) => admin.id);
  const today = new Date();

  let notified = 0;

  for (const installment of installments) {
    const daysUntilDue = differenceInCalendarDays(installment.dueDate, today);
    if (daysUntilDue > REMINDER_WINDOW_DAYS) continue;

    const unit = installment.plan.unit;
    const recipientIds = Array.from(
      new Set(
        [unit.ownerId, ...adminIds].filter(
          (recipientId): recipientId is string => Boolean(recipientId),
        ),
      ),
    );
    if (recipientIds.length === 0) continue;

    const pdf = await renderInstallmentInvoicePdf(installment.id);
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
      where: { id: installment.id },
      data: { reminderSentAt: new Date() },
    });
    notified++;
  }

  return { checked: installments.length, notified };
}
