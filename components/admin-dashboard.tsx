import {
  AlertTriangle,
  Banknote,
  Building2,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FileClock,
  Landmark,
  ListChecks,
  Package,
  ReceiptText,
  ScrollText,
  Tags,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { DonutChart, GroupedBarChart, SplitBar } from "@/components/dashboard-charts";
import {
  PendingTaskRow,
  ShortcutTile,
  StatTile,
  TileMoney,
} from "@/components/dashboard-ui";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminDashboardMetrics } from "@/lib/dashboard-metrics";
import { formatMoney, formatMoneyCompact } from "@/lib/finance";
import { StatusBadge } from "@/lib/status";

export async function AdminDashboard() {
  const data = await getAdminDashboardMetrics();
  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Muscat",
  }).format(new Date());
  const urgentExpiryCount = data.expiryAlerts.filter(
    (alert) => alert.daysRemaining <= 15,
  ).length;
  const occupancyPct =
    data.unitCount > 0
      ? Math.round((data.occupiedCount / data.unitCount) * 100)
      : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${today} · Portfolio snapshot across properties, rent, service charges and work.`}
      >
        <ButtonLink href="/protected/properties" variant="outline">
          <Building2 className="h-4 w-4" />
          Properties
        </ButtonLink>
        <ButtonLink href="/protected/service-charge-ledger">
          <Landmark className="h-4 w-4" />
          Service charges
        </ButtonLink>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Open requests"
          value={data.openRequests}
          hint={`${data.requestCounts.pending} pending · ${data.requestCounts.on_hold} on hold`}
          icon={<ClipboardList className="h-4 w-4" />}
          color="amber"
          href="/protected/maintenance"
        />
        <StatTile
          label="Occupancy"
          value={`${data.occupiedCount}/${data.unitCount}`}
          hint={`${occupancyPct}% occupied · ${data.activeTenancies} tenancies`}
          icon={<DoorOpen className="h-4 w-4" />}
          color="violet"
          href="/protected/properties"
        />
        <StatTile
          label="Outstanding rent"
          value={<TileMoney amount={data.outstandingRent} />}
          hint={`${data.pendingRentProofs} proofs to review`}
          icon={<Banknote className="h-4 w-4" />}
          color="rose"
          href="/protected/finances"
        />
        <StatTile
          label="Pending service charge"
          value={<TileMoney amount={data.scPendingAmount} />}
          hint={`${data.scPendingUnits} units · ${data.scOverdueUnits} overdue`}
          icon={<Landmark className="h-4 w-4" />}
          color="teal"
          href="/protected/service-charge-ledger/collection-position?bucket=outstanding"
        />
        <StatTile
          label="Rent collected"
          value={<TileMoney amount={data.rentCollectedThisMonth} />}
          hint="this month"
          icon={<ReceiptText className="h-4 w-4" />}
          color="emerald"
          href="/protected/finances"
        />
        <StatTile
          label="SC collected"
          value={<TileMoney amount={data.scCollectedThisMonth} />}
          hint="this month"
          icon={<Wallet className="h-4 w-4" />}
          color="sky"
          href="/protected/service-charge-ledger"
        />
      </div>

      <Card className="overflow-hidden border-teal-200/70 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-teal-100 bg-gradient-to-r from-teal-50 to-cyan-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
              Pending service charge
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-teal-950">
              {formatMoney(data.scPendingAmount)}
            </p>
            <p className="mt-0.5 text-sm text-teal-800/80">
              {data.scPendingUnits} units still owe · {data.scActivePlans} active
              payment plans · {formatMoneyCompact(data.expensesThisMonth)} spent
              this month
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              href="/protected/service-charge-ledger/collection-position"
              size="sm"
            >
              Collection position
            </ButtonLink>
            <ButtonLink
              href="/protected/service-charge-ledger?charge=overdue"
              variant="outline"
              size="sm"
            >
              Overdue ledger
            </ButtonLink>
          </div>
        </div>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <Link
            href="/protected/service-charge-ledger/collection-position?bucket=overdue"
            className="rounded-xl border border-rose-100 bg-rose-50/70 p-3.5 transition-colors hover:bg-rose-50"
          >
            <p className="text-xs text-rose-700">Overdue units</p>
            <p className="mt-1 text-xl font-semibold text-rose-950">
              {data.scOverdueUnits}
            </p>
          </Link>
          <Link
            href="/protected/service-charge-ledger/collection-position?bucket=dueSoon"
            className="rounded-xl border border-amber-100 bg-amber-50/70 p-3.5 transition-colors hover:bg-amber-50"
          >
            <p className="text-xs text-amber-800">Due within 7 days</p>
            <p className="mt-1 text-xl font-semibold text-amber-950">
              {data.scDueSoonUnits}
            </p>
          </Link>
          <Link
            href="/protected/service-charge-ledger"
            className="rounded-xl border border-teal-100 bg-white p-3.5 transition-colors hover:bg-teal-50/50"
          >
            <p className="text-xs text-teal-800">Collected this month</p>
            <p className="mt-1 text-xl font-semibold text-teal-950">
              {formatMoneyCompact(data.scCollectedThisMonth)}
            </p>
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="border-border/60 shadow-sm xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">Collections · last 6 months</CardTitle>
              <p className="text-xs text-muted-foreground">
                Approved rent vs recorded service-charge payments
              </p>
            </div>
            <Link
              href="/protected/finances/rent-position"
              className="text-xs font-medium text-primary hover:underline"
            >
              Rent position
            </Link>
          </CardHeader>
          <CardContent>
            <GroupedBarChart months={data.collectionMonths} />
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm xl:col-span-2">
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-base">Occupancy</CardTitle>
            <p className="text-xs text-muted-foreground">
              {data.propertyCount} properties · {data.workerCount} workers
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <DonutChart
              centerLabel="occupied"
              centerValue={`${occupancyPct}%`}
              slices={[
                { label: "Occupied", value: data.occupiedCount, color: "#6366f1" },
                { label: "Vacant", value: data.vacantCount, color: "#cbd5e1" },
              ]}
            />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Open maintenance mix
              </p>
              {(
                [
                  ["Pending", data.requestCounts.pending, "bg-amber-500"],
                  ["In progress", data.requestCounts.in_progress, "bg-[#0886be]"],
                  ["En route", data.requestCounts.en_route, "bg-violet-500"],
                  ["On hold", data.requestCounts.on_hold, "bg-slate-400"],
                ] as const
              ).map(([label, value, bar]) => {
                const max = Math.max(
                  1,
                  data.requestCounts.pending,
                  data.requestCounts.in_progress,
                  data.requestCounts.en_route,
                  data.requestCounts.on_hold,
                );
                return (
                  <div key={label} className="grid grid-cols-[6.5rem_1fr_1.5rem] items-center gap-2 text-[11px]">
                    <span className="truncate text-muted-foreground">{label}</span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${bar}`}
                        style={{ width: `${(value / max) * 100}%` }}
                      />
                    </div>
                    <span className="text-right font-medium tabular-nums">{value}</span>
                  </div>
                );
              })}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Receivables split
              </p>
              <SplitBar
                left={data.outstandingRent}
                right={data.scPendingAmount}
                leftLabel="Rent & bills"
                rightLabel="Service charge"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 bg-rose-50/40">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <CardTitle className="text-base">Agreement expiry</CardTitle>
              {urgentExpiryCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                  {urgentExpiryCount} urgent
                </span>
              )}
            </div>
            <Link
              href="/protected/reports/agreement-expiry"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 pt-4">
            {data.expiryAlerts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing expiring in the next 90 days.
              </p>
            ) : (
              data.expiryAlerts.slice(0, 6).map((alert) => {
                const expired = alert.daysRemaining < 0;
                return (
                  <Link
                    key={alert.id}
                    href={alert.href}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{alert.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {alert.subtitle}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                        expired
                          ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                          : "bg-amber-50 text-amber-700 ring-amber-600/20"
                      }`}
                    >
                      {expired
                        ? `Expired ${Math.abs(alert.daysRemaining)}d ago`
                        : `Due in ${alert.daysRemaining}d`}
                    </span>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 bg-amber-50/40">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <ClipboardCheck className="h-4 w-4" />
              </span>
              <CardTitle className="text-base">Pending tasks</CardTitle>
            </div>
            <Link
              href="/protected/onboarding"
              className="text-xs font-medium text-primary hover:underline"
            >
              Onboarding
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 pt-4">
            <PendingTaskRow
              icon={<Landmark className="h-4 w-4" />}
              label="Service charge still outstanding"
              count={data.scPendingUnits}
              amount={formatMoney(data.scPendingAmount)}
              href="/protected/service-charge-ledger/collection-position?bucket=outstanding"
            />
            <PendingTaskRow
              icon={<ReceiptText className="h-4 w-4" />}
              label="Payment proofs awaiting review"
              count={data.pendingRentProofs}
              href="/protected/finances"
            />
            <PendingTaskRow
              icon={<Building2 className="h-4 w-4" />}
              label="Property approvals pending"
              count={data.pendingApprovals}
              href="/protected/onboarding?includeActive=0"
            />
            <PendingTaskRow
              icon={<Wrench className="h-4 w-4" />}
              label="Maintenance requests pending"
              count={data.requestCounts.pending}
              href="/protected/maintenance?status=pending"
            />
            <PendingTaskRow
              icon={<FileClock className="h-4 w-4" />}
              label="Cheques awaiting clearance"
              count={data.awaitingCheques}
              href="/protected/finances/cheque-reminders"
            />
            <PendingTaskRow
              icon={<Package className="h-4 w-4" />}
              label="Supply requests pending decision"
              count={data.pendingSupplyRequests}
              href="/protected/maintenance"
            />
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Go to a module</h2>
            <p className="text-xs text-muted-foreground">
              Every operational area, one click from here.
            </p>
          </div>
          <Link
            href="/protected/reports"
            className="text-xs font-medium text-primary hover:underline"
          >
            All reports
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <ShortcutTile
            href="/protected/properties"
            label="Properties"
            description="Buildings, units and occupancy"
            icon={<Building2 className="h-4 w-4" />}
            iconClass="bg-violet-50 text-violet-600"
          />
          <ShortcutTile
            href="/protected/tenancies"
            label="Tenancies"
            description="Agreements and move-ins"
            icon={<ScrollText className="h-4 w-4" />}
            iconClass="bg-indigo-50 text-indigo-600"
          />
          <ShortcutTile
            href="/protected/finances"
            label="Rent & bills"
            description="Charges, proofs and receipts"
            icon={<Banknote className="h-4 w-4" />}
            iconClass="bg-emerald-50 text-emerald-600"
          />
          <ShortcutTile
            href="/protected/finances/rent-position"
            label="Rent position"
            description="Paid, due and overdue rent"
            icon={<ReceiptText className="h-4 w-4" />}
            iconClass="bg-sky-50 text-sky-700"
          />
          <ShortcutTile
            href="/protected/service-charge-ledger"
            label="Service charge ledger"
            description="Unit balances portfolio-wide"
            icon={<Landmark className="h-4 w-4" />}
            iconClass="bg-teal-50 text-teal-700"
          />
          <ShortcutTile
            href="/protected/service-charge-ledger/collection-position"
            label="Collection position"
            description="OA overdue and due-soon units"
            icon={<ClipboardList className="h-4 w-4" />}
            iconClass="bg-cyan-50 text-cyan-700"
          />
          <ShortcutTile
            href="/protected/expenses"
            label="Expenses"
            description="Spend, suppliers and cash flow"
            icon={<Wallet className="h-4 w-4" />}
            iconClass="bg-amber-50 text-amber-700"
          />
          <ShortcutTile
            href="/protected/maintenance"
            label="Requests"
            description="Maintenance and supply decisions"
            icon={<Wrench className="h-4 w-4" />}
            iconClass="bg-orange-50 text-orange-700"
          />
          <ShortcutTile
            href="/protected/reports/agreement-expiry"
            label="Agreement expiry"
            description="Tenant, building and documents"
            icon={<AlertTriangle className="h-4 w-4" />}
            iconClass="bg-rose-50 text-rose-600"
          />
          <ShortcutTile
            href="/protected/onboarding"
            label="Onboarding"
            description="Approvals, owners and GPS"
            icon={<ListChecks className="h-4 w-4" />}
            iconClass="bg-slate-100 text-slate-700"
          />
          <ShortcutTile
            href="/protected/users"
            label="People"
            description="Owners, tenants and workers"
            icon={<Users className="h-4 w-4" />}
            iconClass="bg-fuchsia-50 text-fuchsia-700"
          />
          <ShortcutTile
            href="/protected/admin/suppliers"
            label="Suppliers"
            description="Vendors and building contracts"
            icon={<Tags className="h-4 w-4" />}
            iconClass="bg-lime-50 text-lime-700"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">By property</CardTitle>
            <Link
              href="/protected/properties"
              className="text-xs font-medium text-primary hover:underline"
            >
              All properties
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 border-t pt-4">
            {data.properties.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No properties yet.{" "}
                <Link href="/protected/properties" className="font-medium text-primary hover:underline">
                  Add one
                </Link>
                .
              </p>
            ) : (
              data.properties.slice(0, 8).map((property) => (
                <Link
                  key={property.id}
                  href={`/protected/properties/${property.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="text-sm font-medium">{property.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {property.occupied}/{property.units} occupied
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                      property.openRequests > 0
                        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
                        : "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    }`}
                  >
                    {property.openRequests} open
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Latest requests</CardTitle>
              <p className="text-xs text-muted-foreground">
                {data.requestCounts.in_progress} in progress · {data.requestCounts.en_route} en route
              </p>
            </div>
            <Link
              href="/protected/maintenance"
              className="text-xs font-medium text-primary hover:underline"
            >
              All requests
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 border-t pt-4">
            {data.recentRequests.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No requests yet.
              </p>
            ) : (
              data.recentRequests.map((request) => (
                <Link
                  key={request.id}
                  href={`/protected/maintenance/${request.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{request.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {request.location} · {request.email}
                    </p>
                  </div>
                  <StatusBadge status={request.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
