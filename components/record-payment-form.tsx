"use client";

import { useState } from "react";

import { submitPaymentAction } from "@/app/finance-actions";
import { SubmitButton } from "@/components/submit-button";
import { UploadFileInput } from "@/components/upload-file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  dateInputValue,
  formatMoney,
} from "@/lib/finance";

/**
 * Spec #29 "Rent Collection" / #30 "Payment Method" — extracted from the
 * inline form that used to live directly in
 * app/protected/finances/[id]/page.tsx so the cheque-detail fields can
 * conditionally appear via useState, same pattern already proven in
 * components/unit-manage-modal.tsx's Record Payment section on the OA
 * side of the app.
 */
export function RecordPaymentForm({
  chargeId,
  availableToSubmit,
  pending,
  canManagePayments,
  receiptRequired,
}: {
  chargeId: string;
  availableToSubmit: number;
  pending: number;
  canManagePayments: boolean;
  /** True for a plain tenant submitting their own proof of payment. */
  receiptRequired: boolean;
}) {
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");

  return (
    <form className="space-y-4" encType="multipart/form-data">
      <input type="hidden" name="chargeId" value={chargeId} />
      <Field label="Amount (OMR)">
        <Input
          name="amount"
          type="number"
          min="0.001"
          max={availableToSubmit}
          step="0.001"
          defaultValue={availableToSubmit.toFixed(3)}
          required
        />
      </Field>
      <Field label="Paid on">
        <Input
          name="paidAt"
          type="date"
          defaultValue={dateInputValue()}
          required
        />
      </Field>
      <Field label="Payment method">
        <Select
          name="method"
          defaultValue={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABEL[method]}
            </option>
          ))}
        </Select>
      </Field>

      {canManagePayments && (
        <div className="space-y-3 rounded-lg border p-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Who received this
          </p>
          <Field label="Collected by">
            <Select name="collectedBy" defaultValue="management">
              <option value="management">Management company</option>
              <option value="owner">Property owner directly</option>
            </Select>
          </Field>
          <Field label="Received by">
            <Input name="receivedByName" placeholder="Person's name" />
          </Field>
        </div>
      )}

      <Field label="Reference / transaction ID">
        <Input name="reference" placeholder="Optional" />
      </Field>

      {canManagePayments && (
        <Field label="Transaction number">
          <Input
            name="transactionNumber"
            placeholder="Bank ref / receipt no."
          />
        </Field>
      )}

      {canManagePayments && paymentMethod === "cheque" && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-2.5">
          <Field label="Cheque number">
            <Input name="chequeNumber" />
          </Field>
          <Field label="Cheque date">
            <Input name="chequeDate" type="date" />
          </Field>
          <Field label="Bank">
            <Input name="bank" />
          </Field>
          <Field label="Clearance status">
            <Select name="clearanceStatus" defaultValue="pending">
              <option value="pending">Pending</option>
              <option value="cleared">Cleared</option>
              <option value="bounced">Bounced</option>
            </Select>
          </Field>
        </div>
      )}

      <Field
        label={canManagePayments ? "Receipt (optional)" : "Receipt / screenshot *"}
      >
        <UploadFileInput name="receipt" required={receiptRequired} />
      </Field>
      <Field label="Notes">
        <Textarea name="notes" className="min-h-16" />
      </Field>
      <SubmitButton
        formAction={submitPaymentAction}
        className="w-full"
        pendingText="Submitting..."
      >
        {canManagePayments ? "Record as approved" : "Send proof for review"}
      </SubmitButton>
      {pending > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatMoney(pending)} is already waiting for review.
        </p>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
