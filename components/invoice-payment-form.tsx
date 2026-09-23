"use client";

import { useState } from "react";

import { recordServiceChargePaymentAction } from "@/app/service-charge-invoice-actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  dateInputValue,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
} from "@/lib/finance";

export function InvoicePaymentForm({
  unitId,
  fundId,
  invoiceId,
  defaultAmount,
}: {
  unitId: string;
  fundId: string;
  invoiceId: string;
  defaultAmount: string;
}) {
  const [paymentMethod, setPaymentMethod] = useState("");

  return (
    <form className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="fundId" value={fundId} />
      <input type="hidden" name="redirectTo" value={`/protected/invoices/${invoiceId}`} />
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Record payment
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Applied to this unit’s service-charge balance.
      </p>
      <div className="mt-4 grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Amount</Label>
            <Input
              name="amount"
              type="number"
              min="0.001"
              step="0.001"
              defaultValue={defaultAmount}
              className="h-9"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Paid on</Label>
            <Input
              name="paidAt"
              type="date"
              defaultValue={dateInputValue()}
              className="h-9"
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Method</Label>
          <Select
            name="paymentMethod"
            defaultValue=""
            className="h-9"
            onChange={(event) => setPaymentMethod(event.target.value)}
          >
            <option value="">Select…</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABEL[method]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Transaction number</Label>
          <Input name="transactionNumber" className="h-9" placeholder="Bank ref / receipt" />
        </div>
        {paymentMethod === "cheque" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3">
            <Input name="chequeNumber" placeholder="Cheque number" className="h-9" />
            <Input name="chequeDate" type="date" className="h-9" />
            <Input name="bank" placeholder="Bank" className="h-9" />
            <Select name="clearanceStatus" defaultValue="pending" className="h-9">
              <option value="pending">Pending</option>
              <option value="cleared">Cleared</option>
              <option value="bounced">Bounced</option>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Input name="note" className="h-9" />
        </div>
        <SubmitButton
          formAction={recordServiceChargePaymentAction}
          className="mt-1 w-full"
          size="sm"
          pendingText="Recording..."
        >
          Record payment
        </SubmitButton>
      </div>
    </form>
  );
}
