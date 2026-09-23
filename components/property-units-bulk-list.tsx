"use client";

import { useState, type ReactNode } from "react";
import { Receipt, UserRoundPlus, Wallet } from "lucide-react";

import {
  bulkAssignUnitOwnerAction,
  bulkSetUnitServiceChargeAction,
} from "@/app/admin-actions";
import { bulkGenerateUnitInvoicesAction } from "@/app/service-charge-invoice-actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateInputValue } from "@/lib/finance";
import { cn } from "@/lib/utils";

export type PropertyUnitRow = {
  id: string;
  /** The unit's own already-rendered info block (badges, owner/tenant
   * line, payment summary) — built server-side exactly as before, just
   * handed in as a slot so this component only has to own the checkbox
   * and bulk-action state around it. */
  content: ReactNode;
  /** The unit's own Manage button + modal, likewise pre-rendered. */
  manageModal: ReactNode;
};

export type PropertyUnitFloorGroup = {
  key: string;
  label: string;
  occupiedLabel: string;
  units: PropertyUnitRow[];
};

/**
 * The property page's unit list, with a checkbox on every row so an admin
 * can select several units at once and either assign them all to the same
 * owner (only ever applied to units that don't already have one — a
 * reassignment keeps its history through the Ownership tab instead) or set
 * the same service charge across all of them in one submission.
 */
export function PropertyUnitsBulkList({
  propertyId,
  floorGroups,
  owners,
  collectsServiceCharge = true,
}: {
  propertyId: string;
  floorGroups: PropertyUnitFloorGroup[];
  owners: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }[];
  collectsServiceCharge?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<"owner" | "charge" | "invoice" | null>(
    null,
  );
  const today = dateInputValue();
  const currentYear = new Date().getFullYear();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <form className="space-y-4">
      <input type="hidden" name="propertyId" value={propertyId} />

      {floorGroups.map((group) => (
        <Card key={group.key} className="overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
            <h2 className="text-sm font-medium">{group.label}</h2>
            <span className="text-xs text-muted-foreground">
              {group.occupiedLabel}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {group.units.map((unit) => (
              <div
                key={unit.id}
                className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    name="unitIds"
                    value={unit.id}
                    checked={selected.has(unit.id)}
                    onChange={() => toggle(unit.id)}
                    className="mt-1.5 h-4 w-4 shrink-0 rounded border-input"
                  />
                  <div className="min-w-0 flex-1">{unit.content}</div>
                </div>
                <div className="shrink-0 pl-7 sm:pl-0">{unit.manageModal}</div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {selected.size > 0 && (
        <div className="sticky bottom-3 z-10 space-y-3 rounded-lg border bg-background p-3 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">{selected.size}</span> unit
              {selected.size === 1 ? "" : "s"} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </Button>
              <Button
                type="button"
                variant={panel === "owner" ? "default" : "outline"}
                size="sm"
                onClick={() => setPanel(panel === "owner" ? null : "owner")}
              >
                <UserRoundPlus className="h-4 w-4" />
                Assign owner
              </Button>
              {collectsServiceCharge && (
                <>
              <Button
                type="button"
                variant={panel === "charge" ? "default" : "outline"}
                size="sm"
                onClick={() => setPanel(panel === "charge" ? null : "charge")}
              >
                <Wallet className="h-4 w-4" />
                Set service charge
              </Button>
              <Button
                type="button"
                variant={panel === "invoice" ? "default" : "outline"}
                size="sm"
                onClick={() => setPanel(panel === "invoice" ? null : "invoice")}
              >
                <Receipt className="h-4 w-4" />
                Generate invoice
              </Button>
                </>
              )}
            </div>
          </div>

          {panel === "owner" && (
            <div
              className={cn(
                "flex flex-wrap items-end gap-2 border-t pt-3",
              )}
            >
              <div className="w-64 space-y-1">
                <Label className="text-xs">Owner</Label>
                <Select name="ownerId" defaultValue="" required>
                  <option value="" disabled>
                    Select an owner
                  </option>
                  {owners.map((owner) => {
                    const name = [owner.firstName, owner.lastName]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <option key={owner.id} value={owner.id}>
                        {name ? `${name} (${owner.email})` : owner.email}
                      </option>
                    );
                  })}
                </Select>
              </div>
              <SubmitButton
                formAction={bulkAssignUnitOwnerAction}
                size="sm"
                pendingText="Assigning..."
              >
                Assign to {selected.size} unit{selected.size === 1 ? "" : "s"}
              </SubmitButton>
              <p className="w-full text-xs text-muted-foreground">
                Only applies to selected units that don&rsquo;t already have
                an owner — reassigning an owned unit keeps a transfer
                history via its own Ownership tab instead.
              </p>
            </div>
          )}

          {collectsServiceCharge && panel === "charge" && (
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <div className="w-36 space-y-1">
                <Label className="text-xs">Amount (OMR)</Label>
                <Input
                  name="serviceChargeAmount"
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                />
              </div>
              <div className="w-40 space-y-1">
                <Label className="text-xs">Repeats every</Label>
                <Select
                  name="serviceChargeCycleMonths"
                  defaultValue="12"
                  required
                >
                  <option value="1">1 month</option>
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                </Select>
              </div>
              <div className="w-40 space-y-1">
                <Label className="text-xs">Due date</Label>
                <Input
                  name="serviceChargeDueDate"
                  type="date"
                  defaultValue={dateInputValue()}
                  required
                />
              </div>
              <SubmitButton
                formAction={bulkSetUnitServiceChargeAction}
                size="sm"
                pendingText="Saving..."
              >
                Apply to {selected.size} unit{selected.size === 1 ? "" : "s"}
              </SubmitButton>
            </div>
          )}

          {collectsServiceCharge && panel === "invoice" && (
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <div className="w-36 space-y-1">
                <Label className="text-xs">Period start</Label>
                <Input
                  name="periodStart"
                  type="date"
                  defaultValue={`${currentYear}-01-01`}
                  required
                />
              </div>
              <div className="w-36 space-y-1">
                <Label className="text-xs">Period end</Label>
                <Input
                  name="periodEnd"
                  type="date"
                  defaultValue={`${currentYear}-12-31`}
                  required
                />
              </div>
              <div className="w-36 space-y-1">
                <Label className="text-xs">Issue date</Label>
                <Input
                  name="issueDate"
                  type="date"
                  defaultValue={today}
                  required
                />
              </div>
              <div className="w-36 space-y-1">
                <Label className="text-xs">Due date</Label>
                <Input name="dueDate" type="date" defaultValue={today} required />
              </div>
              <div className="w-28 space-y-1">
                <Label className="text-xs">Grace (days)</Label>
                <Input
                  name="graceDays"
                  type="number"
                  min="0"
                  defaultValue="0"
                />
              </div>
              <SubmitButton
                formAction={bulkGenerateUnitInvoicesAction}
                size="sm"
                pendingText="Generating..."
              >
                Generate for {selected.size} unit{selected.size === 1 ? "" : "s"}
              </SubmitButton>
              <p className="w-full text-xs text-muted-foreground">
                Bills each selected unit at its own configured service
                charge amount. Skips any unit with no owner assigned, no
                service charge amount set, or an existing invoice already
                covering this period.
              </p>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
