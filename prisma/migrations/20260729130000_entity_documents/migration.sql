CREATE TYPE "EntityDocumentCategory" AS ENUM (
  'tenancy_agreement',
  'municipality_registration',
  'move_in_report',
  'title_deed',
  'ownership_certificate',
  'cadastral_plan',
  'building_permit',
  'completion_certificate',
  'noc',
  'property_insurance',
  'civil_id',
  'passport',
  'resident_card',
  'visa',
  'employment_letter',
  'other'
);

CREATE TABLE "entity_documents" (
  "id" UUID NOT NULL,
  "property_id" UUID,
  "tenancy_id" UUID,
  "user_id" UUID,
  "category" "EntityDocumentCategory" NOT NULL,
  "label" TEXT,
  "file_name" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "file_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "uploaded_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "entity_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entity_documents_exactly_one_owner" CHECK (
    num_nonnulls("property_id", "tenancy_id", "user_id") = 1
  )
);

CREATE INDEX "entity_documents_property_id_created_at_idx"
  ON "entity_documents"("property_id", "created_at");
CREATE INDEX "entity_documents_tenancy_id_created_at_idx"
  ON "entity_documents"("tenancy_id", "created_at");
CREATE INDEX "entity_documents_user_id_created_at_idx"
  ON "entity_documents"("user_id", "created_at");

ALTER TABLE "entity_documents"
  ADD CONSTRAINT "entity_documents_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entity_documents"
  ADD CONSTRAINT "entity_documents_tenancy_id_fkey"
  FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entity_documents"
  ADD CONSTRAINT "entity_documents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entity_documents"
  ADD CONSTRAINT "entity_documents_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
