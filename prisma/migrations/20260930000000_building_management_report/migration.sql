-- Spec #36 "Building Management Summary Report" needs a distinct property
-- type: unlike the existing "building" type (an owners association — only
-- ever charges service fees, never rent), a "Building Management" property
-- is a whole rental building Rawazen manages on the landlord's behalf,
-- collecting rent (sometimes via the company, sometimes the landlord
-- collects directly) and paying its expenses, then reconciling the two.
-- No new columns are needed for the report itself — it's built entirely
-- from the existing Payment.collectedBy / Expense.paidBy / ExpenseUnit data
-- already added for the tenant/rental modules and expense reporting.
INSERT INTO "property_types"
  ("id", "name", "label", "unit_noun_singular", "unit_noun_plural", "unit_prefix", "has_floors", "has_bedrooms", "updated_at")
VALUES
  (gen_random_uuid(), 'building_management', 'Building Management', 'Unit', 'Units', 'Unit', true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
