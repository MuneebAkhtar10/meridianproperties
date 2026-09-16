import { Building2, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { UserType, PaymentStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { pullFinanceStats } from "@/lib/dynamics/sync";
import { SyncAllButton } from "./sync-all-button";

export const dynamic = "force-dynamic";

/**
 * Dynamics 365 sync status.
 *
 * Every approved payment is pushed to Dynamics the moment an admin approves it
 * (see `reviewPaymentAction` in `app/finance-actions.ts`) — this page is a window
 * into that, not a control for it. The one action here, "Sync now", exists for
 * catching up anything approved before the integration existed, or after an outage.
 */
export default async function DynamicsPage() {
  await requireRole(UserType.admin);

  const [stats, approvedCount] = await Promise.all([
    pullFinanceStats(),
    prisma.payment.count({ where: { status: PaymentStatus.approved } }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 pt-4 pb-8">
      <PageHeader
        title="Dynamics 365"
        description={
          stats.source === "mock"
            ? "Showing a simulated environment — set DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET and DYNAMICS_RESOURCE_URL to connect a real one."
            : "Approved payments sync here automatically. Live data from the connected Dynamics 365 environment."
        }
      >
        <SyncAllButton />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-medium text-muted-foreground">
              Records in Dynamics
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {stats.orderCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-medium text-muted-foreground">
              Total value synced
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              OMR {stats.totalValue.toFixed(3)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-medium text-muted-foreground">
              Approved payments (all time)
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {approvedCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 border-b border-border/60 bg-muted/30 px-5 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
          <CardTitle className="text-sm font-semibold">
            Top tenants by synced value
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border/60 p-0">
          {stats.topCustomers.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              Nothing synced yet.
            </p>
          ) : (
            stats.topCustomers.map((c) => (
              <div
                key={c.name}
                className="flex items-center justify-between px-5 py-3 text-sm"
              >
                <span className="font-medium">{c.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  OMR {c.totalValue.toFixed(3)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 border-b border-border/60 bg-muted/30 px-5 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <RefreshCw className="h-4 w-4" />
          </span>
          <CardTitle className="text-sm font-semibold">
            Recent records in Dynamics
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border/60 p-0">
          {stats.recentOrders.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              Nothing synced yet — approve a payment under Finances to see it appear here.
            </p>
          ) : (
            stats.recentOrders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between px-5 py-3 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{o.customerName}</span>
                  <span className="text-xs text-muted-foreground">
                    {o.reference}
                  </span>
                </div>
                <span className="tabular-nums text-muted-foreground">
                  OMR {o.amount.toFixed(3)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
