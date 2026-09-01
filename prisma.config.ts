import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer auto-loads .env for CLI commands.
import "dotenv/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  // CLI-only (migrate, studio, db pull) — DIRECT_URL, not the pooled
  // DATABASE_URL, because migrations need a session-level connection that
  // Supabase's transaction pooler (Supavisor) can't provide. The app itself
  // never reads this: lib/prisma.ts builds its own client straight off
  // DATABASE_URL for request-time queries.
  datasource: {
    url: env("DIRECT_URL"),
  },
});
