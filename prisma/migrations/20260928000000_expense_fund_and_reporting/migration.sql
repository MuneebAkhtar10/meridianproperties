-- OA Expenses (spec #20) gains VAT, a required Fund, a payment reference,
-- and notes. Every existing expense is backfilled to General Administrative
-- Fund — same reclassify-via-rename idiom used for the funds migration.
ALTER TABLE "expenses" ADD COLUMN "vat_amount" DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN "fund_id" UUID;
ALTER TABLE "expenses" ADD COLUMN "payment_reference" TEXT;
ALTER TABLE "expenses" ADD COLUMN "notes" TEXT;

UPDATE "expenses" SET "fund_id" = '00000000-0000-4000-a000-000000000001';

ALTER TABLE "expenses" ALTER COLUMN "fund_id" SET NOT NULL;
CREATE INDEX "expenses_fund_id_idx" ON "expenses"("fund_id");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_fund_id_fkey"
  FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OA Collection Position (spec #18) needs a single "last reminder sent"
-- timestamp regardless of whether the cron or the new manual "Notify
-- Owner" action sent it.
ALTER TABLE "units" ADD COLUMN "service_charge_last_reminder_at" TIMESTAMP(3);

-- Split "Repairs & Maintenance" into Building/Equipment (spec #22's
-- expenditure breakdown) and add "Other Revenue" — existing expenses under
-- the old single category keep their category_id, so they silently become
-- "Building" (the more common of the two in practice).
UPDATE "expense_category_types" SET "label" = 'Repairs & Maintenance – Building', "updated_at" = CURRENT_TIMESTAMP
  WHERE "name" = 'repairs_maintenance';

INSERT INTO "expense_category_types" ("id", "name", "label", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'repairs_maintenance_equipment', 'Repairs & Maintenance – Equipment', CURRENT_TIMESTAMP + INTERVAL '9 second', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'other_revenue', 'Other Revenue', CURRENT_TIMESTAMP + INTERVAL '10 second', CURRENT_TIMESTAMP);

INSERT INTO "expense_subcategory_types" ("id", "category_id", "label", "created_at")
SELECT gen_random_uuid(), c."id", s.label, CURRENT_TIMESTAMP
FROM "expense_category_types" c
JOIN (VALUES
  ('repairs_maintenance_equipment', 'Other'),
  ('other_revenue', 'Other')
) AS s(category_name, label) ON s.category_name = c."name";
