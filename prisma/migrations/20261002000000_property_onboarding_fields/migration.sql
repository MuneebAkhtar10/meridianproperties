-- Spec #3 "Property Onboarding" — the property master needs a few more of
-- Rawazen's source fields: the building's own name/number (kept distinct
-- from the municipal building number), and latitude/longitude/map position
-- for location-based functions (map pins, JAHEZ property identification).
-- Unit-level source fields (Floor, Lot, Flat No., Unit, Unit No., Unit ID,
-- Unit Entitlement, BHK) are intentionally NOT added here — those already
-- exist as per-unit fields (Unit.floor/label/entitlements/bedrooms), added
-- after the property itself, and stay that way.
ALTER TABLE "properties" ADD COLUMN "building_name" TEXT;
ALTER TABLE "properties" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "properties" ADD COLUMN "longitude" DECIMAL(10,7);
ALTER TABLE "properties" ADD COLUMN "location_map_position" TEXT;
