-- Expenses: money the management company spent, drawn from the service
-- charge, logged against a property or a specific unit.

CREATE TYPE "ExpenseCategory" AS ENUM (
  'administration', 'maintenance', 'miscellaneous', 'other',
  'professional_services', 'repairs_maintenance', 'services', 'supplies', 'utilities'
);

CREATE TABLE "expenses" (
  "id" UUID NOT NULL,
  "property_id" UUID,
  "unit_id" UUID,
  "category" "ExpenseCategory" NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(14,3) NOT NULL,
  "date" DATE NOT NULL,
  "receipt_file_name" TEXT,
  "receipt_file_path" TEXT,
  "receipt_file_type" TEXT,
  "receipt_file_size" INTEGER,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expenses_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "expenses_exactly_one_target" CHECK (num_nonnulls("property_id", "unit_id") = 1)
);

CREATE INDEX "expenses_property_id_date_idx" ON "expenses"("property_id", "date");
CREATE INDEX "expenses_unit_id_date_idx" ON "expenses"("unit_id", "date");
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
