"use client";

import { useState } from "react";
import { Receipt, Wallet } from "lucide-react";

import { Label } from "@/components/ui/label";
import { OWNER_CHARGE_METHOD_LABEL, type OwnerChargeMethod } from "@/lib/owner-charge-method";
import { cn } from "@/lib/utils";

const OPTIONS: { value: OwnerChargeMethod; description: string; icon: typeof Receipt }[] = [
  {
    value: "extra_charge",
    description: "Billed to the owner on top of what they already pay.",
    icon: Receipt,
  },
  {
    value: "service_charge_deduction",
    description: "Absorbed by the service charge already being collected.",
    icon: Wallet,
  },
];

/**
 * Only meaningful for a non-OA property (villa/apartment/office/building
 * management) — those bill individual tenant rent, so an expense against
 * one of their units needs to say whether it's an extra charge to the
 * owner or comes out of the service charge already being collected for
 * that unit. An OA property never shows this at all (see ExpenseLogFields).
 */
export function OwnerChargeMethodPicker({
  defaultValue = "extra_charge",
  allowDeduction = true,
}: {
  defaultValue?: OwnerChargeMethod;
  /** False for properties with no service charge (Independent, Building
   * management) — there's nothing to deduct from, so only "Charged to
   * owner" is offered. */
  allowDeduction?: boolean;
}) {
  const [value, setValue] = useState<OwnerChargeMethod>(
    allowDeduction ? defaultValue : "extra_charge",
  );
  const options = allowDeduction
    ? OPTIONS
    : OPTIONS.filter((option) => option.value === "extra_charge");

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">How is this billed to the owner?</Label>
      <div
        className={cn(
          "grid gap-2",
          allowDeduction ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {options.map((option) => {
          const Icon = option.icon;
          const active = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-center transition-colors",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-input hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name="ownerChargeMethod"
                value={option.value}
                checked={active}
                onChange={() => setValue(option.value)}
                className="sr-only"
              />
              <Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="text-xs font-medium leading-snug">
                {OWNER_CHARGE_METHOD_LABEL[option.value]}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {OPTIONS.find((o) => o.value === value)?.description}
      </p>
    </div>
  );
}
