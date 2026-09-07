-- Guard against pre-existing duplicate phone numbers before adding the
-- unique constraint (keeps the oldest account's phone, clears the rest so
-- the migration doesn't fail on data that predates this rule).
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC) AS rn
  FROM "users"
  WHERE phone IS NOT NULL
)
UPDATE "users"
SET phone = NULL
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
