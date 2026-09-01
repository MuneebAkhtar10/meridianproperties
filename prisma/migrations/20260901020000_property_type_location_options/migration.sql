-- Per-property-type list of "where is the problem?" choices for the
-- maintenance report form. Defaults to a generic commercial-style list for
-- any type (so a brand new type like "Office" or "Shop" gets something
-- sensible immediately), then the two seeded residential types are backed
-- into their familiar room list.
ALTER TABLE "property_types"
  ADD COLUMN "location_options" TEXT[] NOT NULL
  DEFAULT ARRAY['Main area', 'Storeroom', 'Entrance', 'Whole space', 'Other'];

UPDATE "property_types"
SET "location_options" = ARRAY[
  'Kitchen', 'Bathroom', 'Bedroom', 'Living room', 'Balcony', 'Hallway',
  'Whole apartment', 'Other'
]
WHERE "name" = 'apartment';

UPDATE "property_types"
SET "location_options" = ARRAY[
  'Living room', 'Bedroom', 'Bathroom', 'Kitchen', 'Garden / yard',
  'Garage', 'Whole villa', 'Other'
]
WHERE "name" = 'villa';

UPDATE "property_types"
SET "location_options" = ARRAY[
  'Sales floor', 'Storeroom', 'Entrance / shutter', 'Restroom',
  'Electrical / AC', 'Whole shop', 'Other'
]
WHERE "name" = 'shop';

UPDATE "property_types"
SET "location_options" = ARRAY[
  'Workstation area', 'Reception', 'Meeting room', 'Restroom', 'Pantry',
  'Server / IT room', 'Whole office', 'Other'
]
WHERE "name" = 'office';
