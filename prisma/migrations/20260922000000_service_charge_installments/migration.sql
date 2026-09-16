-- Service charge installment (payment) plans: lets an owner pay off their
-- outstanding service-charge balance in scheduled parts instead of one lump
-- sum. Scoped by unit_id, same as the rest of the ledger, so a plan carries
-- forward automatically if the unit changes owners mid-schedule.

CREATE TABLE "service_charge_installment_plans" (
  "id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "total_amount" DECIMAL(14,3) NOT NULL,
  "installment_count" INTEGER NOT NULL,
  "frequency_months" INTEGER NOT NULL,
  "start_date" DATE NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at" TIMESTAMP(3),

  CONSTRAINT "service_charge_installment_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "service_charge_installment_plans_unit_id_idx" ON "service_charge_installment_plans"("unit_id");

ALTER TABLE "service_charge_installment_plans" ADD CONSTRAINT "service_charge_installment_plans_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_charge_installment_plans" ADD CONSTRAINT "service_charge_installment_plans_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "service_charge_installments" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "amount" DECIMAL(14,3) NOT NULL,
  "due_date" DATE NOT NULL,
  "paid_at" DATE,
  "payment_id" UUID,

  CONSTRAINT "service_charge_installments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_charge_installments_payment_id_key" ON "service_charge_installments"("payment_id");
CREATE UNIQUE INDEX "service_charge_installments_plan_id_sequence_key" ON "service_charge_installments"("plan_id", "sequence");

ALTER TABLE "service_charge_installments" ADD CONSTRAINT "service_charge_installments_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "service_charge_installment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_charge_installments" ADD CONSTRAINT "service_charge_installments_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "service_charge_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
