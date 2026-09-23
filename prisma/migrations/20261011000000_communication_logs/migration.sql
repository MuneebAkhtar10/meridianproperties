CREATE TABLE IF NOT EXISTS "communication_logs" (
  "id" UUID NOT NULL,
  "channel" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "about_kind" TEXT NOT NULL,
  "party_user_id" UUID,
  "supplier_id" UUID,
  "party_name" TEXT NOT NULL,
  "party_phone" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "communication_logs_occurred_at_idx" ON "communication_logs"("occurred_at");
CREATE INDEX IF NOT EXISTS "communication_logs_channel_idx" ON "communication_logs"("channel");
CREATE INDEX IF NOT EXISTS "communication_logs_created_by_idx" ON "communication_logs"("created_by");

DO $$ BEGIN
  ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_party_user_id_fkey"
    FOREIGN KEY ("party_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
