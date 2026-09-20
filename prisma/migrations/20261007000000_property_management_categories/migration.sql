-- Every property type now picks exactly one of four management categories
-- (OA / BM / Callout / Other — see lib/property-types.ts), each a fixed
-- preset of show_rent_bills / show_maintenance / has_common_areas. Existing
-- generic types (villa, apartment, office, town house, ...) that are
-- neither OA nor BM fall under "Other", whose preset has common areas off
-- — correct their has_common_areas, left at the old default of true.
UPDATE "property_types"
SET "has_common_areas" = false
WHERE "is_owner_association" = false
  AND "is_building_management" = false;
