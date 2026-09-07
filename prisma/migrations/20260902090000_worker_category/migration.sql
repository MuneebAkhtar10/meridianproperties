-- CreateEnum
CREATE TYPE "WorkerCategory" AS ENUM ('in_house', 'third_party');

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "worker_category" "WorkerCategory",
  ADD COLUMN "company_name" TEXT;

-- Backfill existing workers as in_house by default so nothing goes unassigned.
UPDATE "users" SET "worker_category" = 'in_house' WHERE "user_type" = 'worker';
