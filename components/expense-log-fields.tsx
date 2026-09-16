"use client";

import { useState } from "react";

import {
  ExpenseCategoryPicker,
  type PickableExpenseCategory,
  type PickableSupplier,
} from "@/components/expense-category-picker";
import {
  ExpenseTargetPicker,
  type UnitOption,
} from "@/components/expense-target-picker";

/**
 * Wraps the property/unit picker and the category/supplier picker in one
 * shared `propertyId` state — the supplier list depends on which property
 * is selected (see PickableSupplier.propertyIds), but the two pickers are
 * otherwise independent siblings in the "Log an expense" form.
 */
export function ExpenseLogFields({
  properties,
  units,
  categories,
  suppliers,
}: {
  properties: { id: string; name: string }[];
  units: UnitOption[];
  categories: PickableExpenseCategory[];
  suppliers: PickableSupplier[];
}) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");

  return (
    <>
      <ExpenseTargetPicker
        properties={properties}
        units={units}
        propertyId={propertyId}
        onPropertyIdChange={setPropertyId}
      />
      <ExpenseCategoryPicker
        categories={categories}
        suppliers={suppliers}
        propertyId={propertyId}
      />
    </>
  );
}
