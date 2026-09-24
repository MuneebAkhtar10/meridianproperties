-- Existing admins who can already open Properties keep every property-page
-- button; new per-button permissions only restrict from here on.
INSERT INTO admin_module_grants (id, user_id, module, created_at)
SELECT gen_random_uuid(), g.user_id, f.feature::"AdminModule", now()
FROM admin_module_grants g
CROSS JOIN (VALUES ('prop_building_contracts'),('prop_tenancy_terms'),('prop_tenant_report'),('prop_owner_report'),('prop_landlord_statement'),('prop_services_invoice'),('prop_annual_budget'),('prop_building_expenses'),('prop_management_report'),('prop_suppliers'),('prop_expenses'),('prop_rent_position'),('prop_rent_summary'),('prop_invoices'),('prop_unit_ledgers'),('prop_service_charge'),('prop_collection_position'),('prop_cash_flow')) AS f(feature)
WHERE g.module = 'properties'
ON CONFLICT (user_id, module) DO NOTHING;
