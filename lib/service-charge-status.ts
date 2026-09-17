import { differenceInCalendarDays, isSameMonth } from "date-fns";

import { moneyValue } from "@/lib/finance";

/** How many days out a due date counts as "coming up soon" rather than
 * merely "on schedule" — mirrors the 7-day window the reminder cron
 * (lib/service-charge-reminders.ts) uses for its "upcoming" nudge. */
const DUE_SOON_WINDOW_DAYS = 7;

export type ServiceChargeTone = "overdue" | "dueSoon" | "ok" | "none";

/** Shared per-unit service-charge status, used everywhere a unit's charge
 * needs a badge/filter/tally: the per-property page
 * (app/protected/properties/[id]/page.tsx) and the portfolio-wide Service
 * Charges module (app/protected/service-charge-ledger/page.tsx) both call this so
 * their pills/badges never drift out of sync with each other.
 *
 * A due date in the past only means "overdue" when something is actually
 * still owed — a unit that's been paid off (balance at or below zero)
 * reads as "ok" regardless of how old its due date is, otherwise every
 * settled unit stays stuck showing Overdue until its next invoice rolls
 * the due date forward. */
export function serviceChargeTone(unit: {
  serviceChargeAmount: unknown;
  serviceChargeDueDate: Date | null;
  serviceChargeBalance: unknown;
}): ServiceChargeTone {
  if (!unit.serviceChargeAmount || !unit.serviceChargeDueDate) return "none";
  if (moneyValue(unit.serviceChargeBalance as never) <= 0) return "ok";
  const daysUntilDue = differenceInCalendarDays(
    unit.serviceChargeDueDate,
    new Date(),
  );
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue <= DUE_SOON_WINDOW_DAYS) return "dueSoon";
  return "ok";
}

export type CollectionBucket =
  | "overdue"
  | "dueToday"
  | "dueSoon"
  | "dueThisMonth"
  | "ok"
  | "none";

/** A finer partition than serviceChargeTone — spec #18 "OA Collection
 * Position" wants Due Today, Due Soon (7-day window), and Due This Month as
 * their own separate, mutually exclusive tiles (most urgent wins), on top
 * of Overdue/OK/None. Every unit falls into exactly one bucket, so the
 * tiles' counts always sum to the total billed unit count. Same balance
 * guard as serviceChargeTone — a paid-off unit is never "overdue" just
 * because its due date has passed. */
export function collectionBucket(unit: {
  serviceChargeAmount: unknown;
  serviceChargeDueDate: Date | null;
  serviceChargeBalance: unknown;
}): CollectionBucket {
  if (!unit.serviceChargeAmount || !unit.serviceChargeDueDate) return "none";
  if (moneyValue(unit.serviceChargeBalance as never) <= 0) return "ok";
  const today = new Date();
  const daysUntilDue = differenceInCalendarDays(unit.serviceChargeDueDate, today);

  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue === 0) return "dueToday";
  if (daysUntilDue <= DUE_SOON_WINDOW_DAYS) return "dueSoon";
  if (isSameMonth(unit.serviceChargeDueDate, today)) return "dueThisMonth";
  return "ok";
}
