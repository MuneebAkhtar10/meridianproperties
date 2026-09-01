ALTER TYPE "RequestStatus" ADD VALUE 'on_hold' BEFORE 'completed';

ALTER TABLE "maintenance_requests"
ADD COLUMN "hold_reason" TEXT,
ADD COLUMN "held_at" TIMESTAMP(3),
ADD COLUMN "held_from_status" "RequestStatus",
ADD COLUMN "resume_requested_at" TIMESTAMP(3);
