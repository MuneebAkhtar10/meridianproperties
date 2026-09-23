import { format } from "date-fns";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ServicesInvoiceModal } from "@/components/services-invoice-modal";
import { ServicesInvoiceRowActions } from "@/components/services-invoice-row-actions";
import { Card } from "@/components/ui/card";
import { formatMoney, moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { listServicesInvoices } from "@/lib/services-invoice";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";
import { personDisplayName } from "@/lib/utils";

export default async function ServicesInvoicesPage({ params }: PageProps) {
  await requireRole(UserType.admin);

  const { id: propertyId } = (await params) as { id: string };

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      name: true,
      propertyType: { select: { unitPrefix: true, hasFloors: true } },
      units: {
        orderBy: [{ floor: "asc" }, { label: "asc" }],
        select: {
          id: true,
          label: true,
          owner: { select: { firstName: true, lastName: true, email: true } },
          tenant: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });
  if (!property) {
    notFound();
  }

  const invoices = await listServicesInvoices(propertyId);
  const unpaidCount = invoices.filter((invoice) => invoice.status !== "paid").length;
  const paidCount = invoices.length - unpaidCount;

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Services invoices"
        description={`${property.name} · expenses and rent collection only — generate, download, mark paid, or delete`}
        back={{
          href: `/protected/properties/${propertyId}`,
          label: "Back to property",
        }}
      >
        <ServicesInvoiceModal
          propertyId={property.id}
          units={property.units.map((unit) => ({
            unitId: unit.id,
            unitLabel: formatUnitLabel(property.propertyType, unit.label),
            ownerName: unit.owner ? personDisplayName(unit.owner) : "Unassigned owner",
            tenantName: unit.tenant ? personDisplayName(unit.tenant) : null,
          }))}
        />
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Invoices
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{invoices.length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Unpaid
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-700">{unpaidCount}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Paid
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{paidCount}</p>
        </Card>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No services invoices yet"
          description="Generate an invoice from this unit’s expenses and rent received. It will appear in View all invoices as Unpaid until you mark it paid."
        >
          <ServicesInvoiceModal
            propertyId={property.id}
            units={property.units.map((unit) => ({
              unitId: unit.id,
              unitLabel: formatUnitLabel(property.propertyType, unit.label),
              ownerName: unit.owner ? personDisplayName(unit.owner) : "Unassigned owner",
              tenantName: unit.tenant ? personDisplayName(unit.tenant) : null,
            }))}
          />
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2">Invoice</th>
                  <th className="whitespace-nowrap px-4 py-2">Unit</th>
                  <th className="whitespace-nowrap px-4 py-2">Bill to</th>
                  <th className="whitespace-nowrap px-4 py-2">Period</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right">Total</th>
                  <th className="whitespace-nowrap px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((invoice) => {
                  const paid = invoice.status === "paid";
                  return (
                    <tr key={invoice.id} className="hover:bg-muted/20">
                      <td className="whitespace-nowrap px-4 py-2 align-middle">
                        <span className="font-medium">#{invoice.invoiceNumber}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {format(invoice.issueDate, "d MMM yyyy")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 align-middle">
                        {formatUnitLabel(invoice.unit.property.propertyType, invoice.unit.label)}
                      </td>
                      <td
                        className="max-w-[16rem] truncate px-4 py-2 align-middle"
                        title={invoice.billedName}
                      >
                        {invoice.billedName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 align-middle text-muted-foreground">
                        {format(invoice.periodStart, "d MMM yyyy")} –{" "}
                        {format(invoice.periodEnd, "d MMM yyyy")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right align-middle font-medium tabular-nums">
                        {formatMoney(moneyValue(invoice.total))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 align-middle">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                            paid
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                              : "bg-amber-50 text-amber-800 ring-amber-600/20"
                          }`}
                        >
                          {paid ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 align-middle">
                        <ServicesInvoiceRowActions
                          invoiceId={invoice.id}
                          invoiceNumber={invoice.invoiceNumber}
                          status={invoice.status}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
