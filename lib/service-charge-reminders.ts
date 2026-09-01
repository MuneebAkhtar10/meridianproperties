import "server-only";

import { differenceInCalendarDays, format } from "date-fns";

import { formatMoney } from "@/lib/finance";
import { UserType } from "@/lib/generated/prisma/client";
import {
  notifyServiceChargeDue,
  notifyServiceChargeOverdue,
  notifyServiceChargeUpcoming,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const UPCOMING_WINDOW_DAYS = 7;

/**
 * Runs daily (see app/api/cron/service-charge-reminders/route.ts). For every
 * property with a service charge set up, sends at most one notification per
 * day: an "upcoming" nudge starting 7 days out, a "due today" notice on the
 * day, then a daily "overdue" nudge for every day it stays unpaid.
 * `serviceChargeLastStage` records what was last sent for the CURRENT cycle
 * so a re-run within the same day (or day the reminder already fired) is a
 * no-op; it's cleared whenever the due date moves (edited, or a payment is
 * marked received), so a new cycle starts its own reminder sequence.
 */
export async function runServiceChargeReminders(): Promise<{
  checked: number;
  notified: number;
}> {
  const properties = await prisma.property.findMany({
    where: {
      serviceChargeAmount: { not: null },
      serviceChargeDueDate: { not: null },
    },
    select: {
      id: true,
      name: true,
      ownerId: true,
      serviceChargeAmount: true,
      serviceChargeDueDate: true,
      serviceChargeLastStage: true,
    },
  });

  if (properties.length === 0) {
    return { checked: 0, notified: 0 };
  }

  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin },
    select: { id: true },
  });
  const adminIds = admins.map((admin) => admin.id);
  const today = new Date();

  let notified = 0;

  for (const property of properties) {
    if (!property.serviceChargeDueDate || !property.serviceChargeAmount) {
      continue;
    }

    const daysUntilDue = differenceInCalendarDays(
      property.serviceChargeDueDate,
      today,
    );

    // Overdue gets a fresh key every day so it keeps nudging; upcoming/due
    // are single-shot per cycle.
    const stageKey =
      daysUntilDue < 0
        ? `overdue:${Math.abs(daysUntilDue)}`
        : daysUntilDue === 0
          ? "due"
          : daysUntilDue <= UPCOMING_WINDOW_DAYS
            ? "upcoming"
            : null;

    if (!stageKey || property.serviceChargeLastStage === stageKey) {
      continue;
    }

    const recipientIds = Array.from(
      new Set(
        [property.ownerId, ...adminIds].filter(
          (recipientId): recipientId is string => Boolean(recipientId),
        ),
      ),
    );
    const amount = formatMoney(property.serviceChargeAmount);

    if (stageKey === "upcoming") {
      await notifyServiceChargeUpcoming({
        propertyId: property.id,
        propertyName: property.name,
        amount,
        dueDate: format(property.serviceChargeDueDate, "d MMM yyyy"),
        recipientIds,
      });
    } else if (stageKey === "due") {
      await notifyServiceChargeDue({
        propertyId: property.id,
        propertyName: property.name,
        amount,
        recipientIds,
      });
    } else {
      await notifyServiceChargeOverdue({
        propertyId: property.id,
        propertyName: property.name,
        amount,
        daysOverdue: Math.abs(daysUntilDue),
        recipientIds,
      });
    }

    await prisma.property.update({
      where: { id: property.id },
      data: { serviceChargeLastStage: stageKey },
    });
    notified++;
  }

  return { checked: properties.length, notified };
}
