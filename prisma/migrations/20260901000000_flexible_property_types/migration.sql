-- Replace the fixed apartment/villa enum with a property_types table so
-- admins can add their own property types (office, studio, ...) instead of
-- being limited to a hardcoded set. Floor behaviour and unit wording move
-- from code into data on this table.

CREATE TABLE "property_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit_noun_singular" TEXT NOT NULL,
    "unit_noun_plural" TEXT NOT NULL,
    "unit_prefix" TEXT,
    "has_floors" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "property_types_name_key" ON "property_types"("name");

-- Seed the two types the app already had, preserving their existing behaviour.
INSERT INTO "property_types"
  ("id", "name", "label", "unit_noun_singular", "unit_noun_plural", "unit_prefix", "has_floors", "updated_at")
VALUES
  (gen_random_uuid(), 'apartment', 'Apartment building', 'Apartment', 'Apartments', 'Apt', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'villa', 'Villa', 'Villa', 'Villas', NULL, false, CURRENT_TIMESTAMP);

-- Point existing properties at the matching new row, then drop the old enum column.
ALTER TABLE "properties" ADD COLUMN "property_type_id" UUID;

UPDATE "properties" p
SET "property_type_id" = pt."id"
FROM "property_types" pt
WHERE pt."name" = p."type"::text;

ALTER TABLE "properties" ALTER COLUMN "property_type_id" SET NOT NULL;

ALTER TABLE "properties" DROP COLUMN "type";

DROP TYPE "PropertyType";

CREATE INDEX "properties_property_type_id_idx" ON "properties"("property_type_id");

ALTER TABLE "properties" ADD CONSTRAINT "properties_property_type_id_fkey"
  FOREIGN KEY ("property_type_id") REFERENCES "property_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
