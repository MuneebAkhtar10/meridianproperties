import { prisma } from "@/lib/prisma";
import { PaymentStatus } from "@/lib/generated/prisma/client";
import { getDynamicsClient } from "./client";
import type { FinanceStats } from "./types";

/**
 * Meridian Properties ↔ Dynamics 365.
 *
 * The real record on our side is an approved rent/bill payment — tenant, amount, and a
 * reference. Each becomes one row in the Dataverse table `cr3d4_portalorder` (Reference /
 * Customer Name / Amount), the same custom table used by the standalone integration demo,
 * so the client's Dynamics environment sees "Meridian Properties" and "the demo portal"
 * as two sources feeding the same table — which is exactly what a real integration looks
 * like once more than one system pushes into it.
 */

/** Dynamics → us: the numbers a dashboard would show. */
export async function pullFinanceStats(): Promise<FinanceStats> {
  const client = getDynamicsClient();
  const orders = await client.listOrders();

  const byCustomer = new Map<string, number>();
  for (const o of orders) {
    byCustomer.set(o.customerName, (byCustomer.get(o.customerName) ?? 0) + o.amount);
  }
  const topCustomers = [...byCustomer.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, totalValue]) => ({ name, totalValue }));

  return {
    source: client.source,
    fetchedAt: new Date().toISOString(),
    currency: "OMR",
    orderCount: orders.length,
    totalValue: orders.reduce((sum, o) => sum + o.amount, 0),
    recentOrders: [...orders].slice(0, 8),
    topCustomers,
  };
}

export class DynamicsSyncError extends Error {}

function tenantDisplayName(tenant: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [tenant.firstName, tenant.lastName].filter(Boolean).join(" ").trim();
  return name || tenant.email;
}

async function findExistingByReference(reference: string) {
  const client = getDynamicsClient();
  const orders = await client.listOrders();
  return orders.find((o) => o.reference === reference);
}

/**
 * Push one approved payment into Dynamics. Idempotent: re-running for an already-synced
 * payment finds the existing Dataverse row by reference instead of creating a duplicate —
 * the same protection a real integration needs once retries or re-approvals happen.
 */
export async function pushPaymentToDynamics(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      charge: { include: { tenant: { select: { firstName: true, lastName: true, email: true } } } },
    },
  });
  if (!payment) throw new DynamicsSyncError("Payment not found");
  if (payment.status !== PaymentStatus.approved) {
    throw new DynamicsSyncError("Only approved payments are synced to Dynamics");
  }

  const reference = payment.reference?.trim() || `PMT-${payment.id.slice(0, 8).toUpperCase()}`;

  const existing = await findExistingByReference(reference);
  if (existing) return { dynamicsOrderId: existing.id, reference, skipped: true as const };

  const client = getDynamicsClient();
  const created = await client.createOrder({
    reference,
    customerName: tenantDisplayName(payment.charge.tenant),
    amount: Number(payment.amount),
  });
  return { dynamicsOrderId: created.id, reference, skipped: false as const };
}

/** Catch-up sync: push every approved payment that isn't in Dynamics yet. */
export async function syncAllApprovedPayments() {
  const payments = await prisma.payment.findMany({
    where: { status: PaymentStatus.approved },
    select: { id: true },
    orderBy: { reviewedAt: "desc" },
    take: 100,
  });

  const results: { paymentId: string; dynamicsOrderId?: string; skipped?: boolean; error?: string }[] = [];
  for (const p of payments) {
    try {
      results.push({ paymentId: p.id, ...(await pushPaymentToDynamics(p.id)) });
    } catch (err) {
      results.push({ paymentId: p.id, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }
  return results;
}
