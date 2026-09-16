/**
 * Property types are fully admin-managed (see /protected/admin/property-types)
 * instead of a fixed apartment/villa enum, so every place that used to branch
 * on "is this a villa?" should branch on this shape instead.
 */
export type UnitNaming = {
  hasFloors: boolean;
  unitPrefix: string | null;
};

/** "Apt 101" for a prefixed type, or just "101" / "Villa 2" when the unit
 * label already carries its own identity (unitPrefix is null). */
export function formatUnitLabel(
  propertyType: UnitNaming,
  label: string,
): string {
  return propertyType.unitPrefix
    ? `${propertyType.unitPrefix} ${label}`
    : label;
}

/** Property types are freeform admin rows, not a fixed enum — but one
 * conventional key ("building" = an owners association, which only ever
 * charges service fees, never rent) gets a sensible starting point for a
 * brand-new unit's rent/maintenance toggles. Anything else (including
 * "building_management", which DOES bill rent — see isBuildingManagementType
 * below — or a type an admin renamed away from this key) defaults to both
 * on, same as before this distinction existed. */
const RENT_DISABLED_PROPERTY_TYPES = ["building"];

export function defaultUnitPermissions(propertyTypeName: string): {
  rentBillsEnabled: boolean;
  maintenanceEnabled: boolean;
} {
  const enabled = !RENT_DISABLED_PROPERTY_TYPES.includes(propertyTypeName);
  return { rentBillsEnabled: enabled, maintenanceEnabled: enabled };
}

/** An OA/owners-association property (a "building" type) never bills rent —
 * it only ever charges service fees. The rent/maintenance toggles that other
 * property types can opt into per unit shouldn't even be offered here. */
export function isBuildingType(propertyTypeName: string): boolean {
  return RENT_DISABLED_PROPERTY_TYPES.includes(propertyTypeName);
}

/** A "Building Management" property — Rawazen manages a whole rental
 * building on the landlord's behalf: it collects rent (sometimes via the
 * company, sometimes the landlord collects directly) and pays building
 * expenses, then reconciles the two into a periodic Building Management
 * Summary Report (spec #36). Distinct from the OA "building" type above,
 * which never touches rent at all. */
export function isBuildingManagementType(propertyTypeName: string): boolean {
  return propertyTypeName === "building_management";
}
