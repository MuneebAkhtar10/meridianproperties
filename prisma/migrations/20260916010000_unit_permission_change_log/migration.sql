-- Append-only log of unit rent-bills/maintenance toggle changes. Not read
-- anywhere yet — it exists so a future report can reconstruct which periods
-- a unit was billed through the system vs. handled outside it (e.g. a
-- building-management unit toggled off for two months then back on).
CREATE TABLE "unit_permission_changes" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "from_value" BOOLEAN NOT NULL,
    "to_value" BOOLEAN NOT NULL,
    "changed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_permission_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "unit_permission_changes_unit_id_created_at_idx"
  ON "unit_permission_changes"("unit_id", "created_at");

ALTER TABLE "unit_permission_changes"
  ADD CONSTRAINT "unit_permission_changes_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "unit_permission_changes"
  ADD CONSTRAINT "unit_permission_changes_changed_by_fkey"
  FOREIGN KEY ("changed_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
