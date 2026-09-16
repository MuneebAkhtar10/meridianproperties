import type { DynamicsClient, DynamicsOrder } from "./types";

/**
 * Live Dynamics 365, over the Dataverse Web API, against the custom
 * `cr3d4_portalorder` table (entity set `cr3d4_portalorders`).
 *
 * Auth is the OAuth2 client-credentials grant against Azure AD, scoped to the
 * environment's own URL with `/.default` — Dataverse uses the standard
 * `/oauth2/v2.0/token` endpoint and `.default` scope, unlike classic F&O's OData
 * surface, which took a bare `resource` parameter instead.
 */

const API_VERSION = "v9.2";
const ENTITY_SET = "cr3d4_portalorders";

interface TokenCache { value: string; expiresAt: number }
let tokenCache: TokenCache | null = null;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value;

  const tenantId = env("DYNAMICS_TENANT_ID");
  const clientId = env("DYNAMICS_CLIENT_ID");
  const clientSecret = env("DYNAMICS_CLIENT_SECRET");
  const resourceUrl = env("DYNAMICS_RESOURCE_URL");

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

async function dataverseFetch(path: string, init: RequestInit = {}) {
  const resourceUrl = env("DYNAMICS_RESOURCE_URL");
  const token = await getAccessToken();
  const res = await fetch(`${resourceUrl}/api/data/${API_VERSION}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Dataverse ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

interface RawOrder {
  cr3d4_portalorderid: string;
  cr3d4_newcolumn: string | null;
  cr3d4_customername: string | null;
  cr3d4_amount: string | null;
}

function toOrder(raw: RawOrder): DynamicsOrder {
  return {
    id: raw.cr3d4_portalorderid,
    reference: raw.cr3d4_newcolumn ?? "(no reference)",
    customerName: raw.cr3d4_customername ?? "(no customer)",
    amount: Number(raw.cr3d4_amount ?? 0),
  };
}

export function createRealDynamicsClient(): DynamicsClient {
  return {
    source: "live",

    async listOrders() {
      const res = await dataverseFetch(
        `${ENTITY_SET}?$select=cr3d4_portalorderid,cr3d4_newcolumn,cr3d4_customername,cr3d4_amount&$top=50&$orderby=createdon desc`
      );
      const body = await res.json();
      return (body.value as RawOrder[]).map(toOrder);
    },

    async createOrder({ reference, customerName, amount }) {
      const res = await dataverseFetch(ENTITY_SET, {
        method: "POST",
        body: JSON.stringify({
          cr3d4_newcolumn: reference,
          cr3d4_customername: customerName,
          cr3d4_amount: String(amount),
        }),
      });
      const body = await res.json();
      return toOrder(body);
    },
  };
}
