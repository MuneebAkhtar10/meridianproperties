"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Building2, Download, Home, User } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateInputValue, formatMoney, monthInputValue } from "@/lib/finance";

export type LandlordStatementOption = {
  tenancyId: string;
  unitLabel: string;
  tenantName: string;
  ownerName: string;
  propertyName: string;
  monthlyRent: number;
};

/**
 * Per-tenancy Landlord Statement — pick the unit, set the period, then
 * download the same figures as PDF or CSV. Independent properties only.
 */
export function RentStatementModal({
  options = [],
  defaultTenancyId,
  trigger,
}: {
  options?: LandlordStatementOption[];
  defaultTenancyId?: string;
  trigger?: ReactNode;
}) {
  const targets = options ?? [];
  const [tenancyId, setTenancyId] = useState(
    defaultTenancyId ?? targets[0]?.tenancyId ?? "",
  );
  const [from, setFrom] = useState(`${monthInputValue()}-01`);
  const [to, setTo] = useState(dateInputValue());

  const selected = useMemo(
    () => targets.find((option) => option.tenancyId === tenancyId) ?? targets[0],
    [targets, tenancyId],
  );

  const canGenerate = Boolean(selected && from && to && from <= to);
  const query = new URLSearchParams({ from, to }).toString();
  const exportPath = selected
    ? `/api/tenancies/${selected.tenancyId}/rent-statement`
    : "";

  return (
    <Modal
      title="Landlord Statement"
      description="Rent collected versus expenses for one unit, over a date range."
      widthClassName="max-w-lg"
      trigger={
        trigger ?? (
          <Button type="button" variant="outline" size="sm">
            Landlord Statement
          </Button>
        )
      }
    >
      {targets.length === 0 || !selected ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No occupied unit with an active tenancy yet. Start a tenancy first,
          then generate the statement.
        </p>
      ) : (
        <div className="space-y-4">
          {targets.length > 1 ? (
            <div className="space-y-1.5">
              <Label htmlFor="landlord-stmt-unit" className="text-xs">
                Unit
              </Label>
              <Select
                id="landlord-stmt-unit"
                value={tenancyId}
                onChange={(event) => setTenancyId(event.target.value)}
              >
                {targets.map((option) => (
                  <option key={option.tenancyId} value={option.tenancyId}>
                    {option.unitLabel} · {option.tenantName}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Statement for
            </p>
            <div className="mt-2.5 grid gap-2.5 text-sm">
              <p className="flex items-start gap-2">
                <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-xs text-muted-foreground">Property</span>
                  {selected.propertyName}
                </span>
              </p>
              <p className="flex items-start gap-2">
                <Home className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-xs text-muted-foreground">Unit</span>
                  <span className="font-semibold">{selected.unitLabel}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatMoney(selected.monthlyRent)} / month
                  </span>
                </span>
              </p>
              <p className="flex items-start gap-2">
                <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-xs text-muted-foreground">
                    Tenant · Owner
                  </span>
                  {selected.tenantName}
                  <span className="text-muted-foreground"> · {selected.ownerName}</span>
                </span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`stmt-from-${selected.tenancyId}`} className="text-xs">
                From
              </Label>
              <Input
                id={`stmt-from-${selected.tenancyId}`}
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`stmt-to-${selected.tenancyId}`} className="text-xs">
                To
              </Label>
              <Input
                id={`stmt-to-${selected.tenancyId}`}
                type="date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            PDF is the printed statement. Excel matches the same boxed layout
            for editing in a spreadsheet.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              disabled={!canGenerate}
              onClick={() => window.open(`${exportPath}/pdf?${query}`, "_blank")}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canGenerate}
              onClick={() => window.open(`${exportPath}/csv?${query}`, "_blank")}
            >
              <Download className="h-4 w-4" />
              Download Excel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
