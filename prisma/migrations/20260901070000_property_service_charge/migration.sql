-- Recurring maintenance "service charge" budget per property: an amount, a
-- recurring cycle in months, and the next due date. `service_charge_last_stage`
-- tracks which reminder ("upcoming" | "due" | "overdue") was last sent for the
-- current due date so the daily reminder job never double-sends.
ALTER TABLE "properties"
  ADD COLUMN "service_charge_amount" DECIMAL(14,3),
  ADD COLUMN "service_charge_cycle_months" INTEGER,
  ADD COLUMN "service_charge_due_date" DATE,
  ADD COLUMN "service_charge_last_stage" TEXT;

CREATE INDEX "properties_service_charge_due_date_idx"
  ON "properties"("service_charge_due_date")
  WHERE "service_charge_due_date" IS NOT NULL;
