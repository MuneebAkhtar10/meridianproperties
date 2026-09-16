-- Real supplier (vendor) records, with which expense categories each one
-- covers, plus a supplier reference on expenses ("who was this paid to" —
-- null means "Company default", not a database row).

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "company_name" TEXT NOT NULL,
  "company_name_ar" TEXT,
  "external_reference" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "contact_person" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "address" TEXT,
  "available_for_emergencies" BOOLEAN NOT NULL DEFAULT false,
  "callout_charge" DECIMAL(14,3),
  "contract_start" DATE,
  "contract_end" DATE,
  "contract_info" TEXT,
  "notes" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "supplier_categories" (
  "supplier_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,

  CONSTRAINT "supplier_categories_pkey" PRIMARY KEY ("supplier_id", "category_id")
);
CREATE INDEX "supplier_categories_category_id_idx" ON "supplier_categories"("category_id");

ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "expense_category_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD COLUMN "supplier_id" UUID;
CREATE INDEX "expenses_supplier_id_idx" ON "expenses"("supplier_id");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
