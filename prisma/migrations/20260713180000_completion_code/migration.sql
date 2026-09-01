-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "completion_code" TEXT,
ADD COLUMN     "completion_code_at" TIMESTAMP(3);
