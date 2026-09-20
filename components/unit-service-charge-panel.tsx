"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Check,
  FileText,
  Mail,
  Pencil,
  Receipt,
  ScrollText,
  Send,
  Settings2,
  Wallet,
} from "lucide-react";

import { updateUnitServiceChargeAction } from "@/app/admin-actions";
import {
  recordServiceChargePaymentAction,
  saveServiceChargeAndGenerateInvoiceAction,
  sendServiceChargeInvoiceAction,
  updateServiceChargeInvoiceAction,
  assignInvoiceToCurrentOwnerAction,
} from "@/app/service-charge-invoice-actions";
import {
  cancelServiceChargeInstallmentPlanAction,
  createServiceChargeInstallmentPlanAction,
  markInstallmentPaidAction,
  sendInstallmentInvoiceAction,
} from "@/app/service-charge-installment-actions";
import { CorrectPaymentModal } from "@/components/correct-payment-modal";
import { CloseModalOnSubmit, Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import type { ManagedUnit } from "@/components/unit-manage-modal";
import {
  dateInputValue,
  formatMoney,
  moneyValue,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
} from "@/lib/finance";
import { cn, personDisplayName as ownerDisplayName } from "@/lib/utils";
import { ownerAtDate, personName } from "@/lib/unit-owner-at";

type Invoice = ManagedUnit["serviceChargeInvoices"][number];

function toDateInput(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return dateInputValue(value);
}

function EditInvoiceModal({
  invoice,
  unitId,
  fundId,
  triggerLabel = "Edit",
}: {
  invoice: Invoice;
  unitId: string;
  fundId: string;
  triggerLabel?: string;
}) {
  const [issueDate, setIssueDate] = useState(toDateInput(invoice.issueDate));
  const [dueDate, setDueDate] = useState(toDateInput(invoice.dueDate));
  const [dueTouched, setDueTouched] = useState(true);

  return (
    <Modal
      title={`Edit invoice #${invoice.invoiceNumber}`}
      description="Update the billed period, due date, grace, or amount. Only the latest invoice can be changed."
      widthClassName="max-w-lg"
      overlayZClassName="z-[70]"
      trigger={
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-background"
        >
          <Pencil className="h-3 w-3" />
          {triggerLabel}
        </button>
      }
    >
      <form className="space-y-3">
        <input type="hidden" name="invoiceId" value={invoice.id} />
        <input type="hidden" name="unitId" value={unitId} />
        <input type="hidden" name="fundId" value={fundId} />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Period start</Label>
            <Input
              name="periodStart"
              type="date"
              defaultValue={toDateInput(invoice.periodStart)}
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Period end</Label>
            <Input
              name="periodEnd"
              type="date"
              defaultValue={toDateInput(invoice.periodEnd)}
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Issue date</Label>
            <Input
              name="issueDate"
              type="date"
              value={issueDate}
              onChange={(event) => {
                const value = event.target.value;
                setIssueDate(value);
                if (!dueTouched && value) {
                  const parsed = new Date(`${value}T00:00:00.000Z`);
                  if (!Number.isNaN(parsed.getTime())) {
                    setDueDate(
                      dateInputValue(
                        new Date(parsed.getTime() + 10 * 24 * 60 * 60 * 1000),
                      ),
                    );
                  }
                }
              }}
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Due date</Label>
            <Input
              name="dueDate"
              type="date"
              value={dueDate}
              onChange={(event) => {
                setDueDate(event.target.value);
                setDueTouched(true);
              }}
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Grace (days)</Label>
            <Input
              name="graceDays"
              type="number"
              min="0"
              defaultValue={String(invoice.graceDays)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount (OMR)</Label>
            <Input
              name="currentAmount"
              type="number"
              step="0.001"
              min="0.001"
              defaultValue={invoice.currentAmount}
              className="h-8 text-xs"
              required
            />
          </div>
        </div>
        <SubmitButton
          formAction={updateServiceChargeInvoiceAction}
          className="w-full"
          pendingText="Saving..."
        >
          Save invoice
        </SubmitButton>
        <CloseModalOnSubmit />
      </form>
    </Modal>
  );
}

export function UnitServiceChargePanel({
  unit,
  funds,
  isAdmin,
}: {
  unit: ManagedUnit;
  funds: { id: string; label: string }[];
  isAdmin: boolean;
}) {
  const hasCharge = Boolean(unit.serviceChargeAmount && unit.serviceChargeDueDate);
  const activePlan = unit.installmentPlans[0] ?? null;
  const currentBalance = moneyValue(unit.serviceChargeBalance);
  const defaultFundId = funds[0]?.id ?? "";
  const [paymentMethod, setPaymentMethod] = useState("");

  const today = new Date();
  const currentYear = today.getFullYear();
  const latestInvoice = unit.serviceChargeInvoices[0] ?? null;
  const [periodStart, setPeriodStart] = useState(
    latestInvoice ? toDateInput(latestInvoice.periodStart) : `${currentYear}-01-01`,
  );
  const [periodEnd, setPeriodEnd] = useState(
    latestInvoice ? toDateInput(latestInvoice.periodEnd) : `${currentYear}-12-31`,
  );
  const [scDueDate, setScDueDate] = useState(
    `${unit.serviceChargeDueDate ? unit.serviceChargeDueDate.getUTCFullYear() : currentYear}-12-31`,
  );
  const [scDueDateTouched, setScDueDateTouched] = useState(false);
  const [issueDate, setIssueDate] = useState(dateInputValue(today));
  const [invoiceDueDate, setInvoiceDueDate] = useState(
    dateInputValue(new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000)),
  );
  const [invoiceDueDateTouched, setInvoiceDueDateTouched] = useState(false);

  const handlePeriodStartChange = (value: string) => {
    setPeriodStart(value);
    const year = value.slice(0, 4);
    if (/^\d{4}$/.test(year)) {
      const newPeriodEnd = `${year}-12-31`;
      setPeriodEnd(newPeriodEnd);
      if (!scDueDateTouched) setScDueDate(newPeriodEnd);
    }
  };

  const overlappingInvoice = (() => {
    const start = new Date(`${periodStart}T00:00:00.000Z`);
    const end = new Date(`${periodEnd}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return (
      unit.serviceChargeInvoices.find(
        (invoice) => invoice.periodStart <= end && invoice.periodEnd >= start,
      ) ?? null
    );
  })();

  const canEditLatest =
    Boolean(overlappingInvoice) && overlappingInvoice?.id === latestInvoice?.id;
  const currentOwnerName = unit.owner ? ownerDisplayName(unit.owner) : null;
  const invoicePayableByOther =
    Boolean(overlappingInvoice?.billedOwner?.id) &&
    Boolean(unit.owner?.id) &&
    overlappingInvoice!.billedOwner!.id !== unit.owner!.id;
  const latestTransfer = unit.ownershipTransfers[0] ?? null;
  const planCancelledAtTransfer =
    Boolean(latestTransfer) &&
    !latestTransfer.keptInstallmentPlan &&
    !activePlan &&
    currentBalance > 0;
  const payments = [...unit.serviceChargePayments].sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
  );

  if (!isAdmin) {
    return hasCharge ? (
      <p className="text-sm text-muted-foreground">
        {formatMoney(unit.serviceChargeAmount!)} billed annually · Due{" "}
        {format(unit.serviceChargeDueDate!, "d MMM yyyy")}
      </p>
    ) : (
      <p className="text-sm text-muted-foreground">No service charge set up yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {hasCharge && unit.serviceChargeLastReceivedAt && (
        <p className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
          <Check className="h-3 w-3" />
          Last invoiced {format(unit.serviceChargeLastReceivedAt, "d MMM yyyy")}
        </p>
      )}

      <form className="space-y-3 rounded-xl border border-border bg-muted/10 p-3">
        <input type="hidden" name="unitId" value={unit.id} />
        <input type="hidden" name="fundId" value={defaultFundId} />
        <input type="hidden" name="serviceChargeCycleMonths" value="12" />
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Settings2 className="h-4 w-4 text-primary" />
          Annual service charge
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Annual amount (OMR)</Label>
            <Input
              name="serviceChargeAmount"
              type="number"
              step="0.001"
              min="0"
              defaultValue={
                unit.serviceChargeAmount ? String(unit.serviceChargeAmount) : ""
              }
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Next cycle due</Label>
            <Input
              name="serviceChargeDueDate"
              type="date"
              value={scDueDate}
              onChange={(event) => {
                setScDueDate(event.target.value);
                setScDueDateTouched(true);
              }}
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Period start</Label>
            <Input
              name="periodStart"
              type="date"
              value={periodStart}
              onChange={(event) => handlePeriodStartChange(event.target.value)}
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Period end</Label>
            <Input
              name="periodEnd"
              type="date"
              value={periodEnd}
              onChange={(event) => {
                setPeriodEnd(event.target.value);
                if (!scDueDateTouched) setScDueDate(event.target.value);
              }}
              className="h-8 text-xs"
              required
            />
          </div>
        </div>

        {overlappingInvoice ? (
          <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
                Invoice for this period
              </p>
              <p className="mt-0.5 text-sm font-medium">
                #{overlappingInvoice.invoiceNumber} ·{" "}
                {formatMoney(overlappingInvoice.amountPayable)}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(overlappingInvoice.periodStart, "d MMM yyyy")} –{" "}
                {format(overlappingInvoice.periodEnd, "d MMM yyyy")}
              </p>
              <p className="text-xs text-foreground">
                Payable by{" "}
                <span className="font-medium">
                  {currentOwnerName ??
                    (overlappingInvoice.billedOwner
                      ? ownerDisplayName(overlappingInvoice.billedOwner)
                      : "Unassigned owner")}
                </span>
                {invoicePayableByOther && overlappingInvoice.billedOwner ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · originally billed to{" "}
                    {ownerDisplayName(overlappingInvoice.billedOwner)}
                  </span>
                ) : null}
              </p>
            </div>
            {(invoicePayableByOther || planCancelledAtTransfer) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-950">
                {planCancelledAtTransfer && currentOwnerName ? (
                  <p>
                    Ownership changed
                    {latestTransfer.fromOwner
                      ? ` from ${ownerDisplayName(latestTransfer.fromOwner)}`
                      : ""}{" "}
                    to {currentOwnerName}. The previous payment plan was
                    cancelled — remaining {formatMoney(currentBalance)} is due
                    from {currentOwnerName}. Set up a new plan below.
                  </p>
                ) : null}
                {invoicePayableByOther && currentOwnerName ? (
                  <form className="mt-1.5">
                    <input type="hidden" name="invoiceId" value={overlappingInvoice.id} />
                    <SubmitButton
                      formAction={assignInvoiceToCurrentOwnerAction}
                      size="sm"
                      className="h-7 text-[11px]"
                      pendingText="Updating..."
                    >
                      Assign this invoice to {currentOwnerName}
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1">
              <a
                href={`/api/service-charge-invoices/${overlappingInvoice.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
              >
                <FileText className="h-3 w-3" />
                View PDF
              </a>
              {unit.owner && (
                <form>
                  <input type="hidden" name="invoiceId" value={overlappingInvoice.id} />
                  <SubmitButton
                    formAction={sendServiceChargeInvoiceAction}
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    pendingText="Sending..."
                  >
                    <Send className="h-3 w-3" />
                    Email invoice
                  </SubmitButton>
                </form>
              )}
              {canEditLatest && (
                <EditInvoiceModal
                  invoice={overlappingInvoice}
                  unitId={unit.id}
                  fundId={defaultFundId}
                  triggerLabel="Edit last invoice"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2 border-t pt-2.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Receipt className="h-4 w-4 text-primary" />
              Generate this period’s invoice
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Issue date</Label>
                <Input
                  name="issueDate"
                  type="date"
                  value={issueDate}
                  onChange={(event) => {
                    const value = event.target.value;
                    setIssueDate(value);
                    if (!invoiceDueDateTouched && value) {
                      const parsed = new Date(`${value}T00:00:00.000Z`);
                      if (!Number.isNaN(parsed.getTime())) {
                        setInvoiceDueDate(
                          dateInputValue(
                            new Date(parsed.getTime() + 10 * 24 * 60 * 60 * 1000),
                          ),
                        );
                      }
                    }
                  }}
                  className="h-8 text-xs"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Invoice due date</Label>
                <Input
                  name="dueDate"
                  type="date"
                  value={invoiceDueDate}
                  onChange={(event) => {
                    setInvoiceDueDate(event.target.value);
                    setInvoiceDueDateTouched(true);
                  }}
                  className="h-8 text-xs"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Grace (days)</Label>
                <Input
                  name="graceDays"
                  type="number"
                  min="0"
                  defaultValue="0"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <SubmitButton
            formAction={updateUnitServiceChargeAction}
            variant="outline"
            size="sm"
            className="h-8 flex-1"
            pendingText="Saving..."
          >
            Save settings
          </SubmitButton>
          {!overlappingInvoice && (
            <SubmitButton
              formAction={saveServiceChargeAndGenerateInvoiceAction}
              size="sm"
              className="h-8 flex-1"
              pendingText="Generating..."
            >
              Generate invoice
            </SubmitButton>
          )}
        </div>
      </form>

      <div className="space-y-2.5 rounded-xl border border-border bg-background p-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            Unit ledger
          </h3>
          <a
            href={`/protected/properties/${unit.propertyId}/units/${unit.id}/ledger`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            View full ledger
          </a>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Balance
          </span>
          <span
            className={cn(
              "text-sm font-semibold",
              currentBalance < 0
                ? "text-emerald-600"
                : currentBalance > 0
                  ? "text-rose-600"
                  : "text-muted-foreground",
            )}
          >
            {currentBalance < 0
              ? `Credit ${formatMoney(Math.abs(currentBalance))}`
              : formatMoney(unit.serviceChargeBalance)}
          </span>
        </div>

        {activePlan ? (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/10 p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Payment plan
              </p>
              <form>
                <input type="hidden" name="planId" value={activePlan.id} />
                <SubmitButton
                  formAction={cancelServiceChargeInstallmentPlanAction}
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-rose-600 hover:text-rose-700"
                  pendingText="Cancelling..."
                >
                  Cancel plan
                </SubmitButton>
              </form>
            </div>
            <div className="divide-y rounded-md border">
              {activePlan.installments.map((installment) => (
                <div key={installment.id} className="px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      #{installment.sequence} · {formatMoney(installment.amount)} ·
                      due {format(installment.dueDate, "d MMM yyyy")}
                    </span>
                    {installment.paidAt && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
                        <Check className="h-3 w-3" />
                        Paid {format(installment.paidAt, "d MMM yyyy")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {unit.serviceChargeInvoices.length > 0 && (
                      <a
                        href={`/api/service-charge-installments/${installment.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 font-medium text-primary hover:bg-muted"
                      >
                        <FileText className="h-3 w-3" />
                        PDF
                      </a>
                    )}
                    {!installment.paidAt && (
                      <>
                        <form>
                          <input type="hidden" name="installmentId" value={installment.id} />
                          <input type="hidden" name="amount" value={String(installment.amount)} />
                          <input type="hidden" name="paidAt" value={dateInputValue()} />
                          <SubmitButton
                            formAction={markInstallmentPaidAction}
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            pendingText="Saving..."
                          >
                            Mark paid
                          </SubmitButton>
                        </form>
                        <form>
                          <input type="hidden" name="installmentId" value={installment.id} />
                          <SubmitButton
                            formAction={sendInstallmentInvoiceAction}
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            pendingText="Sending..."
                          >
                            <Mail className="h-3 w-3" />
                            Send invoice
                          </SubmitButton>
                        </form>
                      </>
                    )}
                    {installment.reminderSentAt && (
                      <span className="text-[10px] text-muted-foreground">
                        Sent {format(installment.reminderSentAt, "d MMM")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          currentBalance > 0 && (
            <details className="rounded-lg border border-border bg-muted/10 p-2.5">
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Set up a payment plan
              </summary>
              <form className="mt-2 space-y-2">
                <input type="hidden" name="unitId" value={unit.id} />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Installments</Label>
                    <Input
                      name="installmentCount"
                      type="number"
                      min="2"
                      max="24"
                      defaultValue="3"
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Every</Label>
                    <Select name="frequencyMonths" defaultValue="1" className="h-8 text-xs">
                      <option value="1">1 month</option>
                      <option value="2">2 months</option>
                      <option value="3">3 months</option>
                      <option value="6">6 months</option>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Start date</Label>
                  <Input
                    name="startDate"
                    type="date"
                    defaultValue={dateInputValue()}
                    className="h-8 text-xs"
                    required
                  />
                </div>
                <SubmitButton
                  formAction={createServiceChargeInstallmentPlanAction}
                  variant="outline"
                  size="sm"
                  className="h-8 w-full"
                  pendingText="Creating..."
                >
                  Create payment plan for {formatMoney(currentBalance)}
                </SubmitButton>
              </form>
            </details>
          )
        )}

        {payments.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recorded payments
            </p>
            <div className="divide-y rounded-xl border border-border/60">
              {payments.slice(0, 8).map((payment) => {
                const owner = ownerAtDate({
                  asOf: new Date(payment.paidAt),
                  currentOwner: unit.owner,
                  billedOwner: payment.billedOwner,
                  transfers: unit.ownershipTransfers,
                });
                const ownerLabel = personName(owner);
                const wasCorrected = payment.originalAmount != null;
                return (
                  <div
                    key={payment.id}
                    className="flex items-start justify-between gap-2 px-2.5 py-1.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{formatMoney(payment.amount)}</p>
                      <p className="text-muted-foreground">
                        {format(payment.paidAt, "d MMM yyyy")}
                        {ownerLabel ? ` · ${ownerLabel}` : ""}
                        {payment.transactionNumber ? ` · ${payment.transactionNumber}` : ""}
                        {payment.note ? ` · ${payment.note}` : ""}
                      </p>
                      {wasCorrected && (
                        <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900">
                          <span className="font-semibold">Corrected</span>
                          {" from "}
                          {formatMoney(payment.originalAmount!)}
                          {" to "}
                          {formatMoney(payment.amount)}
                          {payment.correctionNote ? (
                            <>
                              . <span className="italic">“{payment.correctionNote}”</span>
                            </>
                          ) : null}
                        </p>
                      )}
                    </div>
                    {!payment.fromInstallment && (
                      <CorrectPaymentModal
                        paymentId={payment.id}
                        currentAmount={moneyValue(payment.amount)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <form className="space-y-2 rounded-lg border border-border bg-muted/10 p-2.5">
          <input type="hidden" name="unitId" value={unit.id} />
          <input type="hidden" name="fundId" value={defaultFundId} />
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-primary" />
            Record payment
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              name="amount"
              type="number"
              min="0.001"
              step="0.001"
              placeholder="Amount"
              defaultValue={
                currentBalance > 0
                  ? currentBalance.toFixed(3)
                  : unit.serviceChargeAmount
                    ? String(unit.serviceChargeAmount)
                    : ""
              }
              className="h-8 text-xs"
              required
            />
            <Input
              name="paidAt"
              type="date"
              defaultValue={dateInputValue()}
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Payment method</Label>
              <Select
                name="paymentMethod"
                defaultValue=""
                className="h-8 text-xs"
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option value="">—</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABEL[method]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Transaction number</Label>
              <Input
                name="transactionNumber"
                className="h-8 text-xs"
                placeholder="Bank ref / receipt no."
              />
            </div>
          </div>
          {paymentMethod === "cheque" && (
            <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-2">
              <div className="space-y-1">
                <Label className="text-xs">Cheque number</Label>
                <Input name="chequeNumber" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cheque date</Label>
                <Input name="chequeDate" type="date" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bank</Label>
                <Input name="bank" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Clearance status</Label>
                <Select name="clearanceStatus" defaultValue="pending" className="h-8 text-xs">
                  <option value="pending">Pending</option>
                  <option value="cleared">Cleared</option>
                  <option value="bounced">Bounced</option>
                </Select>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input name="note" className="h-8 text-xs" />
          </div>
          <SubmitButton
            formAction={recordServiceChargePaymentAction}
            variant="outline"
            size="sm"
            className="h-8 w-full"
            pendingText="Recording..."
          >
            Record payment
          </SubmitButton>
        </form>

        {unit.serviceChargeInvoices.length > 0 && (
          <details className="space-y-1">
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Invoice history ({unit.serviceChargeInvoices.length})
            </summary>
            <div className="divide-y rounded-xl border border-border/60">
              {unit.serviceChargeInvoices.map((invoice, index) => {
                const credit = -moneyValue(invoice.previousBalance);
                return (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs"
                  >
                    <div className="min-w-0">
                      <span>
                        #{invoice.invoiceNumber} · {format(invoice.issueDate, "d MMM yyyy")}
                        {invoice.billedOwner ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {ownerDisplayName(invoice.billedOwner)}
                          </span>
                        ) : null}
                      </span>
                      {credit > 0 ? (
                        <p className="text-muted-foreground">
                          Invoice {formatMoney(invoice.currentAmount)} − Credit{" "}
                          {formatMoney(credit)} ={" "}
                          <span className="font-medium text-foreground">
                            Payable {formatMoney(invoice.amountPayable)}
                          </span>
                        </p>
                      ) : (
                        <p className="font-medium">{formatMoney(invoice.amountPayable)}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={`/api/service-charge-invoices/${invoice.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary hover:underline"
                      >
                        PDF
                      </a>
                      {index === 0 && (
                        <EditInvoiceModal
                          invoice={invoice}
                          unitId={unit.id}
                          fundId={defaultFundId}
                        />
                      )}
                      {unit.owner && (
                        <form>
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <SubmitButton
                            formAction={sendServiceChargeInvoiceAction}
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-xs text-primary"
                            pendingText="Sending..."
                          >
                            <Send className="h-3 w-3" />
                            Send
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
