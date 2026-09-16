-- Parking slot agreement (tenant <-> property manager): the tenant
-- registers a car against a slot, tying the vehicle to their unit the
-- same way a Mulkiya ties a car to its owner.
ALTER TABLE "tenancies" ADD COLUMN "parking_slot_number" TEXT;
ALTER TABLE "tenancies" ADD COLUMN "vehicle_plate_number" TEXT;
ALTER TABLE "tenancies" ADD COLUMN "vehicle_details" TEXT;

ALTER TYPE "EntityDocumentCategory" ADD VALUE IF NOT EXISTS 'parking_agreement';

-- Building service agreements (property manager <-> vendor): lift
-- maintenance, fire extinguisher servicing, generator, pest control, etc.
-- Kept as its own table (not just Supplier.contractStart/End) so one
-- property can track several concurrent/expired contracts with expiry
-- dates and its own signed copy.
CREATE TABLE "building_service_contracts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id" UUID NOT NULL,
    "contract_type" TEXT NOT NULL,
    "supplier_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "amount" DECIMAL(14,3),
    "notes" TEXT,
    "document_file_name" TEXT,
    "document_file_path" TEXT,
    "document_file_type" TEXT,
    "document_file_size" INTEGER,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "building_service_contracts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "building_service_contracts_property_id_end_date_idx" ON "building_service_contracts"("property_id", "end_date");

ALTER TABLE "building_service_contracts" ADD CONSTRAINT "building_service_contracts_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "building_service_contracts" ADD CONSTRAINT "building_service_contracts_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "building_service_contracts" ADD CONSTRAINT "building_service_contracts_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
