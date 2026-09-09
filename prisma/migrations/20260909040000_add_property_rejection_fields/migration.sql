-- AlterTable
ALTER TABLE "properties" ADD COLUMN "rejected_at" TIMESTAMP(3),
ADD COLUMN "rejection_reason" TEXT;
