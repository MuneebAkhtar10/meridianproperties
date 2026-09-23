import { Download } from "lucide-react";
import { format } from "date-fns";
import { notFound } from "next/navigation";

import { CorrectPaymentModal } from "@/components/correct-payment-modal";
import { PageHeader } from "@/components/page-header";
import { PendingLink } from "@/components/ui/pending-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";
import { formatMoney, moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireAnyRole, isStaffAdmin } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { ownerAtDate, personName } from "@/lib/unit-owner-at";
import { cn } from "@/lib/utils";

type LedgerEntry = {
  /** The invoice's due date, or the payment's paid date — one combined
   * column, same idiom as the property-ledger tools this mirrors. */
  dueOrPaidDate: Date;
  /** When the row actually happened, for ordering — an invoice's own due
   * date can land well after a payment made against it, so sorting by
   * dueOrPaidDate alone can show a payment before the invoice it settles.
   * An invoice sorts by its issue date instead; a payment has no separate
   * issue date, so it's the same as dueOrPaidDate. */
  sortDate: Date;
  issueDate: Date | null;
  graceDays: number | null;
  transNumber: string | null;
  description: string;
  ownerName: string;
  periodLabel: string | null;
  debit: number;
  credit: number;
  /** Set only for a payment row — lets an admin open "Correct Invoice" on
   * it. Null for an invoice row (there's nothing to correct there yet). */
  paymentId: string | null;
  fromInstallment: boolean;
  wasCorrected: boolean;
  originalAmount: number | null;
};

/**
 * Spec #17 "Unit Ledger" — the detailed financial history for one unit,
 * distinct from the collection dashboard (the property page / Service
 * Charge Ledger). Every OA unit has its own, reachable from the "View Unit
 * Ledger" link in components/unit-manage-modal.tsx, or from the property's
 * Unit Ledgers index. One single chronological running balance — every
 * invoice/payment funnels through the same fund, so there's nothing to
 * split by fund anymore (see the reference ledger this mirrors: Due/Paid
 * Date | Issue Date | Grace | Trans. Number | Description | Period |
 * Amount | Balance, oldest first, ending on a "brought forward" row that
 * carries the same closing balance as the Service Charge Balance above it).
 */
export default async function UnitLedgerPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id: propertyId, unitId } = await params;
  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = user.userType === UserType.owner;
  const isAdmin = isStaffAdmin(user.userType);

  const unit = await prisma.unit.findUnique({
    where: { id: unitId, propertyId },
    include: {
      property: {
        select: {
          name: true,
          buildingNumber: true,
          propertyType: { select: { unitPrefix: true, hasFloors: true } },
        },
      },
      owner: {
        select: { firstName: true, lastName: true, email: true },
      },
      ownershipTransfers: {
        orderBy: { transferDate: "asc" },
        select: {
          transferDate: true,
          fromOwner: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      serviceChargeInvoices: {
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          dueDate: true,
          graceDays: true,
          periodStart: true,
          periodEnd: true,
          currentAmount: true,
          billedOwner: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { issueDate: "asc" },
      },
      serviceChargePayments: {
        select: {
          id: true,
          paidAt: true,
          amount: true,
          transactionNumber: true,
          note: true,
          originalAmount: true,
          installment: { select: { id: true } },
          billedOwner: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { paidAt: "asc" },
      },
    },
  });

  if (!unit) {
    notFound();
  }
  if (isOwner) {
    // Owner-only access rule, same as the property page: they can only see
    // their own unit's ledger.
    const ownsUnit = await prisma.unit.findFirst({
      where: { id: unitId, ownerId: user.id },
      select: { id: true },
    });
    if (!ownsUnit) {
      notFound();
    }
  }

  const ownerName = unit.owner
    ? [unit.owner.firstName, unit.owner.lastName].filter(Boolean).join(" ") ||
      unit.owner.email
    : "Unassigned owner";

  const unitLabel = formatUnitLabel(unit.property.propertyType, unit.label);

  const entries: LedgerEntry[] = [
    ...unit.serviceChargeInvoices.map((i): LedgerEntry => ({
      dueOrPaidDate: i.dueDate,
      sortDate: i.issueDate,
      issueDate: i.issueDate,
      graceDays: i.graceDays,
      transNumber: i.invoiceNumber,
      description: "Service charge invoice",
      ownerName:
        personName(
          ownerAtDate({
            asOf: i.issueDate,
            currentOwner: unit.owner,
            billedOwner: i.billedOwner,
            transfers: unit.ownershipTransfers,
          }),
        ) ?? "Unassigned",
      periodLabel: `${format(i.periodStart, "MMM yyyy")} – ${format(i.periodEnd, "MMM yyyy")}`,
      debit: moneyValue(i.currentAmount),
      credit: 0,
      paymentId: null,
      fromInstallment: false,
      wasCorrected: false,
      originalAmount: null,
    })),
    ...unit.serviceChargePayments.map((p): LedgerEntry => ({
      dueOrPaidDate: p.paidAt,
      sortDate: p.paidAt,
      issueDate: null,
      graceDays: null,
      transNumber: p.transactionNumber,
      description: p.note ? `Payment — ${p.note}` : "Payment",
      ownerName:
        personName(
          ownerAtDate({
            asOf: p.paidAt,
            currentOwner: unit.owner,
            billedOwner: p.billedOwner,
            transfers: unit.ownershipTransfers,
          }),
        ) ?? "Unassigned",
      periodLabel: null,
      debit: 0,
      credit: moneyValue(p.amount),
      paymentId: p.id,
      fromInstallment: p.installment != null,
      wasCorrected: p.originalAmount != null,
      originalAmount: p.originalAmount != null ? moneyValue(p.originalAmount) : null,
    })),
  ].sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

  let running = 0;
  const rowsChronological = entries.map((entry) => {
    running += entry.debit - entry.credit;
    return { ...entry, running };
  });

  // Oldest first — the invoice that opened a period shows before the
  // payment that settled it, so the sequence reads the way it happened.
  const rows = rowsChronological;
  const totalBalance = moneyValue(unit.serviceChargeBalance);

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <PendingLink
          href="/protected/properties"
          className="hover:text-foreground"
        >
          Properties
        </PendingLink>
        <span>/</span>
        <PendingLink
          href={`/protected/properties/${propertyId}`}
          className="hover:text-foreground"
        >
          {unit.property.name}
        </PendingLink>
        <span>/</span>
        <PendingLink
          href={`/protected/properties/${propertyId}/unit-ledgers`}
          className="hover:text-foreground"
        >
          Unit Ledgers
        </PendingLink>
        <span>/</span>
        <span className="font-medium text-foreground">{unitLabel}</span>
      </div>

      <PageHeader
        title="Unit Ledger"
        description={`${unit.property.name} · ${unitLabel}`}
        back={{
          href: `/protected/properties/${propertyId}/unit-ledgers`,
          label: "Back to Unit Ledgers",
        }}
      >
        <ButtonLink
          href={`/api/units/${unit.id}/ledger-pdf`}
          target="_blank"
          variant="outline"
          size="sm"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </ButtonLink>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unit details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Owner</p>
            <p className="font-medium">{ownerName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Owners Association</p>
            <p className="font-medium">{unit.property.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Building</p>
            <p className="font-medium">{unit.property.buildingNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Unit No.</p>
            <p className="font-medium">{unitLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Unit Entitlement</p>
            <p className="font-medium">{unit.entitlements ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Service Charge Balance</p>
            <p
              className={cn(
                "font-semibold",
                totalBalance < 0 ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {totalBalance < 0
                ? `Credit ${formatMoney(Math.abs(totalBalance))}`
                : formatMoney(totalBalance)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No service charge activity recorded for this unit yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Due/Paid Date</th>
                    <th className="px-4 py-2">Issue Date</th>
                    <th className="px-4 py-2 text-right">Grace</th>
                    <th className="px-4 py-2">Trans. Number</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Owner</th>
                    <th className="px-4 py-2">Period</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-right">Balance</th>
                    {isAdmin && <th className="px-4 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row, idx) => {
                    const amount = row.debit > 0 ? row.debit : -row.credit;
                    return (
                      <tr
                        key={idx}
                        className={row.credit > 0 ? "bg-emerald-50/40" : undefined}
                      >
                        <td className="px-4 py-2 align-top whitespace-nowrap">
                          {format(row.dueOrPaidDate, "dd/MM/yyyy")}
                        </td>
                        <td className="px-4 py-2 align-top whitespace-nowrap text-muted-foreground">
                          {row.issueDate ? format(row.issueDate, "dd/MM/yyyy") : "—"}
                        </td>
                        <td className="px-4 py-2 text-right align-top text-muted-foreground">
                          {row.graceDays ? `${row.graceDays}d` : "—"}
                        </td>
                        <td className="px-4 py-2 align-top text-muted-foreground">
                          {row.transNumber ?? "—"}
                        </td>
                        <td className="px-4 py-2 align-top">
                          {row.description}
                          {row.wasCorrected && row.originalAmount != null && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              Corrected from {formatMoney(row.originalAmount)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top text-muted-foreground">
                          {row.ownerName}
                        </td>
                        <td className="px-4 py-2 align-top text-muted-foreground">
                          {row.periodLabel ?? "—"}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2 text-right align-top font-medium whitespace-nowrap",
                            amount < 0 ? "text-emerald-600" : "text-foreground",
                          )}
                        >
                          {amount < 0
                            ? `(${formatMoney(Math.abs(amount))})`
                            : formatMoney(amount)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2 text-right align-top font-medium whitespace-nowrap",
                            row.running < 0 ? "text-emerald-600" : "text-rose-600",
                          )}
                        >
                          {row.running < 0
                            ? `Credit ${formatMoney(Math.abs(row.running))}`
                            : formatMoney(row.running)}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2 align-top">
                            {row.paymentId && !row.fromInstallment && (
                              <CorrectPaymentModal
                                paymentId={row.paymentId}
                                currentAmount={row.credit}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/20 font-medium text-muted-foreground">
                    <td className="px-4 py-2 align-top whitespace-nowrap" colSpan={7}>
                      Brought forward
                    </td>
                    <td className="px-4 py-2 text-right align-top">—</td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right align-top",
                        totalBalance < 0 ? "text-emerald-600" : "text-rose-600",
                      )}
                    >
                      {totalBalance < 0
                        ? `Credit ${formatMoney(Math.abs(totalBalance))}`
                        : formatMoney(totalBalance)}
                    </td>
                    {isAdmin && <td className="px-4 py-2" />}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
