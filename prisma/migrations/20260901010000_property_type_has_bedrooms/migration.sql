-- Adds a per-property-type toggle for whether units track a bedroom count.
-- Commercial types (offices, shops) have no natural bedroom count; the
-- existing Apartment and Villa types keep tracking it since they already
-- default to true.
ALTER TABLE "property_types"
  ADD COLUMN "has_bedrooms" BOOLEAN NOT NULL DEFAULT true;
