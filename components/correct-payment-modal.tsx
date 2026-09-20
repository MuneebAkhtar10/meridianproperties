"use client";

import { Pencil } from "lucide-react";

import { correctServiceChargePaymentAction } from "@/app/service-charge-invoice-actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Correct Invoice" — fixes a payment recorded with the wrong amount (a
 * typo like 3500 instead of 350) after the fact. Requires a note
 * explaining the correction, and the ledger keeps the original amount on
 * file — see correctServiceChargePaymentAction.
 */
export function CorrectPaymentModal({
  paymentId,
  currentAmount,
}: {
  paymentId: string;
  currentAmount: number;
}) {
  return (
    <Modal
      title="Correct payment"
      description="Fix a payment recorded with the wrong amount. The original amount stays on file."
      widthClassName="max-w-md"
      overlayZClassName="z-[70]"
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
          Correct
        </button>
      }
    >
      <form className="space-y-3">
        <input type="hidden" name="paymentId" value={paymentId} />
        <div className="space-y-1.5">
          <Label htmlFor={`correct-amount-${paymentId}`} className="text-xs">
            Corrected amount (OMR)
          </Label>
          <Input
            id={`correct-amount-${paymentId}`}
            name="amount"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue={currentAmount.toFixed(3)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`correct-note-${paymentId}`} className="text-xs">
            Why is this being corrected?
          </Label>
          <Textarea
            id={`correct-note-${paymentId}`}
            name="correctionNote"
            placeholder="e.g. Typed 3500 instead of 350 by mistake"
            className="min-h-16 text-sm"
            required
          />
        </div>
        <SubmitButton
          formAction={correctServiceChargePaymentAction}
          className="w-full"
          pendingText="Saving..."
        >
          Save correction
        </SubmitButton>
      </form>
    </Modal>
  );
}
