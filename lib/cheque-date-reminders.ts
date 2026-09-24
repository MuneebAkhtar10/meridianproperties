import "server-only";

import { format } from "date-fns";

import { formatMoney } from "@/lib/finance";
import { notifyAdminsChequeDue } from "@/lib/notifications";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { PaymentMethod } from "@/lib/generated/prisma/client";

/**
 * Daily: every cheque (including post-dated ones) whose date is today and
 * that hasn't been marked cleared or bounced gets an admin notification —
 * the number, amount and date are all that's needed, no cheque photo.
 * Deduped per payment per day.
 */
export async function runChequeDateReminders(now = new Date()): Promise<{
  checked: number;
  notified: number;
}> {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const cheques = await prisma.payment.findMany({
    where: {
      method: PaymentMethod.cheque,
      chequeDate: startOfToday,
      OR: [{ clearanceStatus: null }, { clearanceStatus: "pending" }],
    },
    select: {
      id: true,
      amount: true,
      chequeNumber: true,
      chequeDate: true,
      charge: {
        select: {
          id: true,
          tenant: { select: { firstName: true, lastName: true, email: true } },
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
      },
    },
  });

  let notified = 0;
  for (const cheque of cheques) {
    const href = "/protected/finances/cheque-reminders";
    const marker = cheque.chequeNumber ? `no. ${cheque.chequeNumber}` : "";
    const already = await prisma.notification.findFirst({
      where: {
        title: "Cheque due today",
        href,
        message: { contains: marker || formatMoney(cheque.amount) },
        createdAt: { gte: startOfToday },
      },
      select: { id: true },
    });
    if (already) continue;

    const t = cheque.charge.tenant;
    await notifyAdminsChequeDue({
      chargeId: cheque.charge.id,
      chequeNumber: cheque.chequeNumber,
      amount: formatMoney(cheque.amount),
      tenantName: [t.firstName, t.lastName].filter(Boolean).join(" ") || t.email,
      unitLabel: formatUnitLabel(
        cheque.charge.unit.property.propertyType,
        cheque.charge.unit.label,
      ),
      propertyName: cheque.charge.unit.property.name,
      chequeDate: format(cheque.chequeDate ?? now, "d MMM yyyy"),
    });
    notified++;
  }

  return { checked: cheques.length, notified };
}
