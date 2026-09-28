-- Every admin who currently has the "people" module keeps full visibility
-- of every person category — nobody's People page silently empties out
-- just because this permission now exists.
INSERT INTO "admin_module_grants" ("id", "user_id", "module", "created_at")
SELECT gen_random_uuid(), g."user_id", m.module, now()
FROM "admin_module_grants" g
CROSS JOIN (VALUES
  ('see_workers_in_house'::"AdminModule"),
  ('see_workers_third_party'::"AdminModule"),
  ('see_owners'::"AdminModule"),
  ('see_tenants'::"AdminModule")
) AS m(module)
WHERE g."module" = 'people'
ON CONFLICT DO NOTHING;
