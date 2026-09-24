ALTER TABLE "expenses" ADD COLUMN "invoice_id" UUID;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "service_charge_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "expenses_invoice_id_idx" ON "expenses"("invoice_id");
