-- Correction: an owner-association property type's whole point is its
-- shared common areas, so "has_common_areas" should lock ON for it, not
-- off like the rent/maintenance flags — the previous migration
-- (20261004000000_property_type_flags_and_document_expiry) backfilled it
-- to false by mistake.
UPDATE "property_types"
SET "has_common_areas" = true
WHERE "is_owner_association" = true;
