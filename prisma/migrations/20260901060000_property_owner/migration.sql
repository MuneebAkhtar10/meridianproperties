-- Adds the "owner" (landlord) role: properties can now be assigned to a User
-- (owner_id), and an owner-submitted property starts unapproved until an
-- admin approves it. `approved` defaults to true so every existing property
-- stays live; the create action explicitly sets false only when the actor
-- creating the row is an owner.
ALTER TYPE "UserType" ADD VALUE IF NOT EXISTS 'owner';

ALTER TABLE "properties"
  ADD COLUMN "owner_id" UUID,
  ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "properties_owner_id_idx" ON "properties"("owner_id");
