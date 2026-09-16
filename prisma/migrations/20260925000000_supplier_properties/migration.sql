-- Links a supplier to specific properties (or "all properties", the
-- default) — only eligible properties can use that vendor when logging an
-- expense against them.

ALTER TABLE "suppliers" ADD COLUMN "available_for_all_properties" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "supplier_properties" (
  "supplier_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,

  CONSTRAINT "supplier_properties_pkey" PRIMARY KEY ("supplier_id", "property_id")
);
CREATE INDEX "supplier_properties_property_id_idx" ON "supplier_properties"("property_id");

ALTER TABLE "supplier_properties" ADD CONSTRAINT "supplier_properties_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_properties" ADD CONSTRAINT "supplier_properties_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
