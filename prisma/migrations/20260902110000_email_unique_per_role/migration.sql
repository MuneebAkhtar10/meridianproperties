-- Drop the old "email globally unique" constraint...
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "users_email_key";

-- ...and replace it with "email unique per role" — a tenant and a worker
-- (etc.) can now share an email, but two accounts of the same role can't.
CREATE UNIQUE INDEX "users_email_user_type_key" ON "users"("email", "user_type");
