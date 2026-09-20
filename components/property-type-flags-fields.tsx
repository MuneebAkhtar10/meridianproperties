"use client";

import { useState } from "react";

import {
  PROPERTY_MANAGEMENT_CATEGORY_DESCRIPTION,
  PROPERTY_MANAGEMENT_CATEGORY_FLAGS,
  PROPERTY_MANAGEMENT_CATEGORY_LABEL,
  propertyManagementCategory,
  type PropertyManagementCategory,
} from "@/lib/property-types";

const CATEGORIES: PropertyManagementCategory[] = ["oa", "bm", "callout", "independent"];

/**
 * Every property type is exactly one of four management categories — each
 * one a fixed preset of "Process rent & bills" / "Process maintenance
 * requests" / "Have common areas", picked here as a radio group instead of
 * left as three independently-editable checkboxes. The three checkboxes
 * below are read-only, showing whichever preset the selected category
 * locks in — replacing the old "OA/BM master checkbox, everything else
 * freely editable" design with four deterministic, professional presets.
 */
export function PropertyTypeFlagsFields({
  defaultIsOwnerAssociation,
  defaultIsBuildingManagement,
  defaultShowRentBills,
  defaultShowMaintenance,
  defaultHasCommonAreas,
}: {
  defaultIsOwnerAssociation: boolean;
  defaultIsBuildingManagement: boolean;
  defaultShowRentBills: boolean;
  defaultShowMaintenance: boolean;
  defaultHasCommonAreas: boolean;
}) {
  const [category, setCategory] = useState<PropertyManagementCategory>(() =>
    propertyManagementCategory({
      isOwnerAssociation: defaultIsOwnerAssociation,
      isBuildingManagement: defaultIsBuildingManagement,
      showRentBills: defaultShowRentBills,
      showMaintenance: defaultShowMaintenance,
      hasCommonAreas: defaultHasCommonAreas,
    }),
  );
  const flags = PROPERTY_MANAGEMENT_CATEGORY_FLAGS[category];

  return (
    <div className="space-y-3 sm:col-span-2">
      <input type="hidden" name="managementCategory" value={category} />
      <div className="space-y-2">
        {CATEGORIES.map((option) => (
          <label
            key={option}
            className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              name="managementCategoryChoice"
              value={option}
              checked={category === option}
              onChange={() => setCategory(option)}
              className="mt-0.5 h-4 w-4 border-input"
            />
            <span>
              <span className="font-medium">
                {PROPERTY_MANAGEMENT_CATEGORY_LABEL[option]}
              </span>
              <span className="block text-xs text-muted-foreground">
                {PROPERTY_MANAGEMENT_CATEGORY_DESCRIPTION[option]}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="ml-1 space-y-1.5 border-l border-border/60 pl-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={flags.showRentBills}
            disabled
            className="h-4 w-4 rounded border-input"
          />
          Process rent &amp; bills
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={flags.showMaintenance}
            disabled
            className="h-4 w-4 rounded border-input"
          />
          Process maintenance requests
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={flags.hasCommonAreas}
            disabled
            className="h-4 w-4 rounded border-input"
          />
          Have common areas
        </label>
      </div>
    </div>
  );
}
