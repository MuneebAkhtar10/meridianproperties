-- Global tenant-app grants: one row per module, applied to every tenant.

DO $$ BEGIN
  CREATE TYPE "TenantModule" AS ENUM (
    'dashboard',
    'requests',
    'finances',
    'documents',
    'report'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "tenant_module_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "module" "TenantModule" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_module_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_module_grants_module_key" ON "tenant_module_grants"("module");

-- Existing tenants keep every section until a super admin tightens it.
INSERT INTO "tenant_module_grants" ("id", "module")
SELECT gen_random_uuid(), m.module
FROM (SELECT unnest(enum_range(NULL::"TenantModule")) AS module) m
ON CONFLICT ("module") DO NOTHING;
