"use client";

import { Pencil } from "lucide-react";

import { updateExpenseAction } from "@/app/expense-actions";
import {
  ExpenseCategoryPicker,
  type PickableExpenseCategory,
  type PickableSupplier,
} from "@/components/expense-category-picker";
import { SubmitButton } from "@/components/submit-button";
import { CloseModalOnSubmit, Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UploadFileInput } from "@/components/upload-file-input";
import { dateInputValue } from "@/lib/finance";

export function ExpenseEditModal({
  expense,
  categories,
  suppliers,
  funds,
  targetLabel,
}: {
  expense: {
    id: string;
    categoryId: string;
    subcategory: string | null;
    supplierId: string | null;
    propertyId: string | null;
    description: string;
    amount: number;
    vatAmount: number;
    fundId: string;
    paymentReference: string | null;
    paidBy: string;
    notes: string | null;
    date: Date;
    receiptFileName: string | null;
  };
  categories: PickableExpenseCategory[];
  suppliers: PickableSupplier[];
  funds: { id: string; label: string }[];
  /** Read-only context shown above the form — the property/unit this
   * expense is logged against isn't editable here. */
  targetLabel: string;
}) {
  return (
    <Modal
      title="Edit expense"
      widthClassName="max-w-md"
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      }
    >
      <form className="space-y-3" encType="multipart/form-data">
        <input type="hidden" name="expenseId" value={expense.id} />
        <CloseModalOnSubmit />

        <p className="text-xs text-muted-foreground">
          Against <span className="font-medium text-foreground">{targetLabel}</span>
        </p>

        <ExpenseCategoryPicker
          categories={categories}
          suppliers={suppliers}
          propertyId={expense.propertyId ?? undefined}
          defaultCategoryId={expense.categoryId}
          defaultSubcategory={expense.subcategory ?? undefined}
          defaultSupplierId={expense.supplierId ?? undefined}
          idPrefix={`expense-edit-${expense.id}`}
        />

        <div className="space-y-1.5">
          <Label htmlFor={`expense-edit-${expense.id}-description`} className="text-xs">
            Description
          </Label>
          <Textarea
            id={`expense-edit-${expense.id}-description`}
            name="description"
            defaultValue={expense.description}
            className="min-h-16 text-sm"
            required
          />
        </div>

        <div className="grid grid-cols-[1fr_1.2fr] gap-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`expense-edit-${expense.id}-amount`} className="text-xs">
              Amount (OMR)
            </Label>
            <Input
              id={`expense-edit-${expense.id}-amount`}
              name="amount"
              type="number"
              min="0.001"
              step="0.001"
              defaultValue={expense.amount}
              required
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`expense-edit-${expense.id}-date`} className="text-xs">
              Date
            </Label>
            <Input
              id={`expense-edit-${expense.id}-date`}
              name="date"
              type="date"
              className="px-2"
              defaultValue={dateInputValue(expense.date)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-[1.2fr_1fr] gap-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`expense-edit-${expense.id}-fund`} className="text-xs">
              Fund
            </Label>
            <Select
              id={`expense-edit-${expense.id}-fund`}
              name="fundId"
              defaultValue={expense.fundId}
              required
            >
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`expense-edit-${expense.id}-vat`} className="text-xs">
              VAT (OMR)
            </Label>
            <Input
              id={`expense-edit-${expense.id}-vat`}
              name="vatAmount"
              type="number"
              min="0"
              step="0.001"
              defaultValue={expense.vatAmount || undefined}
              placeholder="0.000"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`expense-edit-${expense.id}-paid-by`} className="text-xs">
              Paid by
            </Label>
            <Select
              id={`expense-edit-${expense.id}-paid-by`}
              name="paidBy"
              defaultValue={expense.paidBy}
            >
              <option value="management">Management company</option>
              <option value="owner">Property owner directly</option>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label
              htmlFor={`expense-edit-${expense.id}-payment-reference`}
              className="text-xs"
            >
              Payment reference
            </Label>
            <Input
              id={`expense-edit-${expense.id}-payment-reference`}
              name="paymentReference"
              defaultValue={expense.paymentReference ?? ""}
              placeholder="Bank transfer / cheque ref."
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`expense-edit-${expense.id}-notes`} className="text-xs">
            Notes
          </Label>
          <Textarea
            id={`expense-edit-${expense.id}-notes`}
            name="notes"
            defaultValue={expense.notes ?? ""}
            placeholder="Optional internal notes"
            className="min-h-12 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`expense-edit-${expense.id}-receipt`} className="text-xs">
            {expense.receiptFileName
              ? `Replace receipt (current: ${expense.receiptFileName})`
              : "Supplier invoice / receipt"}
          </Label>
          <UploadFileInput
            id={`expense-edit-${expense.id}-receipt`}
            name="receipt"
            hint=""
          />
        </div>

        <SubmitButton
          formAction={updateExpenseAction}
          className="w-full"
          pendingText="Saving..."
        >
          Save changes
        </SubmitButton>
      </form>
    </Modal>
  );
}
