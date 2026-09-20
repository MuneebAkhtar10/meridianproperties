-- AlterTable
ALTER TABLE "ownership_transfers" ADD COLUMN "kept_installment_plan" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "service_charge_invoices" ADD COLUMN "billed_owner_id" UUID;

-- AlterTable
ALTER TABLE "service_charge_payments" ADD COLUMN "billed_owner_id" UUID;

-- AlterTable
ALTER TABLE "service_charge_installment_plans" ADD COLUMN "source_invoice_id" UUID;

-- AddForeignKey
ALTER TABLE "service_charge_invoices" ADD CONSTRAINT "service_charge_invoices_billed_owner_id_fkey" FOREIGN KEY ("billed_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_charge_payments" ADD CONSTRAINT "service_charge_payments_billed_owner_id_fkey" FOREIGN KEY ("billed_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_charge_installment_plans" ADD CONSTRAINT "service_charge_installment_plans_source_invoice_id_fkey" FOREIGN KEY ("source_invoice_id") REFERENCES "service_charge_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
