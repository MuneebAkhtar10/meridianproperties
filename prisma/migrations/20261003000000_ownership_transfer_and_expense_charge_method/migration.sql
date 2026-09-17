-- Professional "Transfer ownership" flow — a proper audit trail of unit
-- ownership handovers instead of silently overwriting units.owner_id.
CREATE TABLE "ownership_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_id" UUID NOT NULL,
    "from_owner_id" UUID,
    "to_owner_id" UUID NOT NULL,
    "transfer_date" DATE NOT NULL,
    "kept_service_charge" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ownership_transfers_unit_id_created_at_idx" ON "ownership_transfers"("unit_id", "created_at");

ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_from_owner_id_fkey"
  FOREIGN KEY ("from_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_to_owner_id_fkey"
  FOREIGN KEY ("to_owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Non-OA property expenses (villa/apartment/office/building management)
-- can now be billed to the owner as an extra charge, or deducted from the
-- OA service charge already being collected for that unit. Ignored for OA
-- ("building" type) units, which never had this distinction to begin with.
ALTER TABLE "expenses" ADD COLUMN "owner_charge_method" TEXT NOT NULL DEFAULT 'extra_charge';
