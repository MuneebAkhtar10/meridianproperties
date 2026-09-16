-- Lets a document be scoped to a unit — starting with the ownership
-- contract between the property manager and a unit's owner, established
-- when the owner's unit is set up.
ALTER TYPE "EntityDocumentCategory" ADD VALUE IF NOT EXISTS 'ownership_contract';

ALTER TABLE "entity_documents" ADD COLUMN "unit_id" UUID;

CREATE INDEX "entity_documents_unit_id_created_at_idx"
  ON "entity_documents"("unit_id", "created_at");

ALTER TABLE "entity_documents"
  ADD CONSTRAINT "entity_documents_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
