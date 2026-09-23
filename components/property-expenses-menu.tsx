"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Banknote, ExternalLink, List, Plus, Receipt } from "lucide-react";

import { LogExpenseForm } from "@/components/log-expense-form";
import type { ExpenseLogFieldsProps } from "@/components/expense-log-fields";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PendingLink } from "@/components/ui/pending-link";
import { Tooltip } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/finance";
import { cn } from "@/lib/utils";

/** A colored badge behind a toolbar button's icon — matches the property
 * page's own ToolbarIcon so this menu's trigger fits its row exactly. */
function ToolbarIcon({
  icon: Icon,
  className,
}: {
  icon: typeof Banknote;
  className: string;
}) {
  return (
    <span className={`flex items-center justify-center rounded-md p-1 ${className}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

export type PropertyExpenseRow = {
  id: string;
  date: Date;
  description: string;
  amount: string;
  categoryLabel: string;
  paidBy: string;
};

/**
 * The property page's "Expenses" toolbar button — instead of navigating to
 * the portfolio-wide Expenses page, it opens a small menu offering "Add an
 * expense" (a modal with the same Log an expense form, scoped to this
 * property) or "View all expenses" (a modal listing just this property's
 * expenses), or Building expenses (the same records grouped by unit) —
 * an admin never leaves the property they're looking at.
 *
 * Each menu item is itself a Modal's own trigger (see
 * components/ui/modal.tsx), so both Modals stay mounted at all times —
 * only the dropdown *panel* around them toggles via a CSS class. Unmounting
 * the Modals when the dropdown closes (e.g. conditionally rendering them
 * with `{menuOpen && ...}`) would tear them down the instant a menu item
 * is clicked, before the click even finishes bubbling up to open one —
 * so neither Modal would ever actually appear.
 */
export function PropertyExpensesMenu({
  propertyId,
  propertyName,
  back,
  expenseFields,
  funds,
  expenses,
}: {
  propertyId: string;
  propertyName: string;
  back: string;
  expenseFields: ExpenseLogFieldsProps;
  funds: { id: string; label: string }[];
  expenses: PropertyExpenseRow[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative">
      <Tooltip label="All spending on this property. Add an expense or view the full list (building-wide and unit-tagged). Building expenses is that list grouped by unit — common-area bills stay in the full list only.">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-background"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ToolbarIcon icon={Banknote} className="bg-rose-100 text-rose-600" />
          Expenses
        </Button>
      </Tooltip>

      {menuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
      )}
      <div
        className={cn(
          "absolute left-0 z-50 mt-1.5 w-64 space-y-1 rounded-lg border border-border/60 bg-card p-1.5 shadow-lg",
          menuOpen ? "block" : "hidden",
        )}
      >
        <Modal
          title="Add an expense"
          description={propertyName}
          widthClassName="max-w-2xl"
          trigger={
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
              Add an expense
            </button>
          }
        >
          <LogExpenseForm
            properties={expenseFields.properties}
            units={expenseFields.units}
            categories={expenseFields.categories}
            suppliers={expenseFields.suppliers}
            funds={funds}
            back={back}
          />
        </Modal>

        <Modal
          title="All expenses"
          description={propertyName}
          widthClassName="max-w-2xl"
          trigger={
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
            >
              <List className="h-4 w-4 text-muted-foreground" />
              View all expenses
            </button>
          }
        >
          {expenses.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
              No expenses logged against this property yet.
            </p>
          ) : (
            <div className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border">
              {expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {expense.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(expense.date, "d MMM yyyy")} ·{" "}
                      {expense.categoryLabel} ·{" "}
                      {expense.paidBy === "owner"
                        ? "Paid by owner"
                        : "Paid by management"}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium">
                    {formatMoney(expense.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <a
            href={`/protected/expenses?property=${propertyId}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open in the full Expenses page
            <ExternalLink className="h-3 w-3" />
          </a>
        </Modal>

        <PendingLink
          href={`/protected/properties/${propertyId}/building-expenses`}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
          onClick={() => setMenuOpen(false)}
        >
          <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block">Building expenses</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              Unit-tagged costs, grouped by unit
            </span>
          </span>
        </PendingLink>
      </div>
    </div>
  );
}
