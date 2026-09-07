import "server-only";

import { differenceInCalendarDays, format } from "date-fns";

import { HR_DOCUMENTS, type WorkerHrRecord } from "@/lib/hr";
import { notifyHrDocumentExpiring } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { UserType } from "@/lib/generated/prisma/client";

/**
 * Runs daily (see app/api/cron/hr-reminders/route.ts). For every in-house
 * worker, checks each HR document (passport, driving license, visa, Civil
 * ID, and — only if they have a vehicle — Mulkiya and car insurance) that
 * has an expiry date on file, and notifies every admin once per stage: an
 * "upcoming" nudge starting at that document's alert window (see
 * lib/hr.ts's `expiringSoonDays` per document), a "due today" notice, then
 * a daily "overdue" nudge for every day it stays unrenewed.
 * `hrReminderStages` records what was last sent per document key so a
 * re-run within the same day is a no-op; editing the date to a new value
 * naturally produces a different stage key and starts a fresh cycle.
 */
export async function runHrReminders(): Promise<{
  checked: number;
  notified: number;
}> {
  const workers = await prisma.user.findMany({
    where: { userType: UserType.worker, workerCategory: "in_house" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      passportNumber: true,
      passportExpiry: true,
      drivingLicenseNumber: true,
      drivingLicenseExpiry: true,
      visaNumber: true,
      visaExpiry: true,
      civilId: true,
      civilIdExpiry: true,
      hasVehicle: true,
      vehicleRegistrationNumber: true,
      vehicleRegistrationExpiry: true,
      carInsuranceNumber: true,
      carInsuranceExpiry: true,
      hrReminderStages: true,
    },
  });

  const relevantWorkers = workers.filter((worker) =>
    HR_DOCUMENTS.filter((doc) => !doc.vehicleOnly || worker.hasVehicle).some(
      (doc) =>
        (worker as unknown as WorkerHrRecord)[doc.expiryField] instanceof
        Date,
    ),
  );

  if (relevantWorkers.length === 0) {
    return { checked: 0, notified: 0 };
  }

  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin },
    select: { id: true },
  });
  const adminIds = admins.map((admin) => admin.id);

  if (adminIds.length === 0) {
    return { checked: relevantWorkers.length, notified: 0 };
  }

  const today = new Date();
  let notified = 0;

  for (const worker of relevantWorkers) {
    const stages = (worker.hrReminderStages as Record<string, string>) ?? {};
    const nextStages = { ...stages };
    const workerName =
      [worker.firstName, worker.lastName].filter(Boolean).join(" ") ||
      worker.email;

    for (const doc of HR_DOCUMENTS) {
      if (doc.vehicleOnly && !worker.hasVehicle) continue;

      const expiry = (worker as unknown as WorkerHrRecord)[
        doc.expiryField
      ] as Date | null;
      if (!expiry) continue;

      const daysUntilDue = differenceInCalendarDays(expiry, today);

      const stageKey =
        daysUntilDue < 0
          ? `overdue:${Math.abs(daysUntilDue)}`
          : daysUntilDue === 0
            ? "due"
            : daysUntilDue <= doc.expiringSoonDays
              ? "upcoming"
              : null;

      if (!stageKey || stages[doc.key] === stageKey) {
        continue;
      }

      await notifyHrDocumentExpiring({
        workerId: worker.id,
        workerName,
        documentLabel: doc.label,
        expiryDate: format(expiry, "d MMM yyyy"),
        daysUntilDue,
        recipientIds: adminIds,
      });

      nextStages[doc.key] = stageKey;
      notified++;
    }

    if (JSON.stringify(nextStages) !== JSON.stringify(stages)) {
      await prisma.user.update({
        where: { id: worker.id },
        data: { hrReminderStages: nextStages },
      });
    }
  }

  return { checked: relevantWorkers.length, notified };
}
