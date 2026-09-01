import { CHARGE_STATUS_META, chargeDisplayStatus } from "@/lib/finance";
import type {
  ChargeStatus,
  PaymentStatus,
} from "@/lib/generated/prisma/client";

export function ChargeStatusBadge({
  charge,
}: {
  charge: {
    status: ChargeStatus;
    dueDate: Date;
    amount: number | string | { toString(): string };
    payments: Array<{
      amount: number | string | { toString(): string };
      status: PaymentStatus;
    }>;
  };
}) {
  const meta = CHARGE_STATUS_META[chargeDisplayStatus(charge)];

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
