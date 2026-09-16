-- Real OA fund accounting: a Fund lookup, a per-unit-per-fund running
-- balance, invoice/payment fund tagging, and richer payment paper-trail
-- fields — instead of treating every amount as one combined balance.
--
-- Backfill strategy: every fund-aware column is added nullable first, then
-- every EXISTING invoice/payment is retroactively assigned to a seeded
-- "General Administrative Fund" (so no historical data is lost or
-- reclassified incorrectly), and one unit_fund_balances row is created per
-- unit under that fund equal to its current service_charge_balance — only
-- then are the NOT NULL constraints that the schema expects added.

CREATE TABLE "funds" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "funds_name_key" ON "funds"("name");

INSERT INTO "funds" ("id", "name", "label") VALUES
  ('00000000-0000-4000-a000-000000000001', 'general_administrative', 'General Administrative Fund'),
  ('00000000-0000-4000-a000-000000000002', 'admin', 'Admin Fund'),
  ('00000000-0000-4000-a000-000000000003', 'sinking', 'Sinking Fund');

CREATE TABLE "unit_fund_balances" (
  "unit_id" UUID NOT NULL,
  "fund_id" UUID NOT NULL,
  "balance" DECIMAL(14,3) NOT NULL DEFAULT 0,

  CONSTRAINT "unit_fund_balances_pkey" PRIMARY KEY ("unit_id", "fund_id")
);
CREATE INDEX "unit_fund_balances_fund_id_idx" ON "unit_fund_balances"("fund_id");
ALTER TABLE "unit_fund_balances" ADD CONSTRAINT "unit_fund_balances_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_fund_balances" ADD CONSTRAINT "unit_fund_balances_fund_id_fkey"
  FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed one balance row per existing unit, under the General Administrative
-- Fund, matching its current total exactly.
INSERT INTO "unit_fund_balances" ("unit_id", "fund_id", "balance")
  SELECT "id", '00000000-0000-4000-a000-000000000001', "service_charge_balance" FROM "units";

-- ── service_charge_invoices: add fund_id (nullable for now) + grace_days ──
ALTER TABLE "service_charge_invoices" ADD COLUMN "fund_id" UUID;
ALTER TABLE "service_charge_invoices" ADD COLUMN "grace_days" INTEGER NOT NULL DEFAULT 0;
UPDATE "service_charge_invoices" SET "fund_id" = '00000000-0000-4000-a000-000000000001';
ALTER TABLE "service_charge_invoices" ALTER COLUMN "fund_id" SET NOT NULL;
CREATE INDEX "service_charge_invoices_fund_id_idx" ON "service_charge_invoices"("fund_id");
ALTER TABLE "service_charge_invoices" ADD CONSTRAINT "service_charge_invoices_fund_id_fkey"
  FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "service_charge_invoice_lines" (
  "id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "fund_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "unit_rate" DECIMAL(14,3) NOT NULL,
  "qty" DECIMAL(10,2) NOT NULL DEFAULT 1,
  "total" DECIMAL(14,3) NOT NULL,

  CONSTRAINT "service_charge_invoice_lines_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "service_charge_invoice_lines" ADD CONSTRAINT "service_charge_invoice_lines_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "service_charge_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_charge_invoice_lines" ADD CONSTRAINT "service_charge_invoice_lines_fund_id_fkey"
  FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill one line per existing invoice, matching its own totals exactly.
INSERT INTO "service_charge_invoice_lines" ("id", "invoice_id", "fund_id", "description", "unit_rate", "qty", "total")
  SELECT gen_random_uuid(), "id", "fund_id", 'Service Charge', "current_amount", 1, "current_amount"
  FROM "service_charge_invoices";

-- ── service_charge_payments: fund tag + paper-trail fields ──
ALTER TABLE "service_charge_payments" ADD COLUMN "fund_id" UUID;
ALTER TABLE "service_charge_payments" ADD COLUMN "transaction_number" TEXT;
ALTER TABLE "service_charge_payments" ADD COLUMN "payment_method" "PaymentMethod";
ALTER TABLE "service_charge_payments" ADD COLUMN "cheque_number" TEXT;
ALTER TABLE "service_charge_payments" ADD COLUMN "cheque_date" DATE;
ALTER TABLE "service_charge_payments" ADD COLUMN "bank" TEXT;
ALTER TABLE "service_charge_payments" ADD COLUMN "clearance_status" TEXT;
-- Existing payments retroactively tagged to the General fund too, so the
-- new per-fund UI shows a complete history rather than an "untagged" gap.
UPDATE "service_charge_payments" SET "fund_id" = '00000000-0000-4000-a000-000000000001';
CREATE INDEX "service_charge_payments_fund_id_idx" ON "service_charge_payments"("fund_id");
ALTER TABLE "service_charge_payments" ADD CONSTRAINT "service_charge_payments_fund_id_fkey"
  FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
