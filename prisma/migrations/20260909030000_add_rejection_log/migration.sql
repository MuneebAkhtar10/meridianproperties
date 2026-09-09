-- CreateEnum
CREATE TYPE "RejectionKind" AS ENUM ('property', 'payment', 'supply_request');

-- CreateTable
CREATE TABLE "rejection_logs" (
    "id" UUID NOT NULL,
    "kind" "RejectionKind" NOT NULL,
    "entity_label" TEXT NOT NULL,
    "affected_user" TEXT,
    "amount" DECIMAL(14,3),
    "reason" TEXT,
    "rejected_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rejection_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rejection_logs_kind_idx" ON "rejection_logs"("kind");

-- CreateIndex
CREATE INDEX "rejection_logs_created_at_idx" ON "rejection_logs"("created_at");

-- AddForeignKey
ALTER TABLE "rejection_logs" ADD CONSTRAINT "rejection_logs_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
