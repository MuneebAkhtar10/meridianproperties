-- Add property type (apartment vs villa) so unit generation and layout can
-- differ: apartments are grouped by floor, villas normally are not.
CREATE TYPE "PropertyType" AS ENUM ('apartment', 'villa');

ALTER TABLE "properties"
  ADD COLUMN "type" "PropertyType" NOT NULL DEFAULT 'apartment';
