-- Every existing admin keeps the ability to download PDFs and spreadsheets
-- they already had, unconditionally, before this permission existed.
INSERT INTO "admin_module_grants" ("id", "user_id", "module", "created_at")
SELECT gen_random_uuid(), u."id", m.module, now()
FROM "users" u
CROSS JOIN (VALUES
  ('download_pdf'::"AdminModule"),
  ('download_excel'::"AdminModule")
) AS m(module)
WHERE u."user_type" IN ('admin', 'super_admin')
ON CONFLICT DO NOTHING;
