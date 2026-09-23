-- Rawazen Services invoices (Independent / Building Management): sequential
-- numbers plus a snapshot of maintenance/expense and rent-received lines.

CREATE SEQUENCE IF NOT EXISTS "services_invoice_seq" START 1;

CREATE TABLE IF NOT EXISTS "services_invoices" (
  "id" UUID NOT NULL,
  "invoice_number" INTEGER NOT NULL,
  "property_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "tenancy_id" UUID,
  "issue_date" DATE NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "billed_name" TEXT NOT NULL,
  "billed_address" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'issued',
  "total" DECIMAL(14,3) NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "services_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "services_invoices_invoice_number_key" ON "services_invoices"("invoice_number");
CREATE INDEX IF NOT EXISTS "services_invoices_property_id_issue_date_idx" ON "services_invoices"("property_id", "issue_date");
CREATE INDEX IF NOT EXISTS "services_invoices_unit_id_issue_date_idx" ON "services_invoices"("unit_id", "issue_date");

DO $$ BEGIN
  ALTER TABLE "services_invoices" ADD CONSTRAINT "services_invoices_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "services_invoices" ADD CONSTRAINT "services_invoices_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "services_invoices" ADD CONSTRAINT "services_invoices_tenancy_id_fkey"
    FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "services_invoices" ADD CONSTRAINT "services_invoices_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "services_invoice_lines" (
  "id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "qty" DECIMAL(10,2) NOT NULL DEFAULT 1,
  "item" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "unit_price" DECIMAL(14,3) NOT NULL,

  CONSTRAINT "services_invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "services_invoice_lines_invoice_id_idx" ON "services_invoice_lines"("invoice_id");

DO $$ BEGIN
  ALTER TABLE "services_invoice_lines" ADD CONSTRAINT "services_invoice_lines_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "services_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
