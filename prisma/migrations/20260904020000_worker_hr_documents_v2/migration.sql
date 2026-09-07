-- Expands the HR document record to match the fuller employee-record shape:
-- issuance dates alongside expiry, a Driving License document, a
-- has-vehicle flag, and Mulkiya (vehicle registration) alongside Car
-- Insurance. Also adds matching upload categories to entity_documents.

ALTER TYPE "EntityDocumentCategory" ADD VALUE 'driving_license';
ALTER TYPE "EntityDocumentCategory" ADD VALUE 'vehicle_registration';
ALTER TYPE "EntityDocumentCategory" ADD VALUE 'car_insurance';

ALTER TABLE "users"
  ADD COLUMN "passport_issuance" TIMESTAMP(3),
  ADD COLUMN "visa_issuance" TIMESTAMP(3),
  ADD COLUMN "civil_id_issuance" TIMESTAMP(3),
  ADD COLUMN "driving_license_number" TEXT,
  ADD COLUMN "driving_license_issuance" TIMESTAMP(3),
  ADD COLUMN "driving_license_expiry" TIMESTAMP(3),
  ADD COLUMN "has_vehicle" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "vehicle_registration_number" TEXT,
  ADD COLUMN "vehicle_registration_issuance" TIMESTAMP(3),
  ADD COLUMN "vehicle_registration_expiry" TIMESTAMP(3),
  ADD COLUMN "car_insurance_issuance" TIMESTAMP(3);
