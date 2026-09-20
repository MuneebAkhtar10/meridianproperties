import { createExpenseAction } from "@/app/expense-actions";
import {
  ExpenseLogFields,
  type ExpenseLogFieldsProps,
} from "@/components/expense-log-fields";
import { SubmitButton } from "@/components/submit-button";
import { UploadFileInput } from "@/components/upload-file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dateInputValue } from "@/lib/finance";

/**
 * The "Log an expense" form — shared between the standalone Expenses page
 * (wrapped in its own sidebar card) and a property page's "Add an expense"
 * modal (wrapped in a Modal instead), so the two never drift apart. `back`
 * controls where createExpenseAction redirects to afterwards — the
 * Expenses page itself, or the property page that opened the modal.
 */
export function LogExpenseForm({
  properties,
  units,
  categories,
  suppliers,
  defaultPropertyId,
  funds,
  back,
}: ExpenseLogFieldsProps & {
  funds: { id: string; label: string }[];
  back: string;
}) {
  return (
    <form className="space-y-5" encType="multipart/form-data">
      <input type="hidden" name="back" value={back} />
      <div className="space-y-3">
        <ExpenseLogFields
          properties={properties}
          units={units}
          categories={categories}
          defaultPropertyId={defaultPropertyId}
          suppliers={suppliers}
        />

        <div className="space-y-1.5">
          <Label htmlFor="expense-description" className="text-xs">
            Description
          </Label>
          <Textarea
            id="expense-description"
            name="description"
            placeholder="What was this for?"
            className="min-h-16 text-sm"
            required
          />
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Amount &amp; accounting
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="expense-amount" className="text-xs">
              Amount (OMR)
            </Label>
            <Input
              id="expense-amount"
              name="amount"
              type="number"
              min="0.001"
              step="0.001"
              required
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="expense-date" className="text-xs">
              Date
            </Label>
            <Input
              id="expense-date"
              name="date"
              type="date"
              className="px-2"
              defaultValue={dateInputValue()}
              required
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="expense-vat" className="text-xs">
              VAT (OMR)
            </Label>
            <Input
              id="expense-vat"
              name="vatAmount"
              type="number"
              min="0"
              step="0.001"
              placeholder="0.000"
            />
          </div>
        </div>
        <input type="hidden" name="fundId" value={funds[0]?.id ?? ""} />
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Paper trail
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="expense-paid-by" className="text-xs">
              Paid by
            </Label>
            <Select id="expense-paid-by" name="paidBy" defaultValue="management">
              <option value="management">Management company</option>
              <option value="owner">Property owner directly</option>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="expense-payment-reference" className="text-xs">
              Payment reference
            </Label>
            <Input
              id="expense-payment-reference"
              name="paymentReference"
              placeholder="Bank transfer / cheque ref."
            />
          </div>
          <div className="col-span-2 min-w-0 space-y-1.5">
            <Label htmlFor="expense-receipt" className="text-xs">
              Supplier invoice / receipt
            </Label>
            <UploadFileInput id="expense-receipt" name="receipt" hint="" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expense-notes" className="text-xs">
            Notes
          </Label>
          <Textarea
            id="expense-notes"
            name="notes"
            placeholder="Optional internal notes"
            className="min-h-12 text-sm"
          />
        </div>
      </div>

      <SubmitButton
        formAction={createExpenseAction}
        className="w-full"
        pendingText="Saving..."
      >
        Log expense
      </SubmitButton>
    </form>
  );
}
