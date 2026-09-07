-- Adds support for "common area" maintenance requests — ones that belong
-- to a property as a whole (lobby, parking, garden) rather than a specific
-- tenant's unit. unit_id already allowed NULL; this adds property_id so a
-- unit-less request still knows which property it belongs to.

ALTER TABLE "maintenance_requests"
  ADD COLUMN "property_id" UUID;

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "maintenance_requests_property_id_idx"
  ON "maintenance_requests"("property_id");
