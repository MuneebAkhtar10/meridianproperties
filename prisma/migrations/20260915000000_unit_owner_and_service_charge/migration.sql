-- Moves ownership and the recurring "service charge" budget from Property to
-- Unit: a property can now contain units owned by different landlords, and
-- each unit is billed its own service charge instead of one per property.
-- Every existing unit is backfilled from its current parent property's
-- owner/charge before those columns are dropped from properties.

ALTER TABLE "units"
  ADD COLUMN "owner_id" UUID,
  ADD COLUMN "service_charge_amount" DECIMAL(14,3),
  ADD COLUMN "service_charge_cycle_months" INTEGER,
  ADD COLUMN "service_charge_due_date" DATE,
  ADD COLUMN "service_charge_last_stage" TEXT,
  ADD COLUMN "service_charge_last_received_at" TIMESTAMP(3);

ALTER TABLE "units"
  ADD CONSTRAINT "units_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "units_owner_id_idx" ON "units"("owner_id");

UPDATE "units" u
SET "owner_id" = p."owner_id",
    "service_charge_amount" = p."service_charge_amount",
    "service_charge_cycle_months" = p."service_charge_cycle_months",
    "service_charge_due_date" = p."service_charge_due_date",
    "service_charge_last_stage" = p."service_charge_last_stage",
    "service_charge_last_received_at" = p."service_charge_last_received_at"
FROM "properties" p
WHERE u."property_id" = p."id";

DROP INDEX IF EXISTS "properties_owner_id_idx";
DROP INDEX IF EXISTS "properties_service_charge_due_date_idx";
ALTER TABLE "properties" DROP CONSTRAINT IF EXISTS "properties_owner_id_fkey";
ALTER TABLE "properties" DROP COLUMN "owner_id";
ALTER TABLE "properties" DROP COLUMN "service_charge_amount";
ALTER TABLE "properties" DROP COLUMN "service_charge_cycle_months";
ALTER TABLE "properties" DROP COLUMN "service_charge_due_date";
ALTER TABLE "properties" DROP COLUMN "service_charge_last_stage";
ALTER TABLE "properties" DROP COLUMN "service_charge_last_received_at";
