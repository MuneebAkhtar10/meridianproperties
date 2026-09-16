import type { ManagedUnit } from "@/components/unit-manage-modal";

/**
 * A plain (non-"use client") module on purpose: components/unit-manage-modal.tsx
 * is a client component, so every runtime export from that file — even a
 * plain function — becomes a client reference, and calling it from a Server
 * Component throws ("Attempted to call ... from the server but ... is on
 * the client"). toManagedUnit is only ever called from Server Components
 * (the pages that query a unit), so it has to live outside that file.
 */

/** Same shape as ManagedUnit, but as it actually comes back from Prisma —
 * Decimal instances instead of plain strings. Every page that queries a
 * unit for UnitManageModal should pass its result through toManagedUnit()
 * rather than handing the raw query result straight to the "unit" prop. */
type RawManagedUnit = Omit<
  ManagedUnit,
  | "serviceChargeAmount"
  | "serviceChargeBalance"
  | "serviceChargeInvoices"
  | "fundBalances"
  | "installmentPlans"
> & {
  serviceChargeAmount: unknown;
  serviceChargeBalance: unknown;
  serviceChargeInvoices: (Omit<
    ManagedUnit["serviceChargeInvoices"][number],
    "amountPayable"
  > & { amountPayable: unknown })[];
  fundBalances: (Omit<ManagedUnit["fundBalances"][number], "balance"> & {
    balance: unknown;
  })[];
  installmentPlans: (Omit<
    ManagedUnit["installmentPlans"][number],
    "installments"
  > & {
    installments: (Omit<
      ManagedUnit["installmentPlans"][number]["installments"][number],
      "amount"
    > & { amount: unknown })[];
  })[];
};

/** Converts a raw Prisma unit query result into the plain-object shape
 * UnitManageModal needs — its Decimal fields (serviceChargeAmount,
 * serviceChargeBalance, invoice.amountPayable, fundBalance.balance,
 * installment.amount) become strings, since a Decimal is a class instance
 * and can't cross the Server Component -> Client Component boundary. */
export function toManagedUnit(unit: RawManagedUnit): ManagedUnit {
  return {
    ...unit,
    serviceChargeAmount:
      unit.serviceChargeAmount == null ? null : String(unit.serviceChargeAmount),
    serviceChargeBalance: String(unit.serviceChargeBalance),
    serviceChargeInvoices: unit.serviceChargeInvoices.map((invoice) => ({
      ...invoice,
      amountPayable: String(invoice.amountPayable),
    })),
    fundBalances: unit.fundBalances.map((balance) => ({
      ...balance,
      balance: String(balance.balance),
    })),
    installmentPlans: unit.installmentPlans.map((plan) => ({
      ...plan,
      installments: plan.installments.map((installment) => ({
        ...installment,
        amount: String(installment.amount),
      })),
    })),
  };
}
