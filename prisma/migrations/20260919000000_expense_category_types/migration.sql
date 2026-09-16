-- Expense categories move from a fixed enum to an admin-manageable table
-- (same idiom as property_types), so the "Suppliers" screen can add new
-- categories/types without a code change. Existing expenses keep their
-- category by matching the new table's "name" slug to the old enum value.

CREATE TABLE "expense_category_types" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "expense_category_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "expense_category_types_name_key" ON "expense_category_types"("name");

CREATE TABLE "expense_subcategory_types" (
  "id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "expense_subcategory_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "expense_subcategory_types_category_id_label_key" ON "expense_subcategory_types"("category_id", "label");
CREATE INDEX "expense_subcategory_types_category_id_idx" ON "expense_subcategory_types"("category_id");

ALTER TABLE "expense_subcategory_types" ADD CONSTRAINT "expense_subcategory_types_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "expense_category_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the categories in the same order the app used to hardcode them, with
-- distinct timestamps so `ORDER BY created_at ASC` reproduces that order.
INSERT INTO "expense_category_types" ("id", "name", "label", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'administration',        'Administration',        CURRENT_TIMESTAMP + INTERVAL '0 second', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'maintenance',            'Maintenance',            CURRENT_TIMESTAMP + INTERVAL '1 second', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'miscellaneous',          'Miscellaneous',          CURRENT_TIMESTAMP + INTERVAL '2 second', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'professional_services',  'Professional Services',  CURRENT_TIMESTAMP + INTERVAL '3 second', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'repairs_maintenance',    'Repairs & Maintenance',  CURRENT_TIMESTAMP + INTERVAL '4 second', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'services',               'Services',               CURRENT_TIMESTAMP + INTERVAL '5 second', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'supplies',               'Supplies',               CURRENT_TIMESTAMP + INTERVAL '6 second', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'utilities',              'Utilities',              CURRENT_TIMESTAMP + INTERVAL '7 second', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'other',                  'Other',                  CURRENT_TIMESTAMP + INTERVAL '8 second', CURRENT_TIMESTAMP);

-- Seed each category's subcategory list, in order, with distinct timestamps.
INSERT INTO "expense_subcategory_types" ("id", "category_id", "label", "created_at")
SELECT gen_random_uuid(), c."id", s.label, CURRENT_TIMESTAMP + (s.ord || ' second')::interval
FROM "expense_category_types" c
JOIN (VALUES
  ('administration', 'Administrative Fees & Charges', 0),
  ('administration', 'Employment Costs', 1),
  ('administration', 'Software', 2),
  ('administration', 'Other', 3),
  ('maintenance', 'Swimming Pool Maintenance', 0),
  ('maintenance', 'Other', 1),
  ('miscellaneous', 'Insurance', 0),
  ('miscellaneous', 'Other', 1),
  ('other', 'Legal Fees', 0),
  ('other', 'Other', 1),
  ('professional_services', 'Elevator Contracts', 0),
  ('professional_services', 'Other', 1),
  ('repairs_maintenance', 'Fire Pump Service Contract', 0),
  ('repairs_maintenance', 'Air Conditioning Maintenance', 1),
  ('repairs_maintenance', 'Building Maintenance Unit', 2),
  ('repairs_maintenance', 'Intercom & Security System', 3),
  ('repairs_maintenance', 'Other', 4),
  ('services', 'Cleaning Service', 0),
  ('services', 'Government Fees', 1),
  ('services', 'Pest Control Services', 2),
  ('services', 'Audit Fees', 3),
  ('services', 'Other', 4),
  ('supplies', 'Cleaning Supplies', 0),
  ('supplies', 'Other', 1),
  ('utilities', 'Electricity', 0),
  ('utilities', 'Water (Common Area)', 1),
  ('utilities', 'Other', 2)
) AS s(category_name, label, ord) ON s.category_name = c."name";

-- Backfill expenses.category_id from the old enum column, then drop it.
ALTER TABLE "expenses" ADD COLUMN "category_id" UUID;

UPDATE "expenses" e
SET "category_id" = c."id"
FROM "expense_category_types" c
WHERE c."name" = e."category"::text;

ALTER TABLE "expenses" ALTER COLUMN "category_id" SET NOT NULL;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "expense_category_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "expenses_category_idx";
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

ALTER TABLE "expenses" DROP COLUMN "category";
DROP TYPE "ExpenseCategory";
