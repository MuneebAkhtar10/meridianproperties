-- A more specific expense line item within its category (e.g. "Cleaning
-- Service" within "Services", "Cleaning Supplies" within "Supplies") — a
-- plain column rather than a DB enum since the allowed list is per category;
-- see lib/expenses.ts EXPENSE_SUBCATEGORIES.
ALTER TABLE "expenses" ADD COLUMN "subcategory" TEXT;
