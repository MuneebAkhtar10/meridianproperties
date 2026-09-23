-- Super admin role + per-admin module grants.

ALTER TYPE "UserType" ADD VALUE IF NOT EXISTS 'super_admin';

DO $$ BEGIN
  CREATE TYPE "AdminModule" AS ENUM (
    'dashboard',
    'onboarding',
    'properties',
    'tenancies',
    'maintenance',
    'finances',
    'service_charges',
    'invoices',
    'expenses',
    'communications',
    'reports',
    'suppliers',
    'people',
    'rejections',
    'qr_code',
    'dynamics',
    'settings'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "admin_module_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "module" "AdminModule" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_module_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_module_grants_user_id_module_key" ON "admin_module_grants"("user_id", "module");
CREATE INDEX IF NOT EXISTS "admin_module_grants_user_id_idx" ON "admin_module_grants"("user_id");

DO $$ BEGIN
  ALTER TABLE "admin_module_grants"
    ADD CONSTRAINT "admin_module_grants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing admins keep full access until a super admin tightens it.
INSERT INTO "admin_module_grants" ("id", "user_id", "module")
SELECT gen_random_uuid(), u.id, m.module
FROM "users" u
CROSS JOIN (
  SELECT unnest(enum_range(NULL::"AdminModule")) AS module
) m
WHERE u.user_type = 'admin'
ON CONFLICT ("user_id", "module") DO NOTHING;
