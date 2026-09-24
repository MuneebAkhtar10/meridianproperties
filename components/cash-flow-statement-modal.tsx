"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateInputValue } from "@/lib/finance";

function startOfYearInput(): string {
  return `${new Date().getFullYear()}-01-01`;
}

/**
 * Detailed cash flow for one property over a From/To range. Fund tagging
 * lives on the annual budget only — this statement covers the whole
 * property. Submitting is a plain GET that opens the PDF in a new tab.
 */
export function CashFlowStatementModal({
  properties,
  defaultPropertyId,
  autoOpen = false,
  trigger,
}: {
  properties: { id: string; name: string }[];
  /** Preselects a property — set when this modal is opened from that
   * property's own "Cash Flow" quick-link instead of the plain Expenses
   * page. */
  defaultPropertyId?: string;
  /** Opens the modal immediately, for the same deep-link case. */
  autoOpen?: boolean;
  /** Overrides the default trigger button — e.g. to match a property
   * page's own toolbar styling instead of the plain Expenses page's. */
  trigger?: React.ReactNode;
}) {
  const [propertyId, setPropertyId] = useState(
    defaultPropertyId ?? properties[0]?.id ?? "",
  );
  const [from, setFrom] = useState(startOfYearInput);
  const [to, setTo] = useState(dateInputValue);

  const canGenerate = Boolean(propertyId && from && to);

  // The opening balance is calculated from the property's history; the
  // field starts on that figure and can be overtyped.
  const [autoOpening, setAutoOpening] = useState<number | null>(null);
  const [openingInput, setOpeningInput] = useState("");
  const [loadingOpening, setLoadingOpening] = useState(false);

  useEffect(() => {
    if (!propertyId || !from || !to) return;
    const controller = new AbortController();
    setLoadingOpening(true);
    fetch(
      `/api/expenses/cash-flow-statement?${new URLSearchParams({ property: propertyId, from, to, preview: "1" })}`,
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { openingBalance?: number } | null) => {
        if (data && typeof data.openingBalance === "number") {
          setAutoOpening(data.openingBalance);
          setOpeningInput(data.openingBalance.toFixed(3));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingOpening(false));
    return () => controller.abort();
  }, [propertyId, from, to]);

  const openingModified =
    autoOpening !== null &&
    openingInput.trim() !== "" &&
    Number.isFinite(Number(openingInput)) &&
    Math.abs(Number(openingInput) - autoOpening) > 0.0005;

  return (
    <Modal
      title="Detailed Cash Flow Statement"
      description="Actual service-charge revenue and expenditure for one property over any date range."
      trigger={
        trigger ?? (
          <Button type="button" variant="outline">
            <ScrollText className="h-4 w-4" />
            Cash Flow Statement
          </Button>
        )
      }
      defaultOpen={autoOpen}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="cash-flow-property" className="text-xs">
            Property
          </Label>
          <Select
            id="cash-flow-property"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="cash-flow-from" className="text-xs">
              From
            </Label>
            <Input
              id="cash-flow-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-2"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cash-flow-to" className="text-xs">
              To
            </Label>
            <Input
              id="cash-flow-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-2"
            />
          </div>
        </div>

        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="cash-flow-opening" className="text-xs">
              Opening balance (OMR)
            </Label>
            {openingModified ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-300">
                Modified
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Automatic
              </span>
            )}
          </div>
          <Input
            id="cash-flow-opening"
            type="number"
            step="0.001"
            value={openingInput}
            onChange={(e) => setOpeningInput(e.target.value)}
            placeholder={loadingOpening ? "Calculating…" : "0.000"}
            disabled={autoOpening === null}
          />
          <p className="text-[11px] text-muted-foreground">
            {autoOpening !== null
              ? `Calculated from earlier invoices and expenses: OMR ${autoOpening.toFixed(3)}. Type a negative number for a deficit.`
              : "Calculating from earlier invoices and expenses…"}
            {openingModified && (
              <>
                {" "}
                <button
                  type="button"
                  className="font-medium text-primary underline"
                  onClick={() => setOpeningInput((autoOpening ?? 0).toFixed(3))}
                >
                  Reset to automatic
                </button>
              </>
            )}
          </p>
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={!canGenerate}
          onClick={() => {
            const params = new URLSearchParams({
              property: propertyId,
              from,
              to,
            });
            if (openingModified) params.set("opening", String(Number(openingInput)));
            window.open(
              `/api/expenses/cash-flow-statement?${params}`,
              "_blank",
            );
          }}
        >
          Generate PDF
        </Button>
      </div>
    </Modal>
  );
}
