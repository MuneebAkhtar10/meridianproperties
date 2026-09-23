"use client";

import { useState } from "react";
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
