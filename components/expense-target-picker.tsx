"use client";

import { useMemo, useState } from "react";
import { Building2, LayoutGrid } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type UnitOption = { id: string; propertyId: string; label: string };

/**
 * Cascading "which property, and common-area or specific unit(s)" picker for
 * logging an expense. A property must be chosen first; only then can the
 * expense be scoped to the whole property (common area) or to one or more
 * of that property's units — never both, so the unit checkboxes only show
 * up once "Specific units" is picked.
 */
export function ExpenseTargetPicker({
  properties,
  units,
  propertyId,
  onPropertyIdChange,
  /** An OA property's units are billed through the service charge ledger,
   * not split expenses — every expense against one is a common-area cost
   * of the building itself, so there's nothing to pick a specific unit
   * for. */
  hideSpecificUnits = false,
}: {
  properties: { id: string; name: string }[];
  units: UnitOption[];
  /** Controlled from the parent so a sibling supplier picker can also
   * react to which property is selected — see ExpenseLogFields. */
  propertyId: string;
  onPropertyIdChange: (propertyId: string) => void;
  hideSpecificUnits?: boolean;
}) {
  const [mode, setMode] = useState<"common" | "units">("common");
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(
    new Set(),
  );
  const effectiveMode = hideSpecificUnits ? "common" : mode;

  const unitsForProperty = useMemo(
    () => units.filter((unit) => unit.propertyId === propertyId),
    [units, propertyId],
  );

  const toggleUnit = (unitId: string) => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="expense-property" className="text-xs">
          Property
        </Label>
        <Select
          id="expense-property"
          name="propertyId"
          required
          value={propertyId}
          onChange={(event) => {
            onPropertyIdChange(event.target.value);
            setSelectedUnitIds(new Set());
          }}
        >
          {properties.length === 0 && <option value="">No properties yet</option>}
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Against</p>
        <div className={cn("grid gap-2", hideSpecificUnits ? "grid-cols-1" : "grid-cols-2")}>
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-center transition-colors",
              effectiveMode === "common"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-input hover:bg-muted/50",
            )}
          >
            <input
              type="radio"
              name="mode"
              value="common"
              checked={effectiveMode === "common"}
              onChange={() => setMode("common")}
              className="sr-only"
            />
            <Building2
              className={cn(
                "h-4 w-4",
                effectiveMode === "common" ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="text-xs font-medium leading-snug">
              Common area
              <br />
              (whole property)
            </span>
          </label>
          {!hideSpecificUnits && (
            <label
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-center transition-colors",
                unitsForProperty.length === 0
                  ? "cursor-not-allowed border-input opacity-50"
                  : "cursor-pointer",
                effectiveMode === "units"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-input hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name="mode"
                value="units"
                checked={effectiveMode === "units"}
                onChange={() => setMode("units")}
                className="sr-only"
                disabled={unitsForProperty.length === 0}
              />
              <LayoutGrid
                className={cn(
                  "h-4 w-4",
                  effectiveMode === "units" ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="text-xs font-medium leading-snug">
                Specific unit(s)
              </span>
            </label>
          )}
        </div>
      </div>

      {effectiveMode === "units" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Units</Label>
          {unitsForProperty.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This property has no units yet.
            </p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-input p-2">
              {unitsForProperty.map((unit) => (
                <label
                  key={unit.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="unitIds"
                    value={unit.id}
                    checked={selectedUnitIds.has(unit.id)}
                    onChange={() => toggleUnit(unit.id)}
                    className="h-3.5 w-3.5 rounded border-input"
                  />
                  {unit.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
