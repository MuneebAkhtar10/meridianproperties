"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FilePlus2, ListChecks } from "lucide-react";

import { createOwnerInvoiceAction } from "@/app/invoice-actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { dateInputValue, formatOmrAmount } from "@/lib/finance";
import { cn } from "@/lib/utils";

export type GenerateInvoiceUnit = {
  id: string;
  label: string;
  ownerName: string | null;
};

/** An expense not yet billed on any invoice, linked to one or more units. */
export type BillableExpense = {
  id: string;
  unitIds: string[];
  date: string;
  category: string;
  description: string;
  /** amount + VAT, before splitting across its units. */
  total: number;
};

type Line = { category: string; description: string; qty: string; rate: string };

const emptyLine = (category: string): Line => ({
  category,
  description: "",
  qty: "1",
  rate: "",
});

function lineTotal(line: Line): number {
  const qty = Number(line.qty);
  const rate = Number(line.rate);
  return Number.isFinite(qty) && Number.isFinite(rate) && qty > 0 && rate > 0
    ? qty * rate
    : 0;
}

/**
 * "Generate invoice" for a property: one modal, two ways to build the same
 * invoice — bill expenses that already exist, or type new charges (which are
 * also recorded as expenses so the Expenses section stays in step). Either
 * way the result is a normal invoice in the single Invoices section.
 */
export function GenerateInvoiceModal({
  propertyId,
  units,
  expenses,
  categories,
  defaultFundId,
  trigger,
}: {
  propertyId: string;
  units: GenerateInvoiceUnit[];
  expenses: BillableExpense[];
  categories: string[];
  defaultFundId: string;
  trigger: ReactNode;
}) {
  const today = new Date();
  const [mode, setMode] = useState<"expenses" | "new">("expenses");
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(dateInputValue(today));
  const [dueDate, setDueDate] = useState(
    dateInputValue(new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000)),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<Line[]>([emptyLine(categories[0] ?? "")]);

  const unit = units.find((u) => u.id === unitId);
  const unitExpenses = useMemo(
    () => expenses.filter((e) => e.unitIds.includes(unitId)),
    [expenses, unitId],
  );
  const shareOf = (e: BillableExpense) => e.total / Math.max(1, e.unitIds.length);
  const expensesTotal = unitExpenses
    .filter((e) => selected.has(e.id))
    .reduce((sum, e) => sum + shareOf(e), 0);
  const linesTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const total = mode === "expenses" ? expensesTotal : linesTotal;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );

  const tabs = [
    { key: "expenses" as const, label: "From existing expenses", icon: ListChecks },
    { key: "new" as const, label: "Create new expenses", icon: FilePlus2 },
  ];

  return (
    <Modal
      title="New invoice"
      description="Bill a unit for its expenses. Choose an existing expense, or add new charges — new ones are also recorded in Expenses."
      widthClassName="max-w-3xl"
      trigger={trigger}
    >
      <form action={createOwnerInvoiceAction} className="space-y-5">
        <input type="hidden" name="redirectTo" value={`/protected/properties/${propertyId}`} />
        <input type="hidden" name="kind" value="additional" />
        <input type="hidden" name="fundId" value={defaultFundId} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="intent" value="issue" />

        <div className="grid grid-cols-1 gap-2 rounded-xl bg-slate-100 p-1 sm:grid-cols-2">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                mode === key
                  ? "bg-white text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-white/60",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Who is being billed</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gi-unit" className="text-xs">Unit</Label>
              <Select
                id="gi-unit"
                name="unitId"
                value={unitId}
                onChange={(e) => {
                  setUnitId(e.target.value);
                  setSelected(new Set());
                }}
                required
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Owner</Label>
              <Input
                value={unit?.ownerName ?? "This unit has no current owner"}
                disabled
                readOnly
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gi-issue" className="text-xs">Issued</Label>
              <Input
                id="gi-issue"
                name="issueDate"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gi-due" className="text-xs">Due</Label>
              <Input
                id="gi-due"
                name="dueDate"
                type="date"
                min={issueDate}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">
                {mode === "expenses" ? "Choose expenses to bill" : "What is being charged"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {mode === "expenses"
                  ? "Only expenses on this unit that haven't been billed yet are listed."
                  : "Add one line per charge. Each line is also saved as an expense."}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Total{" "}
              <span className="text-base font-semibold tabular-nums text-foreground">
                {formatOmrAmount(total)}
              </span>
            </p>
          </div>

          {mode === "expenses" ? (
            unitExpenses.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No unbilled expenses for this unit. Switch to “Create new expenses” to add charges.
              </p>
            ) : (
              <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                {unitExpenses.map((e) => (
                  <label
                    key={e.id}
                    className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      name="expenseId"
                      value={e.id}
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      className="mt-1 h-4 w-4 rounded border-input"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{e.description}</span>
                      <span className="block text-xs text-muted-foreground">
                        {e.category} · {e.date}
                        {e.unitIds.length > 1 ? ` · your share of ${e.unitIds.length} units` : ""}
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatOmrAmount(shareOf(e))}
                    </span>
                  </label>
                ))}
              </div>
            )
          ) : (
            <>
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-xl border border-border/70 bg-background p-2 sm:grid-cols-[minmax(8rem,1fr)_minmax(9rem,1.3fr)_4.5rem_6rem_5.5rem_auto] sm:items-center"
                  >
                    <Select
                      name="lineCategory"
                      value={line.category}
                      onChange={(e) => updateLine(index, { category: e.target.value })}
                      aria-label="Charge type"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                    <Input
                      name="lineDescription"
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                    />
                    <Input
                      name="lineQty"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.qty}
                      onChange={(e) => updateLine(index, { qty: e.target.value })}
                      aria-label="Quantity"
                    />
                    <Input
                      name="lineRate"
                      type="number"
                      min="0.001"
                      step="0.001"
                      placeholder="0.000"
                      value={line.rate}
                      onChange={(e) => updateLine(index, { rate: e.target.value })}
                      aria-label="Rate"
                    />
                    <p className="px-1 text-right text-sm font-medium tabular-nums">
                      {formatOmrAmount(lineTotal(line))}
                    </p>
                    {lines.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setLines(lines.filter((_, i) => i !== index))}
                      >
                        Remove
                      </Button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setLines([...lines, emptyLine(categories[0] ?? "")])}
              >
                + Add line
              </Button>
            </>
          )}
        </section>

        <div className="flex justify-end">
          <SubmitButton
            className="bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
            pendingText="Issuing..."
          >
            Issue invoice
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
