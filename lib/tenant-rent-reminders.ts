import "server-only";

import { differenceInCalendarDays, format } from "date-fns";

import { chargeBalance, CHARGE_TYPE_LABEL, formatMoney } from "@/lib/finance";
import {
  notifyTenantBillReminder,
  notifyTenantRentReminder,
} from "@/lib/notifications";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { ChargeStatus, ChargeType } from "@/lib/generated/prisma/client";

const UPCOMING_WINDOW_DAYS = 7;

/** Which reminder a charge is due for today, relative to ITS OWN due date —
 * not a fixed calendar day. Mirrors installmentReminderStage in
 * lib/installment-reminders.ts so every "X is due" reminder in the app
 * behaves the same way: a heads-up starting a week out, a nudge the day
 * before, one on the day itself, then daily for as long as it stays
 * overdue. The "a bill was generated" alert is separate and already fires
 * synchronously at charge creation (notifyTenantInvoice) — this only covers
 * the reminder cadence afterwards. */
function reminderStage(
  daysUntilDue: number,
): "overdue" | "due" | "upcoming1" | "upcoming" | null {
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue === 0) return "due";
  if (daysUntilDue === 1) return "upcoming1";
  if (daysUntilDue <= UPCOMING_WINDOW_DAYS) return "upcoming";
  return null;
}

/**
 * Tenant reminders for every open charge (rent and bills alike), timed off
 * each charge's own due date — not a fixed day of the month. Runs daily;
 * deduped per charge per day via the notification log, so overdue charges
 * naturally get reminded every day the cron runs without a separate stage
 * column, while the upcoming/due-today stages only ever match one day per
 * charge anyway.
 */
export async function runTenantRentReminders(now = new Date()): Promise<{
  checked: number;
  notified: number;
}> {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const charges = await prisma.charge.findMany({
    where: {
      status: ChargeStatus.open,
      unit: { rentBillsEnabled: true },
      tenancy: { endDate: null },
    },
    select: {
      id: true,
      tenantId: true,
      type: true,
      title: true,
      amount: true,
      status: true,
      dueDate: true,
      periodStart: true,
      payments: { select: { amount: true, status: true } },
      unit: {
        select: {
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

  let notified = 0;
  for (const charge of charges) {
    const balance = chargeBalance(charge);
    if (balance <= 0) continue;

    const daysUntilDue = differenceInCalendarDays(charge.dueDate, startOfToday);
    const stage = reminderStage(daysUntilDue);
    if (!stage) continue;

    const isRent = charge.type === ChargeType.rent;
    const titlePrefix = isRent ? "Rent reminder" : `${CHARGE_TYPE_LABEL[charge.type]} reminder`;
    const href = `/protected/finances/${charge.id}`;
    const alreadySent = await prisma.notification.findFirst({
      where: {
        userId: charge.tenantId,
        href,
        title: { startsWith: titlePrefix },
        createdAt: { gte: startOfToday },
      },
      select: { id: true },
    });
    if (alreadySent) continue;

    const unitLabel = formatUnitLabel(charge.unit.property.propertyType, charge.unit.label);

    if (isRent) {
      await notifyTenantRentReminder({
        tenantId: charge.tenantId,
        chargeId: charge.id,
        monthLabel: format(charge.periodStart ?? charge.dueDate, "MMMM yyyy"),
        amount: formatMoney(balance),
        overdue: stage === "overdue",
        propertyName: charge.unit.property.name,
        unitLabel,
      });
    } else {
      await notifyTenantBillReminder({
        tenantId: charge.tenantId,
        chargeId: charge.id,
        chargeTitle: charge.title,
        chargeTypeLabel: CHARGE_TYPE_LABEL[charge.type],
        amount: formatMoney(balance),
        dueDateLabel: format(charge.dueDate, "d MMMM yyyy"),
        stage: stage === "upcoming1" ? "upcoming" : stage,
        propertyName: charge.unit.property.name,
        unitLabel,
      });
    }
    notified++;
  }

  return { checked: charges.length, notified };
}
