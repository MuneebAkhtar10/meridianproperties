import "server-only";

import { differenceInCalendarDays, format } from "date-fns";

import { formatMoney } from "@/lib/finance";
import { UserType } from "@/lib/generated/prisma/client";
import { STAFF_ADMIN_TYPES } from "@/lib/user-roles";
import {
  notifyServiceChargeDue,
  notifyServiceChargeOverdue,
  notifyServiceChargeUpcoming,
} from "@/lib/notifications";
import {
  pdfAttachmentFromResult,
  renderServiceChargeInvoicePdf,
} from "@/lib/pdf/render-service-charge-invoice";
import { prisma } from "@/lib/prisma";
import { prismaCollectsServiceChargeTypeWhere } from "@/lib/property-types";

/** First reminder this many days before the due date, then again the day
 * before ("upcoming1"), on the day, and daily once overdue. */
const UPCOMING_WINDOW_DAYS = 7;

/**
 * Runs daily (see app/api/cron/service-charge-reminders/route.ts). For every
 * unit with a service charge set up, sends at most one notification per
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
  const units = await prisma.unit.findMany({
    where: {
      // Independent and building-management properties never take service charge.
      property: { propertyType: prismaCollectsServiceChargeTypeWhere() },
      serviceChargeDueDate: { not: null },
      OR: [
        // The recurring service charge follows the maintenance toggle, not
        // the rent & bills one...
        { serviceChargeAmount: { not: null }, maintenanceEnabled: true },
        // ...but any unit that owes an invoiced balance is always chased.
        { serviceChargeBalance: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      label: true,
      propertyId: true,
      ownerId: true,
      serviceChargeAmount: true,
      serviceChargeBalance: true,
      serviceChargeDueDate: true,
      serviceChargeLastStage: true,
      property: { select: { name: true } },
    },
  });

  if (units.length === 0) {
    return { checked: 0, notified: 0 };
  }

  const admins = await prisma.user.findMany({
    where: { userType: { in: STAFF_ADMIN_TYPES } },
    select: { id: true },
  });
  const adminIds = admins.map((admin) => admin.id);
  const today = new Date();

  let notified = 0;

  for (const unit of units) {
    // What's actually owed: the invoiced balance when there is one,
    // otherwise the recurring service charge amount.
    const owed =
      Number(unit.serviceChargeBalance) > 0
        ? unit.serviceChargeBalance
        : unit.serviceChargeAmount;
    if (!unit.serviceChargeDueDate || !owed) {
      continue;
    }

    const daysUntilDue = differenceInCalendarDays(
      unit.serviceChargeDueDate,
      today,
    );

    // Overdue gets a fresh key every day so it keeps nudging; upcoming/due
    // are single-shot per cycle.
    const stageKey =
      daysUntilDue < 0
        ? `overdue:${Math.abs(daysUntilDue)}`
        : daysUntilDue === 0
          ? "due"
          : daysUntilDue === 1
            ? "upcoming1"
            : daysUntilDue <= UPCOMING_WINDOW_DAYS
              ? "upcoming"
              : null;

    if (!stageKey || unit.serviceChargeLastStage === stageKey) {
      continue;
    }

    const recipientIds = Array.from(
      new Set(
        [unit.ownerId, ...adminIds].filter(
          (recipientId): recipientId is string => Boolean(recipientId),
        ),
      ),
    );
    const amount = formatMoney(owed);
    const propertyName = unit.property.name;
    const unitLabel = `Unit ${unit.label}`;

    const latestInvoice = await prisma.serviceChargeInvoice.findFirst({
      where: { unitId: unit.id },
      orderBy: { issueDate: "desc" },
      select: { id: true },
    });
    const pdf = latestInvoice
      ? await renderServiceChargeInvoicePdf(latestInvoice.id)
      : null;
    const attachments = pdf ? [pdfAttachmentFromResult(pdf)] : undefined;

    if (stageKey === "upcoming" || stageKey === "upcoming1") {
      await notifyServiceChargeUpcoming({
        propertyId: unit.propertyId,
        propertyName,
        unitLabel,
        amount,
        dueDate: format(unit.serviceChargeDueDate, "d MMM yyyy"),
        recipientIds,
        attachments,
      });
    } else if (stageKey === "due") {
      await notifyServiceChargeDue({
        propertyId: unit.propertyId,
        propertyName,
        unitLabel,
        amount,
        dueDate: format(unit.serviceChargeDueDate, "d MMM yyyy"),
        recipientIds,
        attachments,
      });
    } else {
      await notifyServiceChargeOverdue({
        propertyId: unit.propertyId,
        propertyName,
        unitLabel,
        amount,
        dueDate: format(unit.serviceChargeDueDate, "d MMM yyyy"),
        daysOverdue: Math.abs(daysUntilDue),
        recipientIds,
        attachments,
      });
    }

    await prisma.unit.update({
      where: { id: unit.id },
      data: { serviceChargeLastStage: stageKey, serviceChargeLastReminderAt: today },
    });
    notified++;
  }

  return { checked: units.length, notified };
}
