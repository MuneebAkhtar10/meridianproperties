-- Adds "family" employee tracking: an in-house worker can be marked as a
-- family employee, with dependents (spouse/father/mother) each tracked with
-- their own Bataka (Civil ID) issuance/expiry and document upload.

CREATE TYPE "FamilyRelationship" AS ENUM ('spouse', 'father', 'mother');

ALTER TABLE "users"
  ADD COLUMN "employee_type" TEXT NOT NULL DEFAULT 'individual';

CREATE TABLE "worker_family_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "worker_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "relationship" "FamilyRelationship" NOT NULL,
  "civil_id_issuance" TIMESTAMP(3),
  "civil_id_expiry" TIMESTAMP(3),
  "document_file_name" TEXT,
  "document_file_path" TEXT,
  "document_file_type" TEXT,
  "document_file_size" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "worker_family_members_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "worker_family_members"
  ADD CONSTRAINT "worker_family_members_worker_id_fkey"
  FOREIGN KEY ("worker_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "worker_family_members_worker_id_idx"
  ON "worker_family_members"("worker_id");
