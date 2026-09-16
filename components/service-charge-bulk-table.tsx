"use client";

import { useMemo, useRef, useState } from "react";
import { Mail } from "lucide-react";

import { sendBulkServiceChargeEmailAction } from "@/app/service-charge-bulk-actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UnitManageModal, type ManagedUnit } from "@/components/unit-manage-modal";
import { cn } from "@/lib/utils";
import type { ServiceChargeTone } from "@/lib/service-charge-status";

export type ServiceChargeRow = {
  id: string;
  ownerId: string | null;
  ownerLabel: string;
  propertyName: string;
  unitLabel: string;
  amount: string | null;
  cycleMonths: number | null;
  dueDate: string | null;
  balanceLabel: string;
  balanceTone: "credit" | "owed" | "none";
  tone: ServiceChargeTone;
  lastInvoice: { id: string; number: string; date: string } | null;
  invoiceCount: number;
  /** Full unit shape so the same "Manage" modal used on the property page
   * — record payment, generate invoice, payment plan, full invoice history
   * — also works right here, instead of only from the unit's own property. */
  managedUnit: ManagedUnit;
  unitNoun: string;
  unitNounCap: string;
  hasFloors: boolean;
  hasBedrooms: boolean;
};

const TONE_BADGE: Record<ServiceChargeTone, { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "bg-red-50 text-red-700" },
  dueSoon: { label: "Due soon", className: "bg-amber-50 text-amber-700" },
  ok: { label: "Up to date", className: "bg-teal-50 text-teal-700" },
  none: { label: "No charge", className: "bg-slate-100 text-slate-600" },
};

/**
 * The units table plus its checkbox multi-select and "compose email" bar —
 * client-side because selection state and the reveal-on-select compose
 * panel need interactivity. Mirrors the useState<Set<string>> checkbox
 * pattern from components/expense-target-picker.tsx, the only other
 * multi-select in the app. Everything lives inside one <form> so the
 * checked unit ids ride along with the subject/message on submit — no
 * client-side fetch needed.
 */
export function ServiceChargeBulkTable({
  rows,
  owners,
  availableTenants,
  funds,
}: {
  rows: ServiceChargeRow[];
  owners: { id: string; email: string }[];
  availableTenants: { id: string; email: string }[];
  funds: { id: string; label: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const selectableRows = useMemo(() => rows.filter((r) => r.ownerId), [rows]);
  const selectedOwnerCount = useMemo(() => {
    const ownerIds = new Set(
      rows
        .filter((r) => selected.has(r.id) && r.ownerId)
        .map((r) => r.ownerId),
    );
    return ownerIds.size;
  }, [rows, selected]);

  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((r) => selected.has(r.id));
  const someSelected = selectableRows.some((r) => selected.has(r.id));

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      selectableRows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  return (
    <form ref={formRef} className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded border-input"
                />
              </th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Property</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Cycle</th>
              <th className="px-3 py-2">Due date</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last invoice</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No units match these filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const badge = TONE_BADGE[row.tone];
                return (
                  <tr key={row.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 align-top">
                      {row.ownerId && (
                        <input
                          type="checkbox"
                          name="unitIds"
                          value={row.id}
                          checked={selected.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                          className="h-3.5 w-3.5 rounded border-input"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">{row.ownerLabel}</td>
                    <td className="px-3 py-2 align-top">{row.propertyName}</td>
                    <td className="px-3 py-2 align-top">{row.unitLabel}</td>
                    <td className="px-3 py-2 align-top">{row.amount ?? "—"}</td>
                    <td className="px-3 py-2 align-top">
                      {row.cycleMonths
                        ? `${row.cycleMonths} ${row.cycleMonths === 1 ? "month" : "months"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {row.dueDate ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 align-top font-medium",
                        row.balanceTone === "credit" && "text-emerald-600",
                        row.balanceTone === "owed" && "text-rose-600",
                      )}
                    >
                      {row.balanceLabel}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {row.lastInvoice ? (
                        <div className="space-y-0.5">
                          <a
                            href={`/api/service-charge-invoices/${row.lastInvoice.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-primary hover:underline"
                          >
                            #{row.lastInvoice.number} · {row.lastInvoice.date}
                          </a>
                          {row.invoiceCount > 1 && (
                            <p className="text-[11px] text-muted-foreground">
                              +{row.invoiceCount - 1} more — see Manage
                            </p>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <UnitManageModal
                        unit={row.managedUnit}
                        unitLabel={row.unitLabel}
                        propertyName={row.propertyName}
                        unitNoun={row.unitNoun}
                        unitNounCap={row.unitNounCap}
                        hasFloors={row.hasFloors}
                        hasBedrooms={row.hasBedrooms}
                        isAdmin
                        isBuildingType
                        canManageDocuments
                        owners={owners}
                        availableTenants={availableTenants}
                        funds={funds}
                        defaultTab="charge"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-3 z-10 space-y-3 rounded-lg border bg-background p-3 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">{selected.size}</span> unit
              {selected.size === 1 ? "" : "s"} selected across{" "}
              <span className="font-semibold">{selectedOwnerCount}</span>{" "}
              owner{selectedOwnerCount === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </Button>
              {!composeOpen && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setComposeOpen(true)}
                >
                  <Mail className="h-4 w-4" />
                  Compose email
                </Button>
              )}
            </div>
          </div>

          {composeOpen && (
            <div className="space-y-2 border-t pt-3">
              <div className="space-y-1">
                <Label htmlFor="bulk-email-subject" className="text-xs">
                  Subject
                </Label>
                <Input
                  id="bulk-email-subject"
                  name="subject"
                  defaultValue="Your service charge update"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bulk-email-message" className="text-xs">
                  Message
                </Label>
                <Textarea
                  id="bulk-email-message"
                  name="message"
                  className="min-h-24"
                  placeholder="Write what you'd like to tell these owners..."
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  name="includeDetails"
                  defaultChecked
                  className="h-3.5 w-3.5 rounded border-input"
                />
                Include a details table of the selected unit(s) in each email
              </label>
              <SubmitButton
                formAction={sendBulkServiceChargeEmailAction}
                size="sm"
                className="w-full"
                pendingText="Sending..."
              >
                Send to {selectedOwnerCount} owner
                {selectedOwnerCount === 1 ? "" : "s"}
              </SubmitButton>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
