"use client";

import { useState } from "react";

/**
 * "Available for all properties" toggle (the common case — most vendors
 * aren't property-exclusive), revealing a per-property pill multi-select
 * only when switched off. Client-side since the pill list's visibility
 * depends on the toggle.
 */
export function SupplierPropertyPicker({
  properties,
  defaultAllProperties = true,
  defaultSelectedIds = [],
}: {
  properties: { id: string; name: string }[];
  defaultAllProperties?: boolean;
  defaultSelectedIds?: string[];
}) {
  const [allProperties, setAllProperties] = useState(defaultAllProperties);
  const selected = new Set(defaultSelectedIds);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="availableForAllProperties"
          checked={allProperties}
          onChange={(event) => setAllProperties(event.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        Available for all properties
      </label>

      {!allProperties &&
        (properties.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No properties yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 rounded-lg border border-dashed border-border/60 p-3">
            {properties.map((property) => (
              <label key={property.id}>
                <input
                  type="checkbox"
                  name="propertyIds"
                  value={property.id}
                  defaultChecked={selected.has(property.id)}
                  className="peer sr-only"
                />
                <span className="inline-flex cursor-pointer items-center rounded-full border border-input px-3 py-1.5 text-sm font-medium text-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">
                  {property.name}
                </span>
              </label>
            ))}
          </div>
        ))}
    </div>
  );
}
