-- Tracks the state of an in-progress WhatsApp conversation, keyed by phone
-- number: a tenant being walked through reporting an issue, or a worker
-- acting on an assigned task via WhatsApp replies.

CREATE TYPE "WhatsappFlow" AS ENUM ('new_request', 'worker_task', 'awaiting_completion_code');

CREATE TABLE "whatsapp_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "phone" TEXT NOT NULL,
  "user_id" UUID,
  "flow" "WhatsappFlow",
  "step" TEXT,
  "data" JSONB,
  "task_id" UUID,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- Prisma's @updatedAt has no DB-side default, but existing rows still need a
-- value for the NOT NULL column above; there are none yet on a fresh table,
-- so this is only a safety net if this migration is ever run non-fresh.
ALTER TABLE "whatsapp_sessions" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "whatsapp_sessions_phone_key" ON "whatsapp_sessions"("phone");
CREATE INDEX "whatsapp_sessions_user_id_idx" ON "whatsapp_sessions"("user_id");

ALTER TABLE "whatsapp_sessions"
  ADD CONSTRAINT "whatsapp_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_sessions"
  ADD CONSTRAINT "whatsapp_sessions_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "maintenance_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
