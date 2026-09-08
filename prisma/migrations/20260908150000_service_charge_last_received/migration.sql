ALTER TABLE "properties"
ADD COLUMN IF NOT EXISTS "service_charge_last_received_at" TIMESTAMP(3);
