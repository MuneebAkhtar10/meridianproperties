import { format } from "date-fns";
import { notFound } from "next/navigation";
import { Download, ScrollText, Send } from "lucide-react";

import {
  issueOwnerInvoiceAction,
  voidOwnerInvoiceAction,
} from "@/app/invoice-actions";
import { sendServiceChargeInvoiceAction } from "@/app/service-charge-invoice-actions";
import { FormMessage, type Message } from "@/components/form-message";
import { InvoicePaymentForm } from "@/components/invoice-payment-form";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink } from "@/components/ui/button-link";
import { formatMoney, formatOmrAmount, moneyValue } from "@/lib/finance";
import { INVOICE_KIND_LABEL, isInvoiceKind, isInvoiceStatus } from "@/lib/invoice-options";
import { allocateOutstanding, ensureInvoiceColumns } from "@/lib/invoices";
import { prisma } from "@/lib/prisma";
import { formatUnitLabel } from "@/lib/property-types";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";
import { personDisplayName } from "@/lib/utils";

function billedParty(person: {
  email: string;
  firstName: string | null;
  lastName: string | null;
} | null) {
  if (!person) {
    return { name: "No owner assigned", email: null as string | null };
  }
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  if (name) {
    return { name, email: person.email };
  }
  return { name: personDisplayName(person), email: person.email };
}

export default async function InvoiceDetailPage({ params, searchParams }: PageProps) {
  await requireRole(UserType.admin);
  await ensureInvoiceColumns();

  const { id } = await params;
  const message = (await searchParams) as Message;

  const invoice = await prisma.serviceChargeInvoice.findUnique({
    where: { id },
    include: {
      lines: true,
      fund: { select: { id: true, label: true } },
      billedOwner: { select: { email: true, firstName: true, lastName: true } },
      unit: {
        select: {
          id: true,
          label: true,
          propertyId: true,
          owner: { select: { email: true, firstName: true, lastName: true } },
          property: {
            select: {
              name: true,
              propertyType: { select: { unitPrefix: true, hasFloors: true } },
            },
          },
        },
      },
    },
  });
  if (!invoice) notFound();

  const siblingInvoices = await prisma.serviceChargeInvoice.findMany({
    where: { unitId: invoice.unitId },
    select: {
      id: true,
      unitId: true,
      issueDate: true,
      createdAt: true,
      currentAmount: true,
      status: true,
    },
  });
  const payments = await prisma.serviceChargePayment.findMany({
    where: { unitId: invoice.unitId },
    orderBy: { paidAt: "desc" },
    select: { id: true, amount: true, paidAt: true, note: true, transactionNumber: true },
  });
  const outstandingMap = allocateOutstanding({
    invoices: siblingInvoices.map((row) => ({
      ...row,
      currentAmount: moneyValue(row.currentAmount),
    })),
    payments: payments.map((payment) => ({
      unitId: invoice.unitId,
      paidAt: payment.paidAt,
      amount: moneyValue(payment.amount),
    })),
  });

  const kind = isInvoiceKind(invoice.kind) ? invoice.kind : "service_charge";
  const status = isInvoiceStatus(invoice.status) ? invoice.status : "issued";
  const outstanding =
    status === "issued"
      ? (outstandingMap.get(invoice.id) ?? moneyValue(invoice.currentAmount))
      : status === "draft"
        ? moneyValue(invoice.currentAmount)
        : 0;
  const party = billedParty(invoice.billedOwner ?? invoice.unit.owner);
  const unitLabel = formatUnitLabel(invoice.unit.property.propertyType, invoice.unit.label);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const overdueFrom = new Date(invoice.dueDate);
  overdueFrom.setUTCDate(overdueFrom.getUTCDate() + invoice.graceDays);
  const displayStatus =
    status === "draft"
      ? "draft"
      : status === "void"
        ? "void"
        : outstanding <= 0.0005
          ? "paid"
          : overdueFrom < today
            ? "overdue"
            : outstanding + 0.0005 < moneyValue(invoice.currentAmount)
              ? "partial"
              : invoice.sentAt
                ? "sent"
                : "issued";

  const newHref = `/protected/invoices/new?property=${invoice.unit.propertyId}&unit=${invoice.unit.id}`;
  const ledgerHref = `/protected/properties/${invoice.unit.propertyId}/units/${invoice.unit.id}/ledger`;

  return (
    <div className="w-full px-4 pt-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title={`Invoice #${invoice.invoiceNumber}`}
          description={`${INVOICE_KIND_LABEL[kind]} · ${invoice.unit.property.name} · ${unitLabel}`}
          back={{ href: "/protected/invoices", label: "All invoices" }}
        >
          <ButtonLink href={ledgerHref} variant="outline" size="sm">
            <ScrollText className="h-4 w-4" />
            Ledger
          </ButtonLink>
          <ButtonLink href={newHref} variant="outline" size="sm">
            New invoice
          </ButtonLink>
        </PageHeader>

        {"error" in message || "success" in message ? (
          <FormMessage message={message} />
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <article className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b bg-muted/30 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {INVOICE_KIND_LABEL[kind]}
                </p>
                <h2 className="mt-1 font-semibold tracking-tight">
                  #{invoice.invoiceNumber}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <InvoiceStatusBadge status={displayStatus} />
                <ButtonLink
                  href={`/api/service-charge-invoices/${invoice.id}/pdf`}
                  variant="outline"
                  size="sm"
                  target="_blank"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </ButtonLink>
                {status === "issued" && invoice.unit.owner && (
                  <form>
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input
                      type="hidden"
                      name="redirectTo"
                      value={`/protected/invoices/${invoice.id}`}
                    />
                    <SubmitButton
                      formAction={sendServiceChargeInvoiceAction}
                      variant="outline"
                      size="sm"
                      pendingText="Sending..."
                    >
                      <Send className="h-4 w-4" />
                      Send
                    </SubmitButton>
                  </form>
                )}
                {status === "draft" && (
                  <>
                    <form>
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <SubmitButton
                        formAction={issueOwnerInvoiceAction}
                        size="sm"
                        pendingText="Issuing..."
                      >
                        Issue
                      </SubmitButton>
                    </form>
                    <form>
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <SubmitButton
                        formAction={voidOwnerInvoiceAction}
                        variant="ghost"
                        size="sm"
                        pendingText="Voiding..."
                      >
                        Void
                      </SubmitButton>
                    </form>
                  </>
                )}
              </div>
            </header>

            <div className="grid gap-6 border-b px-6 py-5 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Bill to
                </p>
                <p className="mt-1.5 text-[15px] font-semibold leading-snug">{party.name}</p>
                {party.email ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{party.email}</p>
                ) : null}
              </div>
              <div className="sm:text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Unit
                </p>
                <p className="mt-1.5 text-[15px] font-semibold leading-snug">
                  {invoice.unit.property.name}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{unitLabel}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 border-b">
              {[
                { label: "Issued", value: format(invoice.issueDate, "d MMM yyyy") },
                { label: "Due", value: format(invoice.dueDate, "d MMM yyyy") },
              ].map((item) => (
                <div
                  key={item.label}
                  className="border-b border-border/70 px-6 py-4 last:border-b-0 sm:odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0"
                >
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium leading-snug">{item.value}</dd>
                </div>
              ))}
            </dl>

            <div className="px-2 py-2 sm:px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id} className="border-t">
                      <td className="px-4 py-3">{line.description}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {Number(line.qty)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatOmrAmount(line.unitRate)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatOmrAmount(line.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t bg-muted/20 px-6 py-4">
              <dl className="w-full max-w-xs space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-8">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums font-medium">
                    {formatMoney(invoice.currentAmount)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-8 border-t pt-2">
                  <dt className="font-medium">Outstanding</dt>
                  <dd className="text-base font-semibold tabular-nums">
                    {formatMoney(outstanding)}
                  </dd>
                </div>
              </dl>
            </div>

            {invoice.notes ? (
              <p className="border-t px-6 py-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Notes. </span>
                {invoice.notes}
              </p>
            ) : null}
          </article>

          <aside className="space-y-4 lg:sticky lg:top-6">
            {status === "issued" && outstanding > 0.0005 ? (
              <InvoicePaymentForm
                unitId={invoice.unit.id}
                fundId={invoice.fund.id}
                invoiceId={invoice.id}
                defaultAmount={outstanding.toFixed(3)}
              />
            ) : null}

            <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Payments on this unit
              </h3>
              {payments.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">None recorded yet.</p>
              ) : (
                <ul className="mt-3 divide-y">
                  {payments.slice(0, 8).map((payment) => (
                    <li key={payment.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <div>
                        <p>{format(payment.paidAt, "d MMM yyyy")}</p>
                        {payment.transactionNumber ? (
                          <p className="text-xs text-muted-foreground">
                            {payment.transactionNumber}
                          </p>
                        ) : null}
                      </div>
                      <p className="font-medium tabular-nums">{formatMoney(payment.amount)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
