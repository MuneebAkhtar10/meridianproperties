import { Download } from "lucide-react";
import { format } from "date-fns";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";
import { formatMoney, moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireAnyRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { cn } from "@/lib/utils";

type LedgerEntry = {
  date: Date;
  kind: "invoice" | "payment";
  description: string;
  invoiceNumber?: string;
  debit: number;
  credit: number;
};

/**
 * Spec #17 "Unit Ledger" — the detailed financial history for one unit,
 * distinct from the collection dashboard (the property page / Service
 * Charge Ledger). Every OA unit has its own, reachable from the "View Unit
 * Ledger" link in components/unit-manage-modal.tsx. Grouped per fund
 * (see UnitFundBalance in schema.prisma) since a unit's balance is really
 * several separate fund balances, not one number.
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
      fundBalances: {
        select: { fundId: true, balance: true, fund: { select: { label: true } } },
        orderBy: { fund: { createdAt: "asc" } },
      },
      serviceChargeInvoices: {
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          currentAmount: true,
          fundId: true,
          fund: { select: { label: true } },
        },
        orderBy: { issueDate: "asc" },
      },
      serviceChargePayments: {
        select: {
          id: true,
          paidAt: true,
          amount: true,
          fundId: true,
          fund: { select: { label: true } },
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

  // Group invoices+payments by fund so each fund gets its own chronological
  // running balance, matching the spec's "Opening Balance -> Invoice ->
  // Payments -> Credits -> Adjustments -> Running Balance" flow.
  const fundIds = new Set<string>();
  unit.fundBalances.forEach((b) => fundIds.add(b.fundId));
  unit.serviceChargeInvoices.forEach((i) => fundIds.add(i.fundId));
  unit.serviceChargePayments.forEach((p) => p.fundId && fundIds.add(p.fundId));

  const fundLabelById = new Map<string, string>();
  unit.fundBalances.forEach((b) => fundLabelById.set(b.fundId, b.fund.label));
  unit.serviceChargeInvoices.forEach((i) =>
    fundLabelById.set(i.fundId, i.fund.label),
  );
  unit.serviceChargePayments.forEach(
    (p) => p.fundId && p.fund && fundLabelById.set(p.fundId, p.fund.label),
  );

  const fundGroups = Array.from(fundIds)
    .map((fundId) => {
      const entries: LedgerEntry[] = [
        ...unit.serviceChargeInvoices
          .filter((i) => i.fundId === fundId)
          .map((i): LedgerEntry => ({
            date: i.issueDate,
            kind: "invoice",
            description: "Service charge invoice",
            invoiceNumber: i.invoiceNumber,
            debit: moneyValue(i.currentAmount),
            credit: 0,
          })),
        ...unit.serviceChargePayments
          .filter((p) => p.fundId === fundId)
          .map((p): LedgerEntry => ({
            date: p.paidAt,
            kind: "payment",
            description: p.note ? `Payment — ${p.note}` : "Payment",
            debit: 0,
            credit: moneyValue(p.amount),
          })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime());

      let running = 0;
      const rows = entries.map((entry) => {
        running += entry.debit - entry.credit;
        return { ...entry, running };
      });

      return {
        fundId,
        label: fundLabelById.get(fundId) ?? "Fund",
        rows,
        closingBalance: running,
      };
    })
    .filter((g) => g.rows.length > 0);

  // Payments recorded with no fund selected — they still move the unit's
  // total (see recordServiceChargePaymentAction) but don't belong to any
  // fund's own mini-ledger.
  const unallocatedPayments = unit.serviceChargePayments.filter(
    (p) => !p.fundId,
  );

  const totalBalance = moneyValue(unit.serviceChargeBalance);

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Unit Ledger"
        description={`${unit.property.name} · ${unitLabel}`}
        back={{
          href: `/protected/properties/${propertyId}`,
          label: "Back to property",
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
            <p className="text-xs text-muted-foreground">
              Total balance (all funds)
            </p>
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

      {fundGroups.length === 0 && unallocatedPayments.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No service charge activity recorded for this unit yet.
          </CardContent>
        </Card>
      )}

      {fundGroups.map((group) => (
        <Card key={group.fundId}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{group.label}</CardTitle>
            <span
              className={cn(
                "text-sm font-semibold",
                group.closingBalance < 0 ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {group.closingBalance < 0
                ? `Credit ${formatMoney(Math.abs(group.closingBalance))}`
                : formatMoney(group.closingBalance)}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2 text-right">Debit</th>
                    <th className="px-4 py-2 text-right">Credit</th>
                    <th className="px-4 py-2 text-right">Running balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {group.rows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 align-top">
                        {format(row.date, "dd/MM/yyyy")}
                      </td>
                      <td className="px-4 py-2 align-top">
                        {row.description}
                        {row.invoiceNumber && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            #{row.invoiceNumber}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right align-top">
                        {row.debit > 0 ? formatMoney(row.debit) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right align-top">
                        {row.credit > 0 ? formatMoney(row.credit) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right align-top font-medium",
                          row.running < 0 ? "text-emerald-600" : "text-rose-600",
                        )}
                      >
                        {row.running < 0
                          ? `Credit ${formatMoney(Math.abs(row.running))}`
                          : formatMoney(row.running)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {unallocatedPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Unallocated payments (no fund selected)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {unallocatedPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 align-top">
                        {format(p.paidAt, "dd/MM/yyyy")}
                      </td>
                      <td className="px-4 py-2 align-top">
                        {p.note ? `Payment — ${p.note}` : "Payment"}
                      </td>
                      <td className="px-4 py-2 text-right align-top">
                        {formatMoney(moneyValue(p.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
