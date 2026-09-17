import { Download } from "lucide-react";
import { format } from "date-fns";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PendingLink } from "@/components/ui/pending-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";
import { formatMoney, moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireAnyRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { cn } from "@/lib/utils";

type LedgerEntry = {
  /** The invoice's due date, or the payment's paid date — one combined
   * column, same idiom as the property-ledger tools this mirrors. */
  dueOrPaidDate: Date;
  issueDate: Date | null;
  graceDays: number | null;
  transNumber: string | null;
  description: string;
  periodLabel: string | null;
  debit: number;
  credit: number;
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
 * Amount | Balance, newest first, ending on a zero "brought forward" row).
 */
export default async function UnitLedgerPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id: propertyId, unitId } = await params;
  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = user.userType === UserType.owner;

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
      issueDate: i.issueDate,
      graceDays: i.graceDays,
      transNumber: i.invoiceNumber,
      description: "Service charge invoice",
      periodLabel: `${format(i.periodStart, "MMM yyyy")} – ${format(i.periodEnd, "MMM yyyy")}`,
      debit: moneyValue(i.currentAmount),
      credit: 0,
    })),
    ...unit.serviceChargePayments.map((p): LedgerEntry => ({
      dueOrPaidDate: p.paidAt,
      issueDate: null,
      graceDays: null,
      transNumber: p.transactionNumber,
      description: p.note ? `Payment — ${p.note}` : "Payment",
      periodLabel: null,
      debit: 0,
      credit: moneyValue(p.amount),
    })),
  ].sort((a, b) => a.dueOrPaidDate.getTime() - b.dueOrPaidDate.getTime());

  let running = 0;
  const rowsChronological = entries.map((entry) => {
    running += entry.debit - entry.credit;
    return { ...entry, running };
  });

  // Newest first, matching the reference ledger layout — the running
  // balance itself is still computed oldest-to-newest above.
  const rows = [...rowsChronological].reverse();
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
                    <th className="px-4 py-2">Period</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-right">Balance</th>
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
                        <td className="px-4 py-2 align-top">{row.description}</td>
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
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/20 text-muted-foreground">
                    <td className="px-4 py-2 align-top whitespace-nowrap" colSpan={6}>
                      Brought forward
                    </td>
                    <td className="px-4 py-2 text-right align-top">—</td>
                    <td className="px-4 py-2 text-right align-top">
                      {formatMoney(0)}
                    </td>
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
