/**
 * Dynamics 365 (Dataverse) — shapes.
 *
 * `cr3d4_portalorder` is a custom table created specifically for this integration
 * (Reference, Customer Name, Amount) rather than repurposing a Sales-app table like
 * Opportunity — a bespoke portal doesn't naturally map onto CRM pipeline semantics,
 * and a custom table works in any Dataverse environment with no extra app/licence.
 */

export interface DynamicsOrder {
  id: string;
  reference: string;
  customerName: string;
  amount: number;
}

export interface FinanceStats {
  source: "mock" | "live";
  fetchedAt: string;
  currency: string;
  orderCount: number;
  totalValue: number;
  recentOrders: DynamicsOrder[];
  topCustomers: { name: string; totalValue: number }[];
}

export interface DynamicsClient {
  readonly source: "mock" | "live";
  listOrders(): Promise<DynamicsOrder[]>;
  createOrder(input: { reference: string; customerName: string; amount: number }): Promise<DynamicsOrder>;
}
