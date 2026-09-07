-- HR paperwork tracked for in-house workers only (passport, work visa,
-- Civil ID expiry, and car insurance for those who drive a company
-- vehicle) — what's needed to keep a Gulf work permit valid.

ALTER TABLE "users"
  ADD COLUMN "passport_number" TEXT,
  ADD COLUMN "passport_expiry" TIMESTAMP(3),
  ADD COLUMN "visa_number" TEXT,
  ADD COLUMN "visa_expiry" TIMESTAMP(3),
  ADD COLUMN "civil_id_expiry" TIMESTAMP(3),
  ADD COLUMN "car_insurance_number" TEXT,
  ADD COLUMN "car_insurance_expiry" TIMESTAMP(3),
  ADD COLUMN "hr_reminder_stages" JSONB;
