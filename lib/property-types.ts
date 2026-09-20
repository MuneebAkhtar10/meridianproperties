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

/** A new unit's starting rent-bills/maintenance toggles come straight from
 * its property type's own "Show rent & bills" / "Show maintenance requests"
 * flags (admin-managed, see /protected/admin/property-types) — replacing
 * the old hardcoded RENT_DISABLED_PROPERTY_TYPES = ["building"] check that
 * used to decide this by name alone. */
export function defaultUnitPermissions(propertyType: {
  showRentBills: boolean;
  showMaintenance: boolean;
}): {
  rentBillsEnabled: boolean;
  maintenanceEnabled: boolean;
} {
  return {
    rentBillsEnabled: propertyType.showRentBills,
    maintenanceEnabled: propertyType.showMaintenance,
  };
}

/** An owners'-association property type never bills rent and never takes
 * maintenance requests — it only ever charges service fees. The
 * rent/maintenance toggles other property types can opt into per unit
 * shouldn't even be offered here. Driven by the type's own
 * `isOwnerAssociation` flag instead of a hardcoded name check. */
export function isBuildingType(propertyType: {
  isOwnerAssociation: boolean;
}): boolean {
  return propertyType.isOwnerAssociation;
}

/** A "Building Management" (BM) property — the company doesn't own the
 * property, only manages several units within it on the landlord's behalf:
 * it collects rent (sometimes via the company, sometimes the landlord
 * collects directly) and pays building expenses, then reconciles the two
 * into a periodic Building Management Summary Report (spec #36). Distinct
 * from the OA type above (which never touches rent at all) — a BM type
 * bills rent/maintenance same as any rental, it just has no common areas
 * of its own to manage. Driven by the type's own `isBuildingManagement`
 * flag instead of a hardcoded name check. */
export function isBuildingManagementType(propertyType: {
  isBuildingManagement: boolean;
}): boolean {
  return propertyType.isBuildingManagement;
}

/** The four management categories a property type can be — mutually
 * exclusive, each one a fixed preset of the three feature flags. Replaces
 * the old "OA/BM master checkbox, three free checkboxes for anything
 * else" design: every property type now picks exactly one of these
 * instead of leaving the three flags in an arbitrary combination. */
export type PropertyManagementCategory = "oa" | "bm" | "callout" | "independent";

export const PROPERTY_MANAGEMENT_CATEGORY_LABEL: Record<
  PropertyManagementCategory,
  string
> = {
  oa: "Owner-associated (OA)",
  bm: "Building management (BM)",
  callout: "Callout",
  independent: "Independent",
};

export const PROPERTY_MANAGEMENT_CATEGORY_DESCRIPTION: Record<
  PropertyManagementCategory,
  string
> = {
  oa: "The owner owns the whole property; we only manage it. Units never bill rent and never take maintenance requests — common areas stay on.",
  bm: "We don't own the property, only several units within it. Rent and maintenance requests stay on — there are no common areas of our own to manage.",
  callout: "One-off maintenance work only — no rent, no bills, no common areas to manage.",
  independent: "A standalone rental (villa, apartment, office, ...) with its own landlord — rent and maintenance stay on, with no shared common areas to manage. Gets its own Landlord Statement report.",
};

/** A plain-English "what we manage here" note for the property page's own
 * scope banner — company-facing (not the admin form's own description
 * above), so admins and owners looking at a specific property immediately
 * see which of Rawazen's four service scopes it falls under and what that
 * means in practice, rather than having to infer it from the flags. */
export const PROPERTY_MANAGEMENT_SCOPE_NOTE: Record<PropertyManagementCategory, string> = {
  oa: "Rawazen manages this entire property on behalf of its owners' association — common areas, service charges and building-wide maintenance. Individual units are not billed rent through this system.",
  bm: "Rawazen manages a number of units within this property on the landlord's behalf — rent collection, tenant maintenance requests and building expenses. There are no common areas of our own to manage here.",
  callout: "Rawazen handles one-off maintenance work for this property only — no rent, bills or common areas are managed here.",
  independent: "This is a standalone rental with its own landlord. Rawazen manages rent collection and maintenance on their behalf, with no shared common areas, and produces a dedicated Landlord Statement for this property.",
};

export type PropertyManagementFlags = {
  isOwnerAssociation: boolean;
  isBuildingManagement: boolean;
  showRentBills: boolean;
  showMaintenance: boolean;
  hasCommonAreas: boolean;
};

/** The fixed flag combination each category locks in. */
export const PROPERTY_MANAGEMENT_CATEGORY_FLAGS: Record<
  PropertyManagementCategory,
  PropertyManagementFlags
> = {
  oa: {
    isOwnerAssociation: true,
    isBuildingManagement: false,
    showRentBills: false,
    showMaintenance: false,
    hasCommonAreas: true,
  },
  bm: {
    isOwnerAssociation: false,
    isBuildingManagement: true,
    showRentBills: true,
    showMaintenance: true,
    hasCommonAreas: false,
  },
  callout: {
    isOwnerAssociation: false,
    isBuildingManagement: false,
    showRentBills: false,
    showMaintenance: true,
    hasCommonAreas: false,
  },
  independent: {
    isOwnerAssociation: false,
    isBuildingManagement: false,
    showRentBills: true,
    showMaintenance: true,
    hasCommonAreas: false,
  },
};

/** Reverse lookup — which category a property type's stored flags match.
 * Falls back to "independent" for a row saved before this categorization
 * existed, or in the impossible case none of the four presets match
 * exactly (the admin UI never produces such a row, but this keeps the
 * form from crashing on unexpected data). */
export function propertyManagementCategory(
  flags: PropertyManagementFlags,
): PropertyManagementCategory {
  const match = (
    Object.entries(PROPERTY_MANAGEMENT_CATEGORY_FLAGS) as [
      PropertyManagementCategory,
      PropertyManagementFlags,
    ][]
  ).find(
    ([, preset]) =>
      preset.isOwnerAssociation === flags.isOwnerAssociation &&
      preset.isBuildingManagement === flags.isBuildingManagement &&
      preset.showRentBills === flags.showRentBills &&
      preset.showMaintenance === flags.showMaintenance &&
      preset.hasCommonAreas === flags.hasCommonAreas,
  );
  return match ? match[0] : "independent";
}

/** The "Independent" category (a standalone rental with its own landlord —
 * see PropertyManagementCategory above) is the one property types that
 * gets the Landlord Statement report: building/owner info, tenant info,
 * a rent-collection history and an expense sheet (service charge included
 * as a line, netted off if it's already been paid separately) netting to
 * a balance owed to the landlord. Driven by the same flags as the
 * category radio in the property-type admin form, not a stored column of
 * its own — nothing else needs to identify this category by itself the
 * way isBuildingType/isBuildingManagementType do. */
export function isIndependentType(propertyType: PropertyManagementFlags): boolean {
  return propertyManagementCategory(propertyType) === "independent";
}

