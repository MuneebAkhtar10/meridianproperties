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
