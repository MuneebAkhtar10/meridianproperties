-- Tenant/rental side (spec #24-34): Agreement dates, "who holds the money"
-- distinction for both rent payments and expenses, cheque details on the
-- tenant-side Payment (parity with ServiceChargePayment), and a new
-- "Agreement Registration" expense category.

CREATE TYPE "PaymentCollector" AS ENUM ('management', 'owner');

-- Tenancy: agreement's own start date (distinct from move-in), and who pays.
ALTER TABLE "tenancies" ADD COLUMN "agreement_start_date" DATE;
ALTER TABLE "tenancies" ADD COLUMN "paid_by" TEXT;

-- Payment: who holds the money, who physically received it, and full
-- cheque/transaction paper trail (mirrors service_charge_payments).
ALTER TABLE "payments" ADD COLUMN "collected_by" "PaymentCollector" NOT NULL DEFAULT 'management';
ALTER TABLE "payments" ADD COLUMN "received_by_name" TEXT;
ALTER TABLE "payments" ADD COLUMN "transaction_number" TEXT;
ALTER TABLE "payments" ADD COLUMN "cheque_number" TEXT;
ALTER TABLE "payments" ADD COLUMN "cheque_date" DATE;
ALTER TABLE "payments" ADD COLUMN "bank" TEXT;
ALTER TABLE "payments" ADD COLUMN "clearance_status" TEXT;
CREATE INDEX "payments_method_cheque_date_idx" ON "payments"("method", "cheque_date");

-- Expense: who actually paid it (management float vs. owner directly).
ALTER TABLE "expenses" ADD COLUMN "paid_by" "PaymentCollector" NOT NULL DEFAULT 'management';

-- Agreement Registration must remain its own reporting head, not folded
-- into general Administration.
INSERT INTO "expense_category_types" ("id", "name", "label", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'agreement_registration', 'Agreement Registration', CURRENT_TIMESTAMP + INTERVAL '11 second', CURRENT_TIMESTAMP);

INSERT INTO "expense_subcategory_types" ("id", "category_id", "label", "created_at")
SELECT gen_random_uuid(), c."id", 'Other', CURRENT_TIMESTAMP
FROM "expense_category_types" c
WHERE c."name" = 'agreement_registration';
