-- A "Building Management" (BM) property type mirrors OA the opposite way:
-- the company manages several units within a property it doesn't own,
-- so rent/maintenance stay on but common areas (the actual owner's
-- concern) turn off. Replaces the old hardcoded name === "building_management"
-- check in lib/property-types.ts.
ALTER TABLE "property_types" ADD COLUMN "is_building_management" BOOLEAN NOT NULL DEFAULT false;

-- Backfill the existing "building_management" type and correct its
-- common-areas flag to match the new BM definition (it was left at the
-- default `true` before this flag existed).
UPDATE "property_types"
SET "is_building_management" = true,
    "show_rent_bills" = true,
    "show_maintenance" = true,
    "has_common_areas" = false
WHERE "name" = 'building_management';
