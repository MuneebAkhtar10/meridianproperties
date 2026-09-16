-- The "exactly one owner" check constraint predates unit_id (added in
-- 20260916020000_unit_documents) and was never updated to count it, so a
-- unit-only document (property_id/tenancy_id/user_id all null) violated it.
ALTER TABLE "entity_documents" DROP CONSTRAINT "entity_documents_exactly_one_owner";

ALTER TABLE "entity_documents" ADD CONSTRAINT "entity_documents_exactly_one_owner" CHECK (
  num_nonnulls("property_id", "unit_id", "tenancy_id", "user_id") = 1
);
