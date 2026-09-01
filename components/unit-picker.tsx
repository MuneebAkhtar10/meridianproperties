"use client";

import { useMemo, useState } from "react";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatUnitLabel } from "@/lib/property-types";

export type PickableUnit = {
  id: string;
  label: string;
  propertyName: string;
  propertyTypeId: string;
  propertyTypeLabel: string;
  propertyTypeUnitNounSingular: string;
  propertyTypeUnitNounPlural: string;
  propertyTypeUnitPrefix: string | null;
};

/**
 * Type-first unit picker: the admin chooses a property type first (however
 * many types exist — apartment building, villa, office, anything an admin
 * has added under Property types), then only sees units belonging to that
 * type. Types are never mixed together in the same list.
 */
export function UnitPicker({
  units,
  name,
  id,
  defaultUnitId,
  required,
}: {
  units: PickableUnit[];
  name: string;
  id: string;
  defaultUnitId?: string;
  required?: boolean;
}) {
  const defaultUnit = defaultUnitId
    ? units.find((u) => u.id === defaultUnitId)
    : undefined;

  const availableTypes = useMemo(() => {
    const seen = new Map<string, PickableUnit>();
    for (const unit of units) {
      if (!seen.has(unit.propertyTypeId)) seen.set(unit.propertyTypeId, unit);
    }
    return [...seen.values()];
  }, [units]);

  const [propertyTypeId, setPropertyTypeId] = useState<string>(
    defaultUnit?.propertyTypeId ?? "",
  );
  const [unitId, setUnitId] = useState<string>(defaultUnit?.id ?? "");

  const filteredUnits = useMemo(
    () => units.filter((u) => u.propertyTypeId === propertyTypeId),
    [units, propertyTypeId],
  );

  const selectedType = availableTypes.find(
    (t) => t.propertyTypeId === propertyTypeId,
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-type`}>Property type</Label>
        <Select
          id={`${id}-type`}
          value={propertyTypeId}
          autoComplete="off"
          onChange={(e) => {
            setPropertyTypeId(e.target.value);
            // A unit from the previous type can never be valid once the type
            // changes — clear it so a stale id doesn't get submitted.
            setUnitId("");
          }}
        >
          <option value="">— Choose a property type —</option>
          {availableTypes.map((type) => (
            <option key={type.propertyTypeId} value={type.propertyTypeId}>
              {type.propertyTypeLabel}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id}>
          {selectedType?.propertyTypeUnitNounSingular ?? "Unit"}
        </Label>
        <Select
          id={id}
          name={name}
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          autoComplete="off"
          disabled={!propertyTypeId}
          required={required}
        >
          <option value="">
            {propertyTypeId
              ? "— Assign later —"
              : "Choose a property type first"}
          </option>
          {filteredUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.propertyName} ·{" "}
              {formatUnitLabel(
                { hasFloors: true, unitPrefix: unit.propertyTypeUnitPrefix },
                unit.label,
              )}
            </option>
          ))}
        </Select>
        {propertyTypeId && filteredUnits.length === 0 && (
          <p className="text-xs text-amber-700">
            No vacant{" "}
            {(
              selectedType?.propertyTypeUnitNounPlural ?? "units"
            ).toLowerCase()}{" "}
            right now.
          </p>
        )}
      </div>
    </div>
  );
}
