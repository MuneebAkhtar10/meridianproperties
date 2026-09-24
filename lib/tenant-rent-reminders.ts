import "server-only";

import { format } from "date-fns";

import { chargeBalance, formatMoney } from "@/lib/finance";
import { notifyTenantRentReminder } from "@/lib/notifications";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { ChargeStatus, ChargeType } from "@/lib/generated/prisma/client";

/**
 * Tenant rent reminders on the 1st and 15th of the month, for any rent
 * charge still unpaid (its month has started). The cron runs daily; on any
 * other day of the month this does nothing. Deduped per charge per day so a
 * re-run never double-sends.
 */
export async function runTenantRentReminders(now = new Date()): Promise<{
  checked: number;
  notified: number;
  skipped?: string;
}> {
  const day = now.getUTCDate();
  if (day !== 1 && day !== 15) {
    return { checked: 0, notified: 0, skipped: "Not the 1st or 15th" };
  }

  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const endOfThisMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  );

  const charges = await prisma.charge.findMany({
    where: {
      status: ChargeStatus.open,
      type: ChargeType.rent,
      dueDate: { lte: endOfThisMonth },
      unit: { rentBillsEnabled: true },
      tenancy: { endDate: null },
    },
    select: {
      id: true,
      tenantId: true,
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

    const title = charge.dueDate < startOfToday ? "Rent reminder — overdue" : "Rent reminder";
    const href = `/protected/finances/${charge.id}`;
    const alreadySent = await prisma.notification.findFirst({
      where: {
        userId: charge.tenantId,
        href,
        title: { startsWith: "Rent reminder" },
        createdAt: { gte: startOfToday },
      },
      select: { id: true },
    });
    if (alreadySent) continue;

    await notifyTenantRentReminder({
      tenantId: charge.tenantId,
      chargeId: charge.id,
      monthLabel: format(charge.periodStart ?? charge.dueDate, "MMMM yyyy"),
      amount: formatMoney(balance),
      overdue: charge.dueDate < startOfToday,
      propertyName: charge.unit.property.name,
      unitLabel: formatUnitLabel(charge.unit.property.propertyType, charge.unit.label),
    });
    notified++;
  }

  return { checked: charges.length, notified };
}
