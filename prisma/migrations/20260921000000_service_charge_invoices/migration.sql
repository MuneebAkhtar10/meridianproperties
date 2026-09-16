-- Owner service charge invoices: a real per-unit running balance (positive =
-- owed by the owner, negative = credit), plus letterhead/bank details on the
-- property and a mailing address on the owner, so a formal invoice PDF can
-- be generated and downloaded per unit per period.

ALTER TABLE "units"
  ADD COLUMN "entitlements" INTEGER,
  ADD COLUMN "service_charge_balance" DECIMAL(14,3) NOT NULL DEFAULT 0;

ALTER TABLE "properties"
  ADD COLUMN "association_registration_number" TEXT,
  ADD COLUMN "association_phone" TEXT,
  ADD COLUMN "bank_name" TEXT,
  ADD COLUMN "bank_swift_code" TEXT,
  ADD COLUMN "bank_account_number" TEXT,
  ADD COLUMN "payment_reference" TEXT,
  ADD COLUMN "cheque_payable_to" TEXT,
  ADD COLUMN "po_box" TEXT;

ALTER TABLE "users" ADD COLUMN "mailing_address" TEXT;

CREATE SEQUENCE "service_charge_invoice_seq" START 1;

CREATE TABLE "service_charge_invoices" (
  "id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "issue_date" DATE NOT NULL,
  "due_date" DATE NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "previous_balance" DECIMAL(14,3) NOT NULL,
  "current_amount" DECIMAL(14,3) NOT NULL,
  "amount_payable" DECIMAL(14,3) NOT NULL,
  "closing_balance" DECIMAL(14,3) NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_charge_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_charge_invoices_invoice_number_key" ON "service_charge_invoices"("invoice_number");
CREATE INDEX "service_charge_invoices_unit_id_issue_date_idx" ON "service_charge_invoices"("unit_id", "issue_date");

ALTER TABLE "service_charge_invoices" ADD CONSTRAINT "service_charge_invoices_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_charge_invoices" ADD CONSTRAINT "service_charge_invoices_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "service_charge_payments" (
  "id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "amount" DECIMAL(14,3) NOT NULL,
  "paid_at" DATE NOT NULL,
  "note" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_charge_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "service_charge_payments_unit_id_paid_at_idx" ON "service_charge_payments"("unit_id", "paid_at");

ALTER TABLE "service_charge_payments" ADD CONSTRAINT "service_charge_payments_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_charge_payments" ADD CONSTRAINT "service_charge_payments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
