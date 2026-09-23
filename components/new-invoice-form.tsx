"use client";

import { useEffect, useMemo, useState } from "react";

import { createOwnerInvoiceAction } from "@/app/invoice-actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateInputValue, formatOmrAmount } from "@/lib/finance";
import { INVOICE_KIND_LABEL, type InvoiceKind } from "@/lib/invoice-options";
import { cn, personDisplayName } from "@/lib/utils";

export type InvoiceFormUnit = {
  id: string;
  propertyId: string;
  label: string;
  serviceChargeAmount: string | null;
  collectsServiceCharge: boolean;
  owner: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

export type InvoiceChargeCategory = { id: string; label: string };

type Line = { category: string; description: string; qty: string; rate: string };

function emptyLine(category = ""): Line {
  return { category, description: "", qty: "1", rate: "" };
}

function lineTotal(line: Line): number {
  const qty = Number(line.qty);
  const rate = Number(line.rate);
  if (!Number.isFinite(qty) || !Number.isFinite(rate) || qty <= 0 || rate <= 0) {
    return 0;
  }
  return qty * rate;
}

const brandButton =
  "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90";

export function NewInvoiceForm({
  properties,
  units,
  categories,
  defaultFundId,
  initialPropertyId,
  initialUnitId,
}: {
  properties: { id: string; name: string }[];
  units: InvoiceFormUnit[];
  categories: InvoiceChargeCategory[];
  defaultFundId: string;
  initialPropertyId?: string;
  initialUnitId?: string;
}) {
  const today = new Date();
  const initialUnit = units.find((unit) => unit.id === initialUnitId);
  const [propertyId, setPropertyId] = useState(
    initialUnit?.propertyId ?? initialPropertyId ?? "",
  );
  const [unitId, setUnitId] = useState(initialUnitId ?? "");
  const [kind, setKind] = useState<InvoiceKind>("additional");
  const [issueDate, setIssueDate] = useState(dateInputValue(today));
  const [dueDate, setDueDate] = useState(
    dateInputValue(
      new Date(
        Date.UTC(today.getFullYear(), today.getUTCMonth(), today.getUTCDate() + 10),
      ),
    ),
  );
  const [lines, setLines] = useState<Line[]>([
    emptyLine(categories[0]?.label ?? ""),
  ]);

  const propertyUnits = useMemo(
    () => units.filter((unit) => !propertyId || unit.propertyId === propertyId),
    [units, propertyId],
  );
  const selectedUnit = propertyUnits.find((unit) => unit.id === unitId) ?? null;
  const ownerLabel = selectedUnit?.owner
    ? personDisplayName(selectedUnit.owner)
    : "This unit has no current owner";
  const unitTakesServiceCharge = selectedUnit?.collectsServiceCharge ?? true;
  const invoiceTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  useEffect(() => {
    if (!unitTakesServiceCharge && kind === "service_charge") {
      setKind("additional");
    }
  }, [unitTakesServiceCharge, kind]);

  useEffect(() => {
    if (kind !== "service_charge") return;
    const amount = selectedUnit?.serviceChargeAmount ?? "";
    setLines([
      {
        category: "Service charge",
        description: "Service charge",
        qty: "1",
        rate: amount,
      },
    ]);
  }, [kind, selectedUnit?.id, selectedUnit?.serviceChargeAmount]);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  return (
    <form action={createOwnerInvoiceAction} className="space-y-6">
      <input type="hidden" name="redirectTo" value="/protected/invoices/new" />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="fundId" value={defaultFundId} />

      <section className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold">Who is being billed</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invoices are always against a unit. The owner is whoever currently holds that unit.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="propertyId">Property</Label>
            <Select
              id="propertyId"
              value={propertyId}
              onChange={(event) => {
                setPropertyId(event.target.value);
                setUnitId("");
              }}
            >
              <option value="">Choose…</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unitId">Unit</Label>
            <Select
              id="unitId"
              name="unitId"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
              required
              disabled={!propertyId && !initialUnitId}
            >
              <option value="">Choose…</option>
              {propertyUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                  {unit.owner ? ` · ${personDisplayName(unit.owner)}` : " · no owner"}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <Input value={ownerLabel} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kind">Type</Label>
            <Select
              id="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as InvoiceKind)}
            >
              <option value="additional">{INVOICE_KIND_LABEL.additional}</option>
              {unitTakesServiceCharge ? (
                <option value="service_charge">
                  {INVOICE_KIND_LABEL.service_charge}
                </option>
              ) : null}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issueDate">Issued</Label>
            <Input
              id="issueDate"
              name="issueDate"
              type="date"
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Due</Label>
            <Input
              id="dueDate"
              name="dueDate"
              type="date"
              min={issueDate}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              required
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">What is being charged</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add one line per charge. Amounts are in OMR.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Total{" "}
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatOmrAmount(invoiceTotal)}
            </span>
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="hidden min-w-[40rem] grid-cols-[minmax(10rem,1fr)_minmax(12rem,1.4fr)_5.5rem_7rem_6.5rem_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Charge type</span>
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <div className="mt-2 space-y-2">
            {lines.map((line, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-xl border border-border/70 bg-background p-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1.4fr)_5.5rem_7rem_6.5rem_auto] sm:items-center"
              >
                <Select
                  name="lineCategory"
                  value={line.category}
                  onChange={(event) =>
                    updateLine(index, { category: event.target.value })
                  }
                  aria-label="Charge type"
                >
                  {kind === "service_charge" ? (
                    <option value="Service charge">Service charge</option>
                  ) : null}
                  {categories.map((category) => (
                    <option key={category.id} value={category.label}>
                      {category.label}
                    </option>
                  ))}
                  {categories.length === 0 && kind !== "service_charge" ? (
                    <option value="Additional charge">Additional charge</option>
                  ) : null}
                </Select>
                <Input
                  name="lineDescription"
                  placeholder="Description"
                  value={line.description}
                  onChange={(event) =>
                    updateLine(index, { description: event.target.value })
                  }
                />
                <Input
                  name="lineQty"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={line.qty}
                  onChange={(event) => updateLine(index, { qty: event.target.value })}
                  aria-label="Quantity"
                />
                <Input
                  name="lineRate"
                  type="number"
                  min="0.001"
                  step="0.001"
                  placeholder="0.000"
                  value={line.rate}
                  onChange={(event) => updateLine(index, { rate: event.target.value })}
                  aria-label="Rate"
                />
                <p className="px-1 text-right text-sm font-medium tabular-nums">
                  {formatOmrAmount(lineTotal(line))}
                </p>
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setLines(lines.filter((_, lineIndex) => lineIndex !== index))
                    }
                  >
                    Remove
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </div>

        {kind !== "service_charge" ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full border-primary/30 text-primary hover:bg-primary/10"
            onClick={() =>
              setLines([...lines, emptyLine(categories[0]?.label ?? "Additional charge")])
            }
          >
            + Add line
          </Button>
        ) : null}
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <SubmitButton
          name="intent"
          value="draft"
          variant="outline"
          pendingText="Saving..."
        >
          Save draft
        </SubmitButton>
        <SubmitButton
          name="intent"
          value="issue"
          className={cn(brandButton)}
          pendingText="Issuing..."
        >
          Issue invoice
        </SubmitButton>
      </div>
    </form>
  );
}
