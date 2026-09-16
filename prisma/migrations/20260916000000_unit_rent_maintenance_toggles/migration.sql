-- Per-unit permission toggles: whether a unit is billed through Rent & Bills
-- at all, and whether its tenant can file maintenance requests / it gets
-- service-charge reminders. Both default true so every existing unit keeps
-- behaving exactly as it does today.
ALTER TABLE "units"
  ADD COLUMN "rent_bills_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "maintenance_enabled" BOOLEAN NOT NULL DEFAULT true;
