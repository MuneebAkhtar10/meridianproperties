-- Move credentials out of our own table and into Supabase Auth.
--
-- `users.id` stops being self-generated and instead equals the id Supabase
-- Auth assigns the matching `auth.users` row. The foreign key means deleting
-- someone from Supabase Auth (via the admin API) removes their profile row
-- here too, so there is exactly one place credentials live and one place a
-- deletion has to happen.

ALTER TABLE "users" DROP COLUMN "password_hash";
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_id_fkey"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
