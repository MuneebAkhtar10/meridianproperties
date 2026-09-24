ALTER TABLE "whatsapp_sessions" ADD COLUMN "last_inbound_at" TIMESTAMP(3);
-- Best available estimate for existing conversations.
UPDATE "whatsapp_sessions" SET "last_inbound_at" = "updated_at";
