import { differenceInCalendarDays } from "date-fns";

export type ExpiryStatus = "expired" | "expiring" | "valid" | "not_set";

export function getExpiryStatus(
  date: Date | null | undefined,
  expiringSoonDays: number,
): {
  status: ExpiryStatus;
  daysUntil: number | null;
} {
  if (!date) {
    return { status: "not_set", daysUntil: null };
  }

  const daysUntil = differenceInCalendarDays(date, new Date());

  if (daysUntil < 0) {
    return { status: "expired", daysUntil };
  }

  if (daysUntil <= expiringSoonDays) {
    return { status: "expiring", daysUntil };
  }

  return { status: "valid", daysUntil };
}

export const EXPIRY_STATUS_META: Record<
  ExpiryStatus,
  { label: string; pill: string; dot: string }
> = {
  expired: {
    label: "Expired",
    pill: "bg-rose-50 text-rose-700 ring-rose-600/20",
    dot: "bg-rose-500",
  },
  expiring: {
    label: "Expiring soon",
    pill: "bg-amber-50 text-amber-700 ring-amber-600/20",
    dot: "bg-amber-500",
  },
  valid: {
    label: "Valid",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    dot: "bg-emerald-500",
  },
  not_set: {
    label: "Not on file",
    pill: "bg-slate-100 text-slate-600 ring-slate-500/20",
    dot: "bg-slate-300",
  },
};

export type WorkerHrRecord = {
  passportNumber: string | null;
  passportIssuance: Date | null;
  passportExpiry: Date | null;
  visaNumber: string | null;
  visaIssuance: Date | null;
  visaExpiry: Date | null;
  civilId: string | null;
  civilIdIssuance: Date | null;
  civilIdExpiry: Date | null;
  drivingLicenseNumber: string | null;
  drivingLicenseIssuance: Date | null;
  drivingLicenseExpiry: Date | null;
  hasVehicle: boolean;
  vehicleRegistrationNumber: string | null;
  vehicleRegistrationIssuance: Date | null;
  vehicleRegistrationExpiry: Date | null;
  carInsuranceNumber: string | null;
  carInsuranceIssuance: Date | null;
  carInsuranceExpiry: Date | null;
};

export type HrDocumentKey =
  | "passport"
  | "drivingLicense"
  | "visa"
  | "civilId"
  | "vehicleRegistration"
  | "carInsurance";

export type HrDocumentConfig = {
  key: HrDocumentKey;
  label: string;
  numberField: keyof WorkerHrRecord;
  issuanceField: keyof WorkerHrRecord;
  expiryField: keyof WorkerHrRecord;
  numberLabel: string;
  /** Civil ID's number is already editable on the profile form above this
   * modal — shown here read-only rather than duplicated as a second
   * editable field that could drift out of sync with it. */
  numberEditable?: boolean;
  /** How many days before expiry this counts as "expiring soon" — matches
   * the shortest of the alert milestones shown alongside the field
   * (e.g. "Alerts at 9, 6, 3 months" → 90 days is the last/most urgent one
   * before it's simply expired). */
  expiringSoonDays: number;
  /** Shown next to the section heading, e.g. "Alerts at 9, 6, 3 months
   * before expiry". */
  alertHint: string;
  /** Only asked for when the worker has/drives a vehicle for work. */
  vehicleOnly?: boolean;
};

const MONTH_DAYS = 30;

export const HR_DOCUMENTS: HrDocumentConfig[] = [
  {
    key: "passport",
    label: "Passport",
    numberField: "passportNumber",
    issuanceField: "passportIssuance",
    expiryField: "passportExpiry",
    numberLabel: "Passport number",
    numberEditable: true,
    expiringSoonDays: 3 * MONTH_DAYS,
    alertHint: "Alerts at 9, 6, 3 months before expiry",
  },
  {
    key: "drivingLicense",
    label: "Driving License",
    numberField: "drivingLicenseNumber",
    issuanceField: "drivingLicenseIssuance",
    expiryField: "drivingLicenseExpiry",
    numberLabel: "License number",
    numberEditable: true,
    expiringSoonDays: 3 * MONTH_DAYS,
    alertHint: "Alerts at 9, 6, 3 months before expiry",
  },
  {
    key: "visa",
    label: "Work Visa / Residency",
    numberField: "visaNumber",
    issuanceField: "visaIssuance",
    expiryField: "visaExpiry",
    numberLabel: "Visa number",
    numberEditable: true,
    expiringSoonDays: 2 * MONTH_DAYS,
    alertHint: "Alerts at 2 months, 1 month, 15 days before expiry",
  },
  {
    key: "civilId",
    label: "Bataka (Residency Permit / ID)",
    numberField: "civilId",
    issuanceField: "civilIdIssuance",
    expiryField: "civilIdExpiry",
    numberLabel: "Civil ID number",
    numberEditable: false,
    expiringSoonDays: 2 * MONTH_DAYS,
    alertHint: "Alerts at 2 months, 1 month, 15 days before expiry",
  },
  {
    key: "vehicleRegistration",
    label: "Mulkiya (Vehicle Registration)",
    numberField: "vehicleRegistrationNumber",
    issuanceField: "vehicleRegistrationIssuance",
    expiryField: "vehicleRegistrationExpiry",
    numberLabel: "Registration number",
    numberEditable: true,
    expiringSoonDays: 3 * MONTH_DAYS,
    alertHint: "Alerts at 9, 6, 3 months before expiry",
    vehicleOnly: true,
  },
  {
    key: "carInsurance",
    label: "Car Insurance",
    numberField: "carInsuranceNumber",
    issuanceField: "carInsuranceIssuance",
    expiryField: "carInsuranceExpiry",
    numberLabel: "Policy number",
    numberEditable: true,
    expiringSoonDays: 2 * MONTH_DAYS,
    alertHint: "Alerts at 2 months, 1 month, 15 days before expiry",
    vehicleOnly: true,
  },
];

/** The single worst status across all of a worker's HR documents — drives
 * the summary badge shown on their card. Documents with no date on file are
 * ignored for this rollup, and vehicle documents are skipped entirely for a
 * worker who doesn't have `hasVehicle` set, so a driver-only requirement
 * never alarms an admin about a worker who was never asked for it. */
export function getWorstHrStatus(record: WorkerHrRecord): ExpiryStatus {
  const statuses = HR_DOCUMENTS.filter(
    (doc) => !doc.vehicleOnly || record.hasVehicle,
  )
    .map(
      (doc) =>
        getExpiryStatus(
          record[doc.expiryField] as Date | null,
          doc.expiringSoonDays,
        ).status,
    )
    .filter((status) => status !== "not_set");

  if (statuses.includes("expired")) return "expired";
  if (statuses.includes("expiring")) return "expiring";
  return "valid";
}

/** Every document on a worker's record that is expired or expiring soon —
 * feeds the People page's HR overview so admins can see, at a glance, which
 * specific documents (not just which workers) need attention. */
export function getHrIssues(
  record: WorkerHrRecord,
): { doc: HrDocumentConfig; status: ExpiryStatus; daysUntil: number | null }[] {
  return HR_DOCUMENTS.filter((doc) => !doc.vehicleOnly || record.hasVehicle)
    .map((doc) => ({
      doc,
      ...getExpiryStatus(
        record[doc.expiryField] as Date | null,
        doc.expiringSoonDays,
      ),
    }))
    .filter((entry) => entry.status === "expired" || entry.status === "expiring");
}
