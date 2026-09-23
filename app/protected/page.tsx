import {
  Building2,
  ClipboardList,
  DoorOpen,
  Home,
  KeyRound,
  Landmark,
  Plus,
  WalletCards,
  Wrench,
} from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";

import { AdminDashboard } from "@/components/admin-dashboard";
import { DonutChart } from "@/components/dashboard-charts";
import { StatTile, TileMoney } from "@/components/dashboard-ui";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import {
  NON_UTILITY_CHARGE_TYPES,
  chargeBalance,
  moneyValue,
} from "@/lib/finance";
import { formatOmanAddress } from "@/lib/oman";
import { formatUnitLabel } from "@/lib/property-types";
import { requireUser, type SessionUser, isStaffAdmin } from "@/lib/session";
import { firstAllowedAdminHref, hasAdminModule } from "@/lib/permissions";
import { StatusBadge } from "@/lib/status";
import {
  ChargeStatus,
  RequestStatus,
  UserType,
} from "@/lib/generated/prisma/client";

export default async function DashboardPage() {
  const user = await requireUser();

  if (isStaffAdmin(user.userType) && !(await hasAdminModule(user, "dashboard"))) {
    const href = await firstAllowedAdminHref(user);
    if (href !== "/protected") {
      redirect(href);
    }
  }

  const showAdminDashboard =
    isStaffAdmin(user.userType) && (await hasAdminModule(user, "dashboard"));

  return (
    <div className="w-full space-y-8 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      {showAdminDashboard && <AdminDashboard />}
      {isStaffAdmin(user.userType) && !showAdminDashboard && (
        <PageHeader
          title="No modules assigned"
          description="A super admin has not granted you any sections yet. Ask them to open Permissions and enable the modules you need."
        />
      )}
      {user.userType === UserType.worker && <WorkerDashboard user={user} />}
      {user.userType === UserType.user && <TenantDashboard user={user} />}
      {user.userType === UserType.owner && <OwnerDashboard user={user} />}
    </div>
  );
}

/* ── Owner ─────────────────────────────────────────────────────────────────── */

/** Same shape as the admin dashboard's stats, scoped to properties this
 * landlord owns. Owners never see other owners' or unassigned properties. */
async function OwnerDashboard({ user }: { user: SessionUser }) {
  const [properties, unitCount, occupiedCount, openRequests, outstandingCharges, scUnits] =
    await Promise.all([
      prisma.property.count({ where: { units: { some: { ownerId: user.id } } } }),
      prisma.unit.count({ where: { ownerId: user.id } }),
      prisma.unit.count({
        where: { ownerId: user.id, tenantId: { not: null } },
      }),
      prisma.maintenanceRequest.count({
        where: {
          status: { not: RequestStatus.completed },
          unit: { ownerId: user.id },
        },
      }),
      prisma.charge.findMany({
        where: {
          status: ChargeStatus.open,
          type: { in: NON_UTILITY_CHARGE_TYPES },
          unit: { ownerId: user.id },
        },
        select: {
          amount: true,
          status: true,
          payments: { select: { amount: true, status: true } },
        },
      }),
      prisma.unit.findMany({
        where: { ownerId: user.id, serviceChargeBalance: { gt: 0 } },
        select: { serviceChargeBalance: true },
      }),
    ]);

  const outstanding = outstandingCharges.reduce(
    (total, charge) => total + chargeBalance(charge),
    0,
  );
  const scPending = scUnits.reduce(
    (total, unit) => total + moneyValue(unit.serviceChargeBalance),
    0,
  );

  const occupancyPct =
    unitCount > 0 ? Math.round((occupiedCount / unitCount) * 100) : 0;

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
        <ButtonLink href="/protected/finances">
          <WalletCards className="h-4 w-4" />
          Rent & bills
        </ButtonLink>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          hint={`${occupancyPct}% occupied`}
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
          label="Outstanding rent"
          value={<TileMoney amount={outstanding} />}
          icon={<WalletCards className="h-4 w-4" />}
          color="rose"
          href="/protected/finances"
        />
        <StatTile
          label="Pending service charge"
          value={<TileMoney amount={scPending} />}
          hint={`${scUnits.length} unit${scUnits.length === 1 ? "" : "s"}`}
          icon={<Landmark className="h-4 w-4" />}
          color="teal"
          href="/protected/properties"
        />
      </div>

      {unitCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Occupancy</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              centerLabel="occupied"
              centerValue={`${occupancyPct}%`}
              slices={[
                {
                  label: "Occupied",
                  value: occupiedCount,
                  color: "#6366f1",
                  href: "/protected/tenancies",
                },
                {
                  label: "Vacant",
                  value: Math.max(0, unitCount - occupiedCount),
                  color: "#cbd5e1",
                  href: "/protected/properties",
                },
              ]}
            />
          </CardContent>
        </Card>
      )}

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

          <Link href="/protected/finances" className="block">
          <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
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
          </Link>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Rent & bills due"
              value={<TileMoney amount={outstanding} />}
              icon={<WalletCards className="h-4 w-4" />}
              color="rose"
              href="/protected/finances"
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
              href="/protected/requests"
            />
            <StatTile
              label="In progress"
              value={count("in_progress") + count("en_route")}
              hint="being worked on"
              icon={<Wrench className="h-4 w-4" />}
              color="sky"
              href="/protected/requests"
            />
            <StatTile
              label="Completed"
              value={count("completed")}
              hint="all time"
              icon={<KeyRound className="h-4 w-4" />}
              color="emerald"
              href="/protected/requests"
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
