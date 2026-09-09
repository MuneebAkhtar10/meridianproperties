ALTER TABLE "maintenance_requests" ADD COLUMN "created_by_id" UUID;

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
