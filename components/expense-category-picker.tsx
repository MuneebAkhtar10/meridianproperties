"use client";

import { useMemo, useState } from "react";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type PickableExpenseCategory = {
  id: string;
  label: string;
  subcategories: { id: string; label: string }[];
};

export type PickableSupplier = {
  id: string;
  companyName: string;
  categoryIds: string[];
  /** null means "available for all properties." */
  propertyIds: string[] | null;
};

/**
 * Category, then the specific line item within it (e.g. "Services" →
 * "Cleaning Service"), then which supplier did the work — the subcategory
 * list and the supplier list both depend on the chosen category, and the
 * supplier list also depends on the chosen property (see `propertyId`), so
 * the supplier select resets whenever either changes. Categories come from
 * the admin-managed "Expense Types" tab on /protected/expenses; suppliers
 * are filtered to only ones that cover the chosen category AND are
 * eligible for the chosen property, plus a "Company default" option (no
 * external vendor).
 */
export function ExpenseCategoryPicker({
  categories,
  suppliers = [],
  propertyId,
  defaultCategoryId,
  defaultSubcategory,
  defaultSupplierId,
  idPrefix = "expense",
}: {
  categories: PickableExpenseCategory[];
  suppliers?: PickableSupplier[];
  /** Which property the expense is against — narrows the supplier list to
   * vendors eligible for it. Omit (e.g. in the edit modal, where it isn't
   * tracked) to skip property-based filtering. */
  propertyId?: string;
  /** For editing an existing expense — otherwise defaults to the first category. */
  defaultCategoryId?: string;
  /** Only applied while the category hasn't been changed away from defaultCategoryId. */
  defaultSubcategory?: string;
  /** Only applied while the category hasn't been changed away from defaultCategoryId. */
  defaultSupplierId?: string;
  /** Namespaces the field ids so the create form and an edit modal can both
   * render this component on the page at once without id collisions. */
  idPrefix?: string;
}) {
  const initialCategoryId = defaultCategoryId ?? categories[0]?.id ?? "";
  const [categoryId, setCategoryId] = useState<string>(initialCategoryId);

  const subcategories = useMemo(
    () => categories.find((c) => c.id === categoryId)?.subcategories ?? [],
    [categories, categoryId],
  );
  const availableSuppliers = useMemo(
    () =>
      suppliers.filter(
        (s) =>
          s.categoryIds.includes(categoryId) &&
          (!propertyId || s.propertyIds === null || s.propertyIds.includes(propertyId)),
      ),
    [suppliers, categoryId, propertyId],
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${idPrefix}-category`} className="text-xs">
            Category
          </Label>
          <Select
            id={`${idPrefix}-category`}
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${idPrefix}-subcategory`} className="text-xs">
            Type
          </Label>
          <Select
            id={`${idPrefix}-subcategory`}
            name="subcategory"
            key={categoryId}
            defaultValue={
              categoryId === initialCategoryId ? defaultSubcategory : undefined
            }
          >
            {subcategories.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.label}>
                {subcategory.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${idPrefix}-supplier`} className="text-xs">
          Supplier
        </Label>
        <Select
          id={`${idPrefix}-supplier`}
          name="supplierId"
          key={`${categoryId}-${propertyId ?? ""}`}
          defaultValue={
            categoryId === initialCategoryId ? defaultSupplierId ?? "" : ""
          }
        >
          <option value="">Company default</option>
          {availableSuppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.companyName}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
