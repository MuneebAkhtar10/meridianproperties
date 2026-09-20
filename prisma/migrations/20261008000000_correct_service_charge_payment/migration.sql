-- "Correct Invoice" — an admin can fix a mistyped payment amount (e.g.
-- 3500 instead of 350) after the fact, with a required note explaining
-- why. original_amount preserves the true first-recorded amount across
-- however many corrections happen after it.
ALTER TABLE "service_charge_payments" ADD COLUMN "original_amount" DECIMAL(14,3);
ALTER TABLE "service_charge_payments" ADD COLUMN "correction_note" TEXT;
ALTER TABLE "service_charge_payments" ADD COLUMN "corrected_at" TIMESTAMP(3);
ALTER TABLE "service_charge_payments" ADD COLUMN "corrected_by" UUID;

ALTER TABLE "service_charge_payments" ADD CONSTRAINT "service_charge_payments_corrected_by_fkey"
  FOREIGN KEY ("corrected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
