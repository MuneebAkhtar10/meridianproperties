import {
  ChargeStatus,
  ChargeType,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/generated/prisma/client";

export const CHARGE_TYPE_LABEL: Record<ChargeType, string> = {
  rent: "Rent",
  electricity: "Electricity",
  gas: "Gas",
  water: "Water",
  internet: "Internet",
  maintenance: "Maintenance fee",
  municipality_fee: "Municipality / lease fee",
  deposit: "Security deposit",
  other: "Other",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  oman_net: "OmanNet / card receipt",
  mobile_payment: "Mobile payment",
  direct_debit: "Direct debit",
  cheque: "Cheque",
  other: "Other",
};

export const CHARGE_TYPES = Object.values(ChargeType);
export const UTILITY_CHARGE_TYPES: readonly ChargeType[] = [
  ChargeType.electricity,
  ChargeType.gas,
  ChargeType.water,
  ChargeType.internet,
];
export const NON_UTILITY_CHARGE_TYPES = CHARGE_TYPES.filter(
  (type) => !UTILITY_CHARGE_TYPES.includes(type),
);
export const PAYMENT_METHODS = Object.values(PaymentMethod);

type DecimalLike = number | string | { toString(): string };

export function moneyValue(value: DecimalLike): number {
  return Number(value.toString());
}

export function formatMoney(value: DecimalLike): string {
  return new Intl.NumberFormat("en-OM", {
    style: "currency",
    currency: "OMR",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(moneyValue(value));
}

export function approvedTotal(
  payments: Array<{ amount: DecimalLike; status: PaymentStatus }>,
): number {
  return payments.reduce(
    (total, payment) =>
      payment.status === PaymentStatus.approved
        ? total + moneyValue(payment.amount)
        : total,
    0,
  );
}

export function pendingTotal(
  payments: Array<{ amount: DecimalLike; status: PaymentStatus }>,
): number {
  return payments.reduce(
    (total, payment) =>
      payment.status === PaymentStatus.pending
        ? total + moneyValue(payment.amount)
        : total,
    0,
  );
}

export function chargeBalance(charge: {
  amount: DecimalLike;
  status: ChargeStatus;
  payments: Array<{ amount: DecimalLike; status: PaymentStatus }>;
}): number {
  if (charge.status === ChargeStatus.waived) {
    return 0;
  }

  return Math.max(
    0,
    moneyValue(charge.amount) - approvedTotal(charge.payments),
  );
}

export type ChargeDisplayStatus =
  | "open"
  | "overdue"
  | "under_review"
  | "partially_paid"
  | "paid"
  | "waived";

export function chargeDisplayStatus(charge: {
  status: ChargeStatus;
  dueDate: Date;
  amount: DecimalLike;
  payments: Array<{ amount: DecimalLike; status: PaymentStatus }>;
}): ChargeDisplayStatus {
  if (charge.status === ChargeStatus.waived) {
    return "waived";
  }

  if (charge.status === ChargeStatus.paid || chargeBalance(charge) === 0) {
    return "paid";
  }

  if (
    charge.payments.some((payment) => payment.status === PaymentStatus.pending)
  ) {
    return "under_review";
  }

  // Some approved money has already landed against this charge, but a
  // balance remains — worth its own status so a partial payment doesn't
  // read the same as no payment at all.
  if (approvedTotal(charge.payments) > 0) {
    return "partially_paid";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return charge.dueDate < today ? "overdue" : "open";
}

export const CHARGE_STATUS_META: Record<
  ChargeDisplayStatus,
  { label: string; className: string }
> = {
  open: {
    label: "Due",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  overdue: {
    label: "Overdue",
    className: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
  under_review: {
    label: "Proof under review",
    className: "bg-[#0886be]/10 text-[#0886be] ring-[#0886be]/20",
  },
  partially_paid: {
    label: "Partially paid",
    className: "bg-violet-50 text-violet-700 ring-violet-600/20",
  },
  paid: {
    label: "Paid",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  waived: {
    label: "Waived",
    className: "bg-slate-50 text-slate-600 ring-slate-500/20",
  },
};

export function monthStart(value: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, 1));
}

export function parseDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateInputValue(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function monthInputValue(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function parsePositiveMoney(
  value: FormDataEntryValue | null,
): string | null {
  const raw = value?.toString().trim();
  if (!raw || !/^\d+(?:\.\d{1,3})?$/.test(raw)) {
    return null;
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999_999.999) {
    return null;
  }

  return amount.toFixed(3);
}

export function parseNonNegativeMoney(
  value: FormDataEntryValue | null,
): string | null {
  const raw = value?.toString().trim();
  if (!raw || !/^\d+(?:\.\d{1,3})?$/.test(raw)) {
    return null;
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount > 999_999_999.999) {
    return null;
  }

  return amount.toFixed(3);
}
