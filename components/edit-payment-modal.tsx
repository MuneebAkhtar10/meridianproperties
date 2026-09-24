"use client";

import { Pencil } from "lucide-react";

import { updatePaymentAction } from "@/app/finance-actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CloseModalOnSubmit, Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "oman_net", label: "OmanNet / card receipt" },
  { value: "mobile_payment", label: "Mobile payment" },
  { value: "direct_debit", label: "Direct debit" },
  { value: "cheque", label: "Cheque (incl. post-dated)" },
  { value: "other", label: "Other" },
];

export type EditablePayment = {
  id: string;
  amount: string;
  paidAt: string;
  method: string;
  reference: string;
  notes: string;
  collectedBy: string;
  receivedByName: string;
  transactionNumber: string;
  chequeNumber: string;
  chequeDate: string;
  bank: string;
};

/**
 * Corrects a payment that was already approved — wrong amount, date,
 * method or reference entered by mistake. The charge's paid/open status is
 * recalculated from the corrected figures, and the edit is stamped on the
 * payment's review note so there is a trail of who changed it and when.
 */
export function EditPaymentModal({
  payment,
  back,
  chargeAmount,
}: {
  payment: EditablePayment;
  back: string;
  /** The charge's total, so the admin can see the ceiling for this payment. */
  chargeAmount: string;
}) {
  const id = payment.id;
  return (
    <Modal
      title="Edit payment"
      description={`Correct the details of this approved payment (the amount is fixed). The charge total is ${chargeAmount}.`}
      trigger={
        <Button type="button" variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5" />
          Edit payment
        </Button>
      }
    >
      <form className="space-y-4">
        <input type="hidden" name="paymentId" value={id} />
        <input type="hidden" name="back" value={back} />

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`ep-amount-${id}`} className="text-xs">Amount (OMR)</Label>
            <Input
              id={`ep-amount-${id}`}
              name="amount"
              type="number"
              defaultValue={payment.amount}
              readOnly
              className="cursor-not-allowed bg-slate-100 text-slate-600"
            />
            <p className="text-[11px] text-muted-foreground">
              The amount can&rsquo;t be changed after approval.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ep-paid-${id}`} className="text-xs">Payment date</Label>
            <Input
              id={`ep-paid-${id}`}
              name="paidAt"
              type="date"
              defaultValue={payment.paidAt}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ep-method-${id}`} className="text-xs">Method</Label>
            <Select id={`ep-method-${id}`} name="method" defaultValue={payment.method}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`ep-ref-${id}`} className="text-xs">Reference</Label>
            <Input id={`ep-ref-${id}`} name="reference" defaultValue={payment.reference} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ep-txn-${id}`} className="text-xs">Transaction number</Label>
            <Input
              id={`ep-txn-${id}`}
              name="transactionNumber"
              defaultValue={payment.transactionNumber}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ep-collected-${id}`} className="text-xs">Collected by</Label>
            <Select
              id={`ep-collected-${id}`}
              name="collectedBy"
              defaultValue={payment.collectedBy}
            >
              <option value="management">Management company</option>
              <option value="owner">Property owner directly</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ep-recv-${id}`} className="text-xs">Received by</Label>
            <Input
              id={`ep-recv-${id}`}
              name="receivedByName"
              defaultValue={payment.receivedByName}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Cheque details (only if paid by cheque)
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`ep-chq-${id}`} className="text-xs">Cheque number</Label>
              <Input id={`ep-chq-${id}`} name="chequeNumber" defaultValue={payment.chequeNumber} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ep-chqd-${id}`} className="text-xs">Cheque date</Label>
              <Input
                id={`ep-chqd-${id}`}
                name="chequeDate"
                type="date"
                defaultValue={payment.chequeDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ep-bank-${id}`} className="text-xs">Bank</Label>
              <Input id={`ep-bank-${id}`} name="bank" defaultValue={payment.bank} />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`ep-notes-${id}`} className="text-xs">Notes</Label>
          <Textarea id={`ep-notes-${id}`} name="notes" rows={2} defaultValue={payment.notes} />
        </div>

        <SubmitButton formAction={updatePaymentAction} className="w-full" pendingText="Saving...">
          Save changes
        </SubmitButton>
        <CloseModalOnSubmit />
      </form>
    </Modal>
  );
}
