import {
  Building2,
  ChevronRight,
  ClipboardList,
  DoorOpen,
  Home,
  KeyRound,
  Plus,
  ReceiptText,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import {
  NON_UTILITY_CHARGE_TYPES,
  chargeBalance,
  formatMoney,
  formatMoneyCompact,
} from "@/lib/finance";
import { formatOmanAddress } from "@/lib/oman";
import { formatUnitLabel } from "@/lib/property-types";
import { requireUser, type SessionUser } from "@/lib/session";
import { STATUS_META, StatusBadge } from "@/lib/status";
import {
  ChargeStatus,
  PaymentStatus,
  RequestStatus,
  UserType,
} from "@/lib/generated/prisma/client";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      {user.userType === UserType.admin && <AdminDashboard />}
      {user.userType === UserType.worker && <WorkerDashboard user={user} />}
      {user.userType === UserType.user && <TenantDashboard user={user} />}
      {user.userType === UserType.owner && <OwnerDashboard user={user} />}
    </div>
  );
}

/* ── Admin ─────────────────────────────────────────────────────────────────── */

async function AdminDashboard() {
  const [
    byStatus,
    properties,
    unitCount,
    occupiedCount,
    workerCount,
    recent,
    openCharges,
    pendingPayments,
    collectedThisMonth,
    scheduledMonthlyRent,
  ] = await Promise.all([
    prisma.maintenanceRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.property.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { units: true } },
        units: {
          select: {
            tenantId: true,
            requests: {
              where: { status: { not: RequestStatus.completed } },
              select: { id: true },
            },
          },
        },
      },
    }),
    prisma.unit.count(),
    prisma.unit.count({ where: { tenantId: { not: null } } }),
    prisma.user.count({ where: { userType: UserType.worker } }),
    prisma.maintenanceRequest.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true } },
        unit: { include: { property: { select: { name: true, propertyType: { select: { hasFloors: true, unitPrefix: true } } } } } },
      },
    }),
    prisma.charge.findMany({
      where: {
        status: ChargeStatus.open,
        type: { in: NON_UTILITY_CHARGE_TYPES },
      },
      select: {
        amount: true,
        status: true,
        payments: { select: { amount: true, status: true } },
      },
    }),
    prisma.payment.count({
      where: {
        status: PaymentStatus.pending,
        charge: { type: { in: NON_UTILITY_CHARGE_TYPES } },
      },
    }),
    prisma.payment.aggregate({
      where: {
        status: PaymentStatus.approved,
        charge: { type: { in: NON_UTILITY_CHARGE_TYPES } },
        paidAt: {
          gte: new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
          ),
        },
      },
      _sum: { amount: true },
    }),
    prisma.tenancy.aggregate({
      where: { endDate: null },
      _sum: { monthlyRent: true },
    }),
  ]);

  const count = (status: RequestStatus) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  const open =
    count("pending") +
    count("en_route") +
    count("in_progress") +
    count("on_hold");
  const outstanding = openCharges.reduce(
    (total, charge) => total + chargeBalance(charge),
    0,
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything happening across your properties."
      >
        <ButtonLink href="/protected/properties" variant="outline">
          <Building2 className="h-4 w-4" />
          Properties
        </ButtonLink>
        <ButtonLink href="/protected/maintenance">
          <ClipboardList className="h-4 w-4" />
          All requests
        </ButtonLink>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Open requests"
          value={open}
          hint={`${count("pending")} pending · ${count("on_hold")} on hold`}
          icon={<ClipboardList className="h-4 w-4" />}
          color="amber"
          href="/protected/maintenance"
        />
        <StatTile
          label="In progress"
          value={count("in_progress")}
          hint={`${count("en_route")} en route`}
          icon={<Wrench className="h-4 w-4" />}
          color="sky"
          href="/protected/maintenance?status=in_progress"
        />
        <StatTile
          label="Completed"
          value={count("completed")}
          hint="all time"
          icon={<KeyRound className="h-4 w-4" />}
          color="emerald"
          href="/protected/maintenance?status=completed"
        />
        <StatTile
          label="Occupancy"
          value={`${occupiedCount}/${unitCount}`}
          hint={`${workerCount} worker${workerCount === 1 ? "" : "s"}`}
          icon={<DoorOpen className="h-4 w-4" />}
          color="violet"
          href="/protected/properties"
        />
      </div>

      <Link href="/protected/finances" className="block">
        <Card className="overflow-hidden border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex flex-row items-center justify-between gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white">
                <WalletCards className="h-4 w-4" />
              </span>
              <CardTitle className="text-base text-white">
                Rent & bills overview
              </CardTitle>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white">
              Open ledger
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-3 rounded-xl bg-[#0886be]/10 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0886be]/15 text-[#0886be]">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-[#0886be]/70">
                  Scheduled monthly rent
                </p>
                <p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-[#075e82]">
                  {formatMoney(scheduledMonthlyRent._sum.monthlyRent ?? 0)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <WalletCards className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-amber-700/70">
                  Outstanding rent & bills
                </p>
                <p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-amber-900">
                  {formatMoney(outstanding)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-rose-50 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                <ClipboardList className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-rose-700/70">
                  Proofs waiting for review
                </p>
                <p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-rose-900">
                  {pendingPayments}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <KeyRound className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-emerald-700/70">
                  Collected this month
                </p>
                <p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-emerald-900">
                  {formatMoney(collectedThisMonth._sum.amount ?? 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-600/15">
              <Building2 className="h-4 w-4" />
            </span>
            <CardTitle className="text-base">By property</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 border-t pt-4">
            {properties.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No properties yet.{" "}
                <Link
                  href="/protected/properties"
                  className="font-medium text-primary hover:underline"
                >
                  Add one
                </Link>
                .
              </p>
            ) : (
              properties.map((property) => {
                const occupied = property.units.filter(
                  (u) => u.tenantId,
                ).length;
                const openHere = property.units.reduce(
                  (sum, u) => sum + u.requests.length,
                  0,
                );

                return (
                  <Link
                    key={property.id}
                    href={`/protected/properties/${property.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-medium">{property.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {occupied}/{property._count.units} occupied
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                        openHere > 0
                          ? "bg-amber-50 text-amber-700 ring-amber-600/20"
                          : "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                      }`}
                    >
                      {openHere} open
                    </span>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0886be]/10 text-[#0886be] ring-1 ring-inset ring-[#0886be]/15">
              <Wrench className="h-4 w-4" />
            </span>
            <CardTitle className="text-base">Latest requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 border-t pt-4">
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No requests yet.
              </p>
            ) : (
              recent.map((request) => (
                <Link
                  key={request.id}
                  href={`/protected/maintenance/${request.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {request.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {request.unit
                        ? `${request.unit.property.name} · ${formatUnitLabel(
                            request.unit.property.propertyType,
                            request.unit.label,
                          )}`
                        : "No unit"}{" "}
                      · {request.user.email}
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

/* ── Owner ─────────────────────────────────────────────────────────────────── */

/** Same shape as the admin dashboard's stats, scoped to properties this
 * landlord owns. Owners never see other owners' or unassigned properties. */
async function OwnerDashboard({ user }: { user: SessionUser }) {
  const [properties, unitCount, occupiedCount, openRequests, outstandingCharges] =
    await Promise.all([
      prisma.property.count({ where: { ownerId: user.id } }),
      prisma.unit.count({ where: { property: { ownerId: user.id } } }),
      prisma.unit.count({
        where: { property: { ownerId: user.id }, tenantId: { not: null } },
      }),
      prisma.maintenanceRequest.count({
        where: {
          status: { not: RequestStatus.completed },
          unit: { property: { ownerId: user.id } },
        },
      }),
      prisma.charge.findMany({
        where: {
          status: ChargeStatus.open,
          type: { in: NON_UTILITY_CHARGE_TYPES },
          unit: { property: { ownerId: user.id } },
        },
        select: {
          amount: true,
          status: true,
          payments: { select: { amount: true, status: true } },
        },
      }),
    ]);

  const outstanding = outstandingCharges.reduce(
    (total, charge) => total + chargeBalance(charge),
    0,
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything happening across your properties."
      >
        <ButtonLink href="/protected/properties" variant="outline">
          <Building2 className="h-4 w-4" />
          Properties
        </ButtonLink>
        <ButtonLink href="/protected/maintenance">
          <ClipboardList className="h-4 w-4" />
          Requests
        </ButtonLink>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Your properties"
          value={properties}
          icon={<Building2 className="h-4 w-4" />}
          color="violet"
          href="/protected/properties"
        />
        <StatTile
          label="Units occupied"
          value={`${occupiedCount} / ${unitCount}`}
          icon={<DoorOpen className="h-4 w-4" />}
          color="sky"
          href="/protected/properties"
        />
        <StatTile
          label="Open requests"
          value={openRequests}
          icon={<Wrench className="h-4 w-4" />}
          color="amber"
          href="/protected/maintenance"
        />
        <StatTile
          label="Outstanding balance"
          value={formatMoneyCompact(outstanding)}
          icon={<WalletCards className="h-4 w-4" />}
          color="rose"
          href="/protected/finances"
        />
      </div>

      {properties === 0 && (
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add your first property — an admin will need to approve it before it goes live."
        />
      )}
    </>
  );
}

/* ── Worker ────────────────────────────────────────────────────────────────── */

async function WorkerDashboard({ user }: { user: SessionUser }) {
  const [byStatus, next] = await Promise.all([
    prisma.maintenanceRequest.groupBy({
      by: ["status"],
      where: { assignedToId: user.id },
      _count: { _all: true },
    }),
    prisma.maintenanceRequest.findMany({
      where: {
        assignedToId: user.id,
        status: {
          in: [
            RequestStatus.pending,
            RequestStatus.en_route,
            RequestStatus.in_progress,
          ],
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 5,
      include: { unit: { include: { property: { select: { name: true, propertyType: { select: { hasFloors: true, unitPrefix: true } } } } } } },
    }),
  ]);

  const count = (status: RequestStatus) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your assigned maintenance work."
      >
        <ButtonLink href="/protected/tasks">
          <Wrench className="h-4 w-4" />
          My tasks
        </ButtonLink>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Waiting on you"
          value={count("pending") + count("en_route")}
          hint={`${count("en_route")} en route`}
          icon={<ClipboardList className="h-4 w-4" />}
          color="amber"
          href="/protected/tasks"
        />
        <StatTile
          label="In progress"
          value={count("in_progress")}
          hint="currently working"
          icon={<Wrench className="h-4 w-4" />}
          color="sky"
          href="/protected/tasks"
        />
        <StatTile
          label="Completed"
          value={count("completed")}
          hint="all time"
          icon={<KeyRound className="h-4 w-4" />}
          color="emerald"
          href="/protected/history"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Up next</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {next.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing assigned to you right now.
            </p>
          ) : (
            next.map((task) => (
              <Link
                key={task.id}
                href="/protected/tasks"
                className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {task.unit
                      ? `${task.unit.property.name} · ${formatUnitLabel(
                          task.unit.property.propertyType,
                          task.unit.label,
                        )} · ${task.location}`
                      : task.location}
                  </p>
                </div>
                <StatusBadge status={task.status} />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ── Tenant ────────────────────────────────────────────────────────────────── */

async function TenantDashboard({ user }: { user: SessionUser }) {
  const [unit, byStatus, recent, awaitingCode, charges] = await Promise.all([
    prisma.unit.findUnique({
      where: { tenantId: user.id },
      include: { property: { include: { propertyType: true } } },
    }),
    prisma.maintenanceRequest.groupBy({
      by: ["status"],
      where: { userId: user.id },
      _count: { _all: true },
    }),
    prisma.maintenanceRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    // A worker has finished and is waiting for this tenant to read them a code.
    prisma.maintenanceRequest.findMany({
      where: { userId: user.id, completionCode: { not: null } },
      select: { id: true, title: true, completionCode: true },
    }),
    prisma.charge.findMany({
      where: {
        tenantId: user.id,
        status: ChargeStatus.open,
        type: { in: NON_UTILITY_CHARGE_TYPES },
      },
      select: {
        amount: true,
        status: true,
        payments: { select: { amount: true, status: true } },
      },
    }),
  ]);

  const count = (status: RequestStatus) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  const open =
    count("pending") +
    count("en_route") +
    count("in_progress") +
    count("on_hold");
  const outstanding = charges.reduce(
    (total, charge) => total + chargeBalance(charge),
    0,
  );

  return (
    <>
      <PageHeader title="Dashboard" description="Your home and requests.">
        {unit && (
          <ButtonLink href="/protected/report">
            <Plus className="h-4 w-4" />
            Report an issue
          </ButtonLink>
        )}
      </PageHeader>

      {!unit ? (
        <EmptyState
          icon={Home}
          title="No unit assigned yet"
          description="Your administrator has not linked your account to a unit. Until they do, you cannot report an issue."
        />
      ) : (
        <>
          {/* A worker is standing there waiting for this number. It has to be the
              loudest thing on the page. */}
          {awaitingCode.map((request) => (
            <Card key={request.id} className="border-primary/40 bg-primary/5">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <KeyRound className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">
                      Give this code to the worker
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Only share it once you&apos;re happy the work on &ldquo;
                      {request.title}&rdquo; is actually done.
                    </p>
                  </div>
                </div>

                <p className="text-4xl font-semibold tracking-[0.3em] text-primary">
                  {request.completionCode}
                </p>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Home className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">
                    {formatUnitLabel(unit.property.propertyType, unit.label)}
                    {unit.floor !== null ? ` · Floor ${unit.floor}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {unit.property.name} — {formatOmanAddress(unit.property)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Rent & bills due"
              value={formatMoneyCompact(outstanding)}
              icon={<WalletCards className="h-4 w-4" />}
              color="rose"
              hint={
                outstanding > 0
                  ? "view ledger or upload proof"
                  : "nothing outstanding"
              }
            />
            <StatTile
              label="Open requests"
              value={open}
              hint={`${count("pending")} pending · ${count("on_hold")} on hold`}
              icon={<ClipboardList className="h-4 w-4" />}
              color="amber"
            />
            <StatTile
              label="In progress"
              value={count("in_progress") + count("en_route")}
              hint="being worked on"
              icon={<Wrench className="h-4 w-4" />}
              color="sky"
            />
            <StatTile
              label="Completed"
              value={count("completed")}
              hint="all time"
              icon={<KeyRound className="h-4 w-4" />}
              color="emerald"
            />
          </div>

          <div className="flex justify-end">
            <ButtonLink href="/protected/finances" variant="outline" size="sm">
              <WalletCards className="h-4 w-4" />
              View rent, bills & receipts
            </ButtonLink>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recent.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  You haven&apos;t reported anything yet.
                </p>
              ) : (
                recent.map((request) => (
                  <Link
                    key={request.id}
                    href={`/protected/requests/${request.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {request.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {request.location}
                      </p>
                    </div>
                    <StatusBadge status={request.status} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

/* ── Shared ────────────────────────────────────────────────────────────────── */

const STAT_TILE_COLORS = {
  blue: {
    bar: "bg-[#0886be]",
    badge: "bg-[#0886be]/10 text-[#0886be] ring-1 ring-inset ring-[#0886be]/15",
    dot: "bg-[#0886be]",
  },
  amber: {
    bar: "bg-amber-500",
    badge: "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-600/15",
    dot: "bg-amber-500",
  },
  emerald: {
    bar: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15",
    dot: "bg-emerald-500",
  },
  violet: {
    bar: "bg-violet-500",
    badge: "bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-600/15",
    dot: "bg-violet-500",
  },
  rose: {
    bar: "bg-rose-500",
    badge: "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-600/15",
    dot: "bg-rose-500",
  },
  sky: {
    bar: "bg-[#0886be]",
    badge: "bg-[#0886be]/10 text-[#0886be] ring-1 ring-inset ring-[#0886be]/15",
    dot: "bg-[#0886be]",
  },
} as const;

type StatTileColor = keyof typeof STAT_TILE_COLORS;

function StatTile({
  label,
  value,
  hint,
  dot,
  icon,
  href,
  color = "blue",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  dot?: string;
  icon?: React.ReactNode;
  href?: string;
  color?: StatTileColor;
}) {
  const palette = STAT_TILE_COLORS[color];

  const content = (
    <CardContent className="relative overflow-hidden p-5">
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-1 ${palette.bar}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {dot && (
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot ?? palette.dot}`}
              />
            )}
            <span className="truncate">{label}</span>
          </div>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          {hint && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
        {icon && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${palette.badge}`}
          >
            {icon}
          </span>
        )}
      </div>
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        <Card className="border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          {content}
        </Card>
      </Link>
    );
  }

  return <Card className="border-border/60 shadow-sm">{content}</Card>;
}
