import "server-only";

import { prisma } from "@/lib/prisma";

let schemaReady = false;

export async function ensureCommunicationSchema() {
  if (schemaReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS communication_logs (
      id UUID NOT NULL,
      channel TEXT NOT NULL,
      direction TEXT NOT NULL,
      about_kind TEXT NOT NULL,
      party_user_id UUID,
      supplier_id UUID,
      party_name TEXT NOT NULL,
      party_phone TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      occurred_at TIMESTAMP(3) NOT NULL,
      created_by UUID NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT communication_logs_pkey PRIMARY KEY (id)
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS communication_logs_occurred_at_idx ON communication_logs (occurred_at)`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS communication_logs_channel_idx ON communication_logs (channel)`,
  );
  schemaReady = true;
}
