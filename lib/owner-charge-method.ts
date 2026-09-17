/** Only meaningful for a non-OA property (villa/apartment/office/building
 * management) — see components/owner-charge-method-picker.tsx and
 * Expense.ownerChargeMethod in schema.prisma. A plain, framework-agnostic
 * module (no "use client"/"server-only") so both the client picker and the
 * server actions that validate its value can import it. */
export const OWNER_CHARGE_METHODS = ["extra_charge", "service_charge_deduction"] as const;

export type OwnerChargeMethod = (typeof OWNER_CHARGE_METHODS)[number];

export const OWNER_CHARGE_METHOD_LABEL: Record<OwnerChargeMethod, string> = {
  extra_charge: "Charged to owner",
  service_charge_deduction: "Deducted from service charge",
};

export function isOwnerChargeMethod(value: string): value is OwnerChargeMethod {
  return (OWNER_CHARGE_METHODS as readonly string[]).includes(value);
}
