ALTER TABLE "properties" ADD COLUMN "submitted_at" TIMESTAMP(3);

-- Existing owner-submitted properties (approved = false) were already
-- visible in the admin's pending queue under the old flow — backfill
-- submitted_at so they don't silently vanish from that queue now that
-- "draft" (submitted_at null) is a distinct state from "submitted".
UPDATE "properties" SET "submitted_at" = "created_at" WHERE "approved" = false;
