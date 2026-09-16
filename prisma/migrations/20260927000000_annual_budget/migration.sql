-- OA Annual Budget: a reference-only estimated budget per property per
-- financial year, with income and expense line items.

CREATE TABLE "annual_budgets" (
  "id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "annual_budgets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "annual_budgets_property_id_year_key" ON "annual_budgets"("property_id", "year");

ALTER TABLE "annual_budgets" ADD CONSTRAINT "annual_budgets_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "annual_budgets" ADD CONSTRAINT "annual_budgets_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "budget_income_lines" (
  "id" UUID NOT NULL,
  "budget_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "no_of_units" INTEGER NOT NULL,
  "amount" DECIMAL(14,3) NOT NULL,
  "total_yearly" DECIMAL(14,3) NOT NULL,

  CONSTRAINT "budget_income_lines_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "budget_income_lines" ADD CONSTRAINT "budget_income_lines_budget_id_fkey"
  FOREIGN KEY ("budget_id") REFERENCES "annual_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "budget_expense_lines" (
  "id" UUID NOT NULL,
  "budget_id" UUID NOT NULL,
  "fund_id" UUID,
  "description" TEXT NOT NULL,
  "rate_per_month" DECIMAL(14,3) NOT NULL,
  "rate_per_year" DECIMAL(14,3) NOT NULL,

  CONSTRAINT "budget_expense_lines_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "budget_expense_lines" ADD CONSTRAINT "budget_expense_lines_budget_id_fkey"
  FOREIGN KEY ("budget_id") REFERENCES "annual_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_expense_lines" ADD CONSTRAINT "budget_expense_lines_fund_id_fkey"
  FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
