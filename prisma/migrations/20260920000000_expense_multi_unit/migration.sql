-- A shared expense logged against several units (e.g. one OMR 180 invoice
-- covering 3 blocks) must stay ONE row with the amount as entered, not one
-- row per unit repeating the full amount. expenses.unit_id (a single nullable
-- FK) can only ever point at one unit, so it's replaced with a many-to-many
-- join table.

CREATE TABLE "expense_units" (
  "expense_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,

  CONSTRAINT "expense_units_pkey" PRIMARY KEY ("expense_id", "unit_id")
);
CREATE INDEX "expense_units_unit_id_idx" ON "expense_units"("unit_id");

ALTER TABLE "expense_units" ADD CONSTRAINT "expense_units_expense_id_fkey"
  FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_units" ADD CONSTRAINT "expense_units_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry forward every existing single-unit expense into the join table.
INSERT INTO "expense_units" ("expense_id", "unit_id")
SELECT "id", "unit_id" FROM "expenses" WHERE "unit_id" IS NOT NULL;

ALTER TABLE "expenses" DROP CONSTRAINT "expenses_exactly_one_target";
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_unit_id_fkey";
DROP INDEX "expenses_unit_id_date_idx";
ALTER TABLE "expenses" DROP COLUMN "unit_id";
