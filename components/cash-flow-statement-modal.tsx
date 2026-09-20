"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateInputValue, monthInputValue } from "@/lib/finance";

/**
 * Spec #22's "Detailed Cash Flow Statement" needs an arbitrary From/To
 * range and a Fund, not just the page's own Property + Year filters — so
 * it gets its own small form rather than reusing the shared filter bar
 * above the expense log. Submitting is a plain GET (no server action): it
 * just opens the PDF route in a new tab with the four params as a query
 * string.
 */
export function CashFlowStatementModal({
  properties,
  funds,
  defaultPropertyId,
  autoOpen = false,
  trigger,
}: {
  properties: { id: string; name: string }[];
  funds: { id: string; label: string }[];
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
  const fundId = funds[0]?.id ?? "";
  const [from, setFrom] = useState(`${monthInputValue()}-01`);
  const [to, setTo] = useState(dateInputValue());

  const canGenerate = Boolean(propertyId && fundId && from && to);

  return (
    <Modal
      title="Detailed Cash Flow Statement"
      description="Actual revenue and expenditure for one property over any date range."
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

        <Button
          type="button"
          className="w-full"
          disabled={!canGenerate}
          onClick={() => {
            const params = new URLSearchParams({
              property: propertyId,
              fund: fundId,
              from,
              to,
            });
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
