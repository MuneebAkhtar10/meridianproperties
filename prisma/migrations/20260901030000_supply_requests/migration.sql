-- A worker's ask for something needed to finish a held maintenance job (a
-- part, a tool, a purchase), routed to the admin for approve/deny.

CREATE TYPE "SupplyRequestStatus" AS ENUM ('pending', 'approved', 'denied');

CREATE TABLE "supply_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "item" TEXT NOT NULL,
  "notes" TEXT,
  "status" "SupplyRequestStatus" NOT NULL DEFAULT 'pending',
  "admin_note" TEXT,
  "requested_by" UUID NOT NULL,
  "decided_by" UUID,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "supply_requests_pkey" PRIMARY KEY ("id")
);

-- Prisma's @updatedAt has no DB-side default, but existing rows still need a
-- value for the NOT NULL column above; there are none yet on a fresh table,
-- so this is only a safety net if this migration is ever run non-fresh.
ALTER TABLE "supply_requests" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "supply_requests_request_id_idx" ON "supply_requests"("request_id");
CREATE INDEX "supply_requests_status_idx" ON "supply_requests"("status");

ALTER TABLE "supply_requests"
  ADD CONSTRAINT "supply_requests_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "maintenance_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supply_requests"
  ADD CONSTRAINT "supply_requests_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supply_requests"
  ADD CONSTRAINT "supply_requests_decided_by_fkey"
  FOREIGN KEY ("decided_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
