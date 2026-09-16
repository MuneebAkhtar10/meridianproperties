/**
 * Push-only sync for the property/tenant/tenancy/maintenance/charge tables in Dynamics
 * (`cr3d4_property`, `cr3d4_unit`, `cr3d4_tenant`, `cr3d4_tenancy`,
 * `cr3d4_maintenancerequest`, `cr3d4_charge`). Payments use `lib/dynamics/sync.ts`
 * instead, because that side also needs to read back for the dashboard and de-duplicate
 * by reference — these are simpler one-way "record what just happened" writes, fired
 * from the same action that already committed the change in our own database.
 *
 * Every field is a plain string, matching how the tables were created (see
 * `PROJECT_ROOT`-adjacent `scripts/create-dynamics-tables.js` history) — no lookups, no
 * typed columns, so this needs no schema changes on the Dynamics side.
 */

interface TokenCache { value: string; expiresAt: number }
let tokenCache: TokenCache | null = null;

function isDynamicsConfigured(): boolean {
  return (
    !!process.env.DYNAMICS_TENANT_ID &&
    !!process.env.DYNAMICS_CLIENT_ID &&
    !!process.env.DYNAMICS_CLIENT_SECRET &&
    !!process.env.DYNAMICS_RESOURCE_URL
  );
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value;

  const tenantId = process.env.DYNAMICS_TENANT_ID!;
  const clientId = process.env.DYNAMICS_CLIENT_ID!;
  const clientSecret = process.env.DYNAMICS_CLIENT_SECRET!;
  const resourceUrl = process.env.DYNAMICS_RESOURCE_URL!;

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: `${resourceUrl}/.default`,
    }),
  });
  if (!res.ok) throw new Error(`Dynamics auth failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  tokenCache = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.value;
}

/**
 * Creates one row in the given Dataverse table. A no-op (rather than an error) when
 * Dynamics isn't configured, since every call site fires this best-effort from inside an
 * action whose own database write already succeeded — a missing `.env` shouldn't read as
 * a sync failure worth logging.
 */
async function createRecord(entitySet: string, fields: Record<string, string>): Promise<{ id: string } | null> {
  if (!isDynamicsConfigured()) return null;

  const resourceUrl = process.env.DYNAMICS_RESOURCE_URL!;
  const token = await getAccessToken();
  const res = await fetch(`${resourceUrl}/api/data/v9.2/${entitySet}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: "return=representation",
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Dataverse POST ${entitySet} failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  const idKey = Object.keys(body).find((k) => k.endsWith("id") && typeof body[k] === "string");
  return { id: idKey ? body[idKey] : "" };
}

export function pushPropertyToDynamics(input: { name: string; address: string; governorate: string | null; propertyType: string; status: string }) {
  return createRecord("cr3d4_properties", {
    cr3d4_name: input.name,
    cr3d4_address: input.address,
    cr3d4_governorate: input.governorate ?? "",
    cr3d4_propertytype: input.propertyType,
    cr3d4_status: input.status,
  });
}

export function pushUnitToDynamics(input: { label: string; propertyName: string; bedrooms: number | null; status: string }) {
  return createRecord("cr3d4_units", {
    cr3d4_name: input.label,
    cr3d4_property: input.propertyName,
    cr3d4_bedrooms: input.bedrooms != null ? String(input.bedrooms) : "",
    cr3d4_status: input.status,
  });
}

export function pushTenantToDynamics(input: { name: string; email: string; phone: string | null }) {
  return createRecord("cr3d4_tenants", {
    cr3d4_name: input.name,
    cr3d4_email: input.email,
    cr3d4_phone: input.phone ?? "",
  });
}

export function pushTenancyToDynamics(input: { label: string; tenantName: string; unitLabel: string; propertyName: string; monthlyRent: string; startDate: string; status: string }) {
  return createRecord("cr3d4_tenancies", {
    cr3d4_name: input.label,
    cr3d4_tenant: input.tenantName,
    cr3d4_unit: input.unitLabel,
    cr3d4_property: input.propertyName,
    cr3d4_monthlyrent: input.monthlyRent,
    cr3d4_startdate: input.startDate,
    cr3d4_status: input.status,
  });
}

export function pushMaintenanceRequestToDynamics(input: { title: string; unitLabel: string; tenantName: string; priority: string; status: string; description: string }) {
  return createRecord("cr3d4_maintenancerequests", {
    cr3d4_name: input.title,
    cr3d4_unit: input.unitLabel,
    cr3d4_tenant: input.tenantName,
    cr3d4_priority: input.priority,
    cr3d4_status: input.status,
    cr3d4_description: input.description.slice(0, 2000),
  });
}

export function pushChargeToDynamics(input: { label: string; tenantName: string; unitLabel: string; chargeType: string; amount: string; dueDate: string; status: string }) {
  return createRecord("cr3d4_charges", {
    cr3d4_name: input.label,
    cr3d4_tenant: input.tenantName,
    cr3d4_unit: input.unitLabel,
    cr3d4_chargetype: input.chargeType,
    cr3d4_amount: input.amount,
    cr3d4_duedate: input.dueDate,
    cr3d4_status: input.status,
  });
}
