import "server-only";

import { differenceInCalendarDays, format } from "date-fns";

import { formatMoney } from "@/lib/finance";
import { notifyOwnerChargeReminder } from "@/lib/notifications";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { ChargeStatus, ChargeType } from "@/lib/generated/prisma/client";

const UPCOMING_WINDOW_DAYS = 7;

/**
 * Daily owner alerts for open rent and bill charges: upcoming (7 days),
 * due today, then a daily overdue nudge. Deduped by looking for the same
 * in-app title + finance href created today so a re-run is a no-op.
 */
export async function runRentBillOwnerReminders(): Promise<{
  checked: number;
  notified: number;
}> {
  const charges = await prisma.charge.findMany({
    where: {
      status: ChargeStatus.open,
      unit: { rentBillsEnabled: true, ownerId: { not: null } },
    },
    select: {
      id: true,
      title: true,
      type: true,
      amount: true,
      dueDate: true,
      tenant: { select: { firstName: true, lastName: true, email: true } },
      unit: {
        select: {
          ownerId: true,
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

  const today = new Date();
  const startOfToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  let notified = 0;

  for (const charge of charges) {
    const ownerId = charge.unit.ownerId;
    if (!ownerId) continue;

    const daysUntilDue = differenceInCalendarDays(charge.dueDate, today);
    const stage =
      daysUntilDue < 0
        ? "overdue"
        : daysUntilDue === 0
          ? "due"
          : daysUntilDue <= UPCOMING_WINDOW_DAYS
            ? "upcoming"
            : null;
    if (!stage) continue;

    const kind = charge.type === ChargeType.rent ? "rent" : "bill";
    const title =
      stage === "upcoming"
        ? `${kind === "rent" ? "Rent" : "Bill"} due soon`
        : stage === "due"
          ? `${kind === "rent" ? "Rent" : "Bill"} due today`
          : `${kind === "rent" ? "Rent" : "Bill"} overdue`;
    const href = `/protected/finances/${charge.id}`;

    const alreadySent = await prisma.notification.findFirst({
      where: {
        userId: ownerId,
        title,
        href,
        createdAt: { gte: startOfToday },
      },
      select: { id: true },
    });
    if (alreadySent) continue;

    const tenantName =
      [charge.tenant.firstName, charge.tenant.lastName]
        .filter(Boolean)
        .join(" ") || charge.tenant.email;

    await notifyOwnerChargeReminder({
      ownerId,
      chargeId: charge.id,
      stage,
      kind,
      propertyName: charge.unit.property.name,
      unitLabel: formatUnitLabel(
        charge.unit.property.propertyType,
        charge.unit.label,
      ),
      tenantName,
      amount: formatMoney(charge.amount),
      dueDate: format(charge.dueDate, "d MMM yyyy"),
      title: charge.title,
      daysOverdue: daysUntilDue < 0 ? Math.abs(daysUntilDue) : undefined,
    });
    notified++;
  }

  return { checked: charges.length, notified };
}
