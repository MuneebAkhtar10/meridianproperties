import { subMonths } from "date-fns";

export type ReportPeriodPreset =
  | "monthly"
  | "quarterly"
  | "six_monthly"
  | "nine_monthly"
  | "yearly"
  | "custom";

export const REPORT_PERIOD_LABEL: Record<ReportPeriodPreset, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  six_monthly: "Six Monthly",
  nine_monthly: "Nine Monthly",
  yearly: "Yearly",
  custom: "Custom Date Range",
};

const PRESET_MONTHS: Record<Exclude<ReportPeriodPreset, "custom">, number> = {
  monthly: 1,
  quarterly: 3,
  six_monthly: 6,
  nine_monthly: 9,
  yearly: 12,
};

export function isReportPeriodPreset(value: string | undefined): value is ReportPeriodPreset {
  return Boolean(value && value in REPORT_PERIOD_LABEL);
}

/** Local calendar day from a <input type="date"> value (`YYYY-MM-DD`). */
export function parseDateInput(value: string | undefined | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    0,
    0,
    0,
    0,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Calendar-day window. If From/To are provided they always win, so moving
 * the dates slightly changes the report. Presets only fill those dates. */
export function resolveReportPeriod(
  preset: ReportPeriodPreset,
  customFrom: Date | null,
  customTo: Date | null,
): { from: Date; to: Date } {
  if (customFrom && customTo && !Number.isNaN(customFrom.getTime()) && !Number.isNaN(customTo.getTime())) {
    const from = new Date(customFrom);
    from.setHours(0, 0, 0, 0);
    const to = new Date(customTo);
    to.setHours(23, 59, 59, 999);
    if (from.getTime() <= to.getTime()) return { from, to };
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (preset === "custom") {
    const to = customTo ?? today;
    const from = customFrom ?? subMonths(to, 1);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  const from = subMonths(today, PRESET_MONTHS[preset]);
  from.setHours(0, 0, 0, 0);
  return { from, to: today };
}
