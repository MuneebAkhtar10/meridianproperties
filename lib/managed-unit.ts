import type { DocumentItem } from "@/components/entity-document-manager";
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
  | "serviceChargePayments"
  | "installmentPlans"
  | "activeTenancy"
> & {
  /** The unit's own `tenancies` relation, queried with `where: { endDate:
   * null }, take: 1` — at most the one currently-active tenancy, as an
   * array because Prisma has no "single filtered relation" shape. Reduced
   * to a plain `{ id, documents }` object below (dropping any other
   * scalar the query selected, e.g. monthlyRent — a raw Decimal, which
   * can't cross into the client component), since a unit only ever has
   * one active tenancy at a time. */
  tenancies: Array<{ id: string; documents: DocumentItem[] }>;
  serviceChargeAmount: unknown;
  serviceChargeBalance: unknown;
  serviceChargeInvoices: (Omit<
    ManagedUnit["serviceChargeInvoices"][number],
    "amountPayable" | "currentAmount" | "previousBalance"
  > & { amountPayable: unknown; currentAmount: unknown; previousBalance: unknown })[];
  serviceChargePayments?: (Omit<
    ManagedUnit["serviceChargePayments"][number],
    "amount" | "originalAmount" | "fromInstallment"
  > & {
    amount: unknown;
    originalAmount?: unknown;
    installment?: unknown;
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
 * serviceChargeBalance, invoice.amountPayable, installment.amount) become
 * strings, since a Decimal is a class instance and can't cross the Server
 * Component -> Client Component boundary. */
export function toManagedUnit(unit: RawManagedUnit): ManagedUnit {
  // `tenancies` is destructured out (rather than left in the `...rest`
  // spread below) because the query feeding this may select extra scalars
  // off it for server-side use (e.g. monthlyRent) that, as raw Decimals,
  // can't cross into the client component the way activeTenancy does.
  const { tenancies, ...rest } = unit;
  return {
    ...rest,
    activeTenancy: tenancies[0]
      ? { id: tenancies[0].id, documents: tenancies[0].documents }
      : null,
    serviceChargeAmount:
      unit.serviceChargeAmount == null ? null : String(unit.serviceChargeAmount),
    serviceChargeBalance: String(unit.serviceChargeBalance),
    serviceChargeInvoices: unit.serviceChargeInvoices.map((invoice) => ({
      ...invoice,
      dueDate: "dueDate" in invoice && invoice.dueDate ? invoice.dueDate : invoice.issueDate,
      graceDays: "graceDays" in invoice && typeof invoice.graceDays === "number" ? invoice.graceDays : 0,
      billedOwner: "billedOwner" in invoice ? invoice.billedOwner ?? null : null,
      amountPayable: String(invoice.amountPayable),
      currentAmount: String(invoice.currentAmount),
      previousBalance: String(invoice.previousBalance),
    })),
    serviceChargePayments: (unit.serviceChargePayments ?? [])
      .filter((payment): payment is NonNullable<typeof payment> & { id: string; paidAt: Date } =>
        Boolean(payment && "id" in payment && payment.id),
      )
      .map((payment) => ({
        id: payment.id,
        paidAt: payment.paidAt,
        note: "note" in payment ? (payment.note as string | null) ?? null : null,
        transactionNumber:
          "transactionNumber" in payment
            ? (payment.transactionNumber as string | null) ?? null
            : null,
        amount: String(payment.amount),
        originalAmount:
          payment.originalAmount == null ? null : String(payment.originalAmount),
        correctionNote:
          "correctionNote" in payment
            ? (payment.correctionNote as string | null) ?? null
            : null,
        fromInstallment: Boolean(
          "installment" in payment && payment.installment,
        ),
        billedOwner:
          "billedOwner" in payment ? payment.billedOwner ?? null : null,
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
