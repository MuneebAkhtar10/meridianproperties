import type { DynamicsClient, DynamicsOrder } from "./types";

/**
 * A stand-in Dynamics 365 (Dataverse) environment.
 *
 * Mirrors the real `cr3d4_portalorder` custom table, in memory, so the dashboard and
 * sync logic work with no credentials at all. `client.ts` swaps this for `real.ts`
 * the moment `DYNAMICS_TENANT_ID` etc. are set — nothing above this file changes.
 */

const orders: DynamicsOrder[] = [
  { id: "d1000001-0000-0000-0000-000000000001", reference: "SO-10021", customerName: "Meridian Lending Group", amount: 15000 },
  { id: "d1000001-0000-0000-0000-000000000002", reference: "SO-10022", customerName: "Cornerstone Finance", amount: 8600 },
  { id: "d1000001-0000-0000-0000-000000000003", reference: "SO-10023", customerName: "Meridian Lending Group", amount: 4200 },
  { id: "d1000001-0000-0000-0000-000000000004", reference: "SO-10024", customerName: "Arbor Bridging Ltd", amount: 12500 },
];

/** Real Dataverse has ~150-300ms of API latency; matching it keeps the demo's loading state honest. */
function latency() {
  return new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 150));
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function createMockDynamicsClient(): DynamicsClient {
  return {
    source: "mock",

    async listOrders() {
      await latency();
      return [...orders];
    },

    async createOrder({ reference, customerName, amount }) {
      await latency();
      const order: DynamicsOrder = { id: uuid(), reference, customerName, amount };
      orders.push(order);
      return order;
    },
  };
}
