"use client";

import { useState } from "react";
import { Download, ScrollText } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateInputValue, monthInputValue } from "@/lib/finance";

/**
 * Per-tenancy Unit Rent Statement — Building/Owner info, Resident/Tenant
 * info, month-by-month rent collection, expenses, and the resulting
 * balance, for any date range. Only shown for property types that bill
 * individual tenant rent — see isUnitRentStatementType.
 */
export function RentStatementModal({ tenancyId }: { tenancyId: string }) {
  const [from, setFrom] = useState(`${monthInputValue()}-01`);
  const [to, setTo] = useState(dateInputValue());

  const canGenerate = Boolean(from && to);
  const query = new URLSearchParams({ from, to }).toString();

  return (
    <Modal
      title="Unit Rent Statement"
      description="Rent collected vs. expenses for this tenancy, over any date range."
      trigger={
        <Button type="button" variant="outline" size="sm">
          <ScrollText className="h-3.5 w-3.5" />
          Rent Statement
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`stmt-from-${tenancyId}`} className="text-xs">
              From
            </Label>
            <Input
              id={`stmt-from-${tenancyId}`}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-2"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`stmt-to-${tenancyId}`} className="text-xs">
              To
            </Label>
            <Input
              id={`stmt-to-${tenancyId}`}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canGenerate}
            onClick={() =>
              window.open(
                `/api/tenancies/${tenancyId}/rent-statement/pdf?${query}`,
                "_blank",
              )
            }
          >
            <Download className="h-4 w-4" />
            PDF
          </Button>
          <Button
            type="button"
            disabled={!canGenerate}
            onClick={() =>
              window.open(
                `/api/tenancies/${tenancyId}/rent-statement/csv?${query}`,
                "_blank",
              )
            }
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>
    </Modal>
  );
}
