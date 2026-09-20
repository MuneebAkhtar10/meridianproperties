-- Property types gain admin-managed flags (owner-association / rent-bills /
-- maintenance / common-areas) replacing the old hardcoded name === "building"
-- check scattered across lib/property-types.ts and its callers.
ALTER TABLE "property_types" ADD COLUMN "is_owner_association" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "property_types" ADD COLUMN "show_rent_bills" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "property_types" ADD COLUMN "show_maintenance" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "property_types" ADD COLUMN "has_common_areas" BOOLEAN NOT NULL DEFAULT true;

-- Backfill the existing OA type ("building") to match what the old
-- hardcoded RENT_DISABLED_PROPERTY_TYPES = ["building"] check already
-- enforced everywhere, so live behaviour doesn't change the moment this
-- migration lands.
UPDATE "property_types"
SET "is_owner_association" = true,
    "show_rent_bills" = false,
    "show_maintenance" = false,
    "has_common_areas" = false
WHERE "name" = 'building';

-- Every document can now carry its own expiry date, feeding the existing
-- 90/60/30/15/7-day reminder ladder (lib/agreement-expiry.ts) alongside
-- tenant and building agreements.
ALTER TABLE "entity_documents" ADD COLUMN "expires_at" DATE;
