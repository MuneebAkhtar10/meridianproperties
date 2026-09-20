"use client";

import { useMemo, useState } from "react";

import {
  ExpenseCategoryPicker,
  type PickableExpenseCategory,
  type PickableSupplier,
} from "@/components/expense-category-picker";
import {
  ExpenseTargetPicker,
  type UnitOption,
} from "@/components/expense-target-picker";
import { OwnerChargeMethodPicker } from "@/components/owner-charge-method-picker";

/**
 * Wraps the property/unit picker and the category/supplier picker in one
 * shared `propertyId` state — the supplier list depends on which property
 * is selected (see PickableSupplier.propertyIds), but the two pickers are
 * otherwise independent siblings in the "Log an expense" form. Also shows
 * the owner-charge-method choice once a non-OA property is selected — an
 * OA property never had that distinction (see OwnerChargeMethodPicker).
 */
export type ExpenseLogFieldsProps = {
  properties: {
    id: string;
    name: string;
    propertyType: { name: string; isOwnerAssociation: boolean };
  }[];
  units: UnitOption[];
  categories: PickableExpenseCategory[];
  suppliers: PickableSupplier[];
  /** Pre-selects this property instead of the list's first one — set when
   * the form opens already scoped to a property (e.g. arriving from that
   * property's own page, or the Expenses page's own property filter), so
   * "Log an expense" starts on the same property the page is already
   * filtered to instead of silently defaulting elsewhere. */
  defaultPropertyId?: string;
};

export function ExpenseLogFields({
  properties,
  units,
  categories,
  suppliers,
  defaultPropertyId,
}: ExpenseLogFieldsProps) {
  const [propertyId, setPropertyId] = useState(
    defaultPropertyId ?? properties[0]?.id ?? "",
  );

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === propertyId),
    [properties, propertyId],
  );
  const isOaProperty = selectedProperty?.propertyType.isOwnerAssociation ?? false;

  return (
    <>
      <ExpenseTargetPicker
        properties={properties}
        units={units}
        propertyId={propertyId}
        onPropertyIdChange={setPropertyId}
        hideSpecificUnits={isOaProperty}
      />
      <ExpenseCategoryPicker
        categories={categories}
        suppliers={suppliers}
        propertyId={propertyId}
      />
      {!isOaProperty && <OwnerChargeMethodPicker />}
    </>
  );
}
