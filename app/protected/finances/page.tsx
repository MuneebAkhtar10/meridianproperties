import { format, startOfMonth } from "date-fns";
import Link from "next/link";
import {
  Banknote,
  CalendarPlus,
  FileCheck2,
  Landmark,
  Plus,
  ReceiptText,
  WalletCards,
} from "lucide-react";

import {
  createChargeAction,
  generateRentChargesAction,
} from "@/app/finance-actions";
import { ChargeStatusBadge } from "@/components/charge-status-badge";
import { EmptyState } from "@/components/empty-state";
import { FinanceChargeRow } from "@/components/finance-charge-row";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { UploadFileInput } from "@/components/upload-file-input";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SortableTh } from "@/components/ui/sortable-th";
import { Textarea } from "@/components/ui/textarea";
import { PendingLink } from "@/components/ui/pending-link";
import {
  CHARGE_STATUS_META,
  CHARGE_TYPE_LABEL,
  NON_UTILITY_CHARGE_TYPES,
  approvedTotal,
  chargeBalance,
  chargeDisplayStatus,
  dateInputValue,
  formatMoney,
  moneyValue,
  monthInputValue,
} from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  ChargeStatus,
  ChargeType,
  PaymentStatus,
  UserType,
} from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Due" },
  { value: "overdue", label: "Overdue" },
  { value: "under_review", label: "Under review" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
] as const;

const SORT_COLUMNS = [
  "charge",
  "tenant",
  "due",
  "amount",
  "balance",
  "paid",
  "status",
] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];
type SortDir = "asc" | "desc";

type SortableCharge = {
  title: string;
  dueDate: Date;
  amount: Parameters<typeof moneyValue>[0];
  payments: Parameters<typeof approvedTotal>[0];
  tenant: { email: string; firstName: string | null; lastName: string | null };
} & Parameters<typeof chargeBalance>[0] &
  Parameters<typeof chargeDisplayStatus>[0];

function tenantLabel(charge: SortableCharge): string {
  return (
    [charge.tenant.firstName, charge.tenant.lastName]
      .filter(Boolean)
      .join(" ") || charge.tenant.email
  );
}

function sortValue(charge: SortableCharge, column: SortColumn): string | number {
  switch (column) {
    case "charge":
      return charge.title.toLowerCase();
    case "tenant":
      return tenantLabel(charge).toLowerCase();
    case "due":
      return charge.dueDate.getTime();
    case "amount":
      return moneyValue(charge.amount);
    case "balance":
      return chargeBalance(charge);
    case "paid":
      return approvedTotal(charge.payments);
    case "status":
      return chargeDisplayStatus(charge);
  }
}

function sortCharges<T extends SortableCharge>(
  charges: T[],
  column: SortColumn,
  dir: SortDir,
): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...charges].sort((a, b) => {
    const av = sortValue(a, column);
    const bv = sortValue(b, column);
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    // Stable, sensible tie-break so equal values still land newest-first.
    return b.dueDate.getTime() - a.dueDate.getTime();
  });
}

export default async function FinancesPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.userType === UserType.worker) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <EmptyState
          icon={WalletCards}
          title="Finance access is not part of the worker role"
          description="Workers only see maintenance tasks assigned to them."
        />
      </div>
    );
  }

  const isOwner = user.userType === UserType.owner;
  const isAdmin = user.userType === UserType.admin;
  // Owners get the same read-only ledger layout as admins, scoped to their
  // own properties; only true admins get the write tools (AdminTools).
  const isAdminView = isAdmin || isOwner;

  const params = await searchParams;
  const message = params as unknown as Message;
  // A single query param can carry more than one status (comma-separated),
  // e.g. "?status=paid,partially_paid" from the "Collected" stat card, which
  // should surface both fully and partially paid charges at once.
  const statusFilter =
    typeof params.status === "string" ? params.status : "all";
  const statusValues = statusFilter.split(",").filter(Boolean);
  // Exact-set match — used for a stat card's own highlight, since two cards
  // can target overlapping status sets (Outstanding and Collected both
  // include "partially_paid") without meaning the same thing.
  const matchesStatus = (value: string) =>
    statusValues.slice().sort().join(",") ===
    value.split(",").sort().join(",");
  // Inclusion match — used for the individual filter tabs, so a tab lights
  // up whenever its status is part of whatever combination is selected
  // (e.g. clicking "Outstanding" highlights Due, Overdue, Under review and
  // Partially paid all at once).
  const isTabActive = (value: string) => statusValues.includes(value);
  const OUTSTANDING_STATUSES = "open,overdue,partially_paid,under_review";
  const requestedTypeFilter =
    typeof params.type === "string" ? params.type : "all";
  const typeFilter =
    requestedTypeFilter === "all" ||
    NON_UTILITY_CHARGE_TYPES.includes(requestedTypeFilter as ChargeType)
      ? requestedTypeFilter
      : "all";
  const propertyFilter =
    typeof params.property === "string" ? params.property : "all";
  const sortColumn: SortColumn =
    typeof params.sort === "string" &&
    SORT_COLUMNS.includes(params.sort as SortColumn)
      ? (params.sort as SortColumn)
      : "due";
  const sortDir: SortDir = params.dir === "asc" ? "asc" : "desc";

  const [
    charges,
    activeTenancies,
    properties,
    pendingCount,
    collectedThisMonth,
  ] = await Promise.all([
    prisma.charge.findMany({
      where: {
        ...(user.userType === UserType.user ? { tenantId: user.id } : {}),
        ...(isOwner ? { unit: { property: { ownerId: user.id } } } : {}),
        type:
          typeFilter === "all"
            ? { in: NON_UTILITY_CHARGE_TYPES }
            : (typeFilter as ChargeType),
        ...((isAdmin || isOwner) && propertyFilter !== "all"
          ? { unit: { propertyId: propertyFilter } }
          : {}),
      },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      include: {
        tenant: { select: { email: true, firstName: true, lastName: true } },
        unit: {
          include: {
            property: {
              select: {
                id: true,
                name: true,
                propertyType: { select: { hasFloors: true, unitPrefix: true } },
              },
            },
          },
        },
        payments: {
          select: { amount: true, status: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    isAdmin || isOwner
      ? prisma.tenancy.findMany({
          where: {
            endDate: null,
            ...(isOwner ? { unit: { property: { ownerId: user.id } } } : {}),
          },
          orderBy: [
            { unit: { property: { name: "asc" } } },
            { unit: { label: "asc" } },
          ],
          include: {
            tenant: {
              select: { email: true, firstName: true, lastName: true },
            },
            unit: { include: { property: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    isAdmin || isOwner
      ? prisma.property.findMany({
          where: isOwner ? { ownerId: user.id } : {},
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    prisma.payment.count({
      where: {
        status: PaymentStatus.pending,
        charge: {
          type: { in: NON_UTILITY_CHARGE_TYPES },
          ...(user.userType === UserType.user ? { tenantId: user.id } : {}),
        },
      },
    }),
    prisma.payment.aggregate({
      where: {
        status: PaymentStatus.approved,
        paidAt: { gte: startOfMonth(new Date()) },
        charge: {
          type: { in: NON_UTILITY_CHARGE_TYPES },
          ...(user.userType === UserType.user ? { tenantId: user.id } : {}),
        },
      },
      _sum: { amount: true },
    }),
  ]);

  const visibleCharges = sortCharges(
    charges.filter((charge) => {
      if (statusValues.includes("all")) return true;
      return statusValues.includes(chargeDisplayStatus(charge));
    }),
    sortColumn,
    sortDir,
  );

  const sortHref = (column: SortColumn) =>
    `${filterHref(params, {
      sort: column,
      dir: sortColumn === column && sortDir === "desc" ? "asc" : "desc",
    })}#ledger`;

  const outstanding = charges.reduce(
    (total, charge) => total + chargeBalance(charge),
    0,
  );
  const overdue = charges.reduce(
    (total, charge) =>
      chargeDisplayStatus(charge) === "overdue"
        ? total + chargeBalance(charge)
        : total,
    0,
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <PageHeader
        title={
          isAdminView ? "Rent & bills" : "My rent & bills"
        }
        description={
          isAdminView
            ? "Manual collections, proof review and tenant ledgers—no payment gateway."
            : "See amounts due, upload payment proof and keep your receipts together."
        }
      >
        {isAdminView && (
          <ButtonLink href="/protected/tenancies" variant="outline">
            <Landmark className="h-4 w-4" />
            Manage tenancies
          </ButtonLink>
        )}
      </PageHeader>

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="Outstanding"
          value={formatMoney(outstanding)}
          hint="approved payments deducted"
          href={`${filterHref(params, { status: OUTSTANDING_STATUSES })}#ledger`}
          active={matchesStatus(OUTSTANDING_STATUSES)}
        />
        <StatCard
          icon={<CalendarPlus className="h-4 w-4" />}
          label="Overdue"
          value={formatMoney(overdue)}
          hint="past due date"
          danger={overdue > 0}
          href={`${filterHref(params, { status: "overdue" })}#ledger`}
          active={matchesStatus("overdue")}
        />
        <StatCard
          icon={<FileCheck2 className="h-4 w-4" />}
          label="Proofs to review"
          value={pendingCount}
          hint={
            isAdminView
              ? "needs admin decision"
              : "waiting for admin"
          }
          href={`${filterHref(params, { status: "under_review" })}#ledger`}
          active={matchesStatus("under_review")}
        />
        <StatCard
          icon={<WalletCards className="h-4 w-4" />}
          label={
            isAdminView
              ? "Collected this month"
              : "Paid this month"
          }
          value={formatMoney(collectedThisMonth._sum.amount ?? 0)}
          hint="approved payments"
          href={`${filterHref(params, { status: "paid,partially_paid" })}#ledger`}
          active={matchesStatus("paid,partially_paid")}
        />
      </div>

      <div
        id="ledger"
        className={
          isAdminView
            ? "grid gap-8 scroll-mt-24 lg:grid-cols-[1fr_22rem]"
            : "grid scroll-mt-24"
        }
      >
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((filter) => (
                <PendingLink
                  key={filter.value}
                  href={`${filterHref(params, { status: filter.value })}#ledger`}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isTabActive(filter.value)
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {filter.label}
                </PendingLink>
              ))}
            </div>

            <form className="grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="status" value={statusFilter} />
              <Select name="type" defaultValue={typeFilter}>
                <option value="all">All charge types</option>
                {NON_UTILITY_CHARGE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CHARGE_TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
              {(isAdmin || isOwner) && (
                <Select name="property" defaultValue={propertyFilter}>
                  <option value="all">All properties</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Select>
              )}
              <SubmitButton variant="outline" pendingText="Filtering...">
                Filter
              </SubmitButton>
            </form>
          </div>

          {visibleCharges.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No ledger entries found"
              description="There are no charges matching these filters."
            />
          ) : (
            <Card className="overflow-hidden rounded-xl border shadow-sm">
              <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {visibleCharges.length}{" "}
                  {visibleCharges.length === 1 ? "entry" : "entries"}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <SortableTh
                        label="Charge"
                        href={sortHref("charge")}
                        active={sortColumn === "charge"}
                        dir={sortDir}
                      />
                      {isAdminView && (
                        <SortableTh
                          label="Tenant / unit"
                          href={sortHref("tenant")}
                          active={sortColumn === "tenant"}
                          dir={sortDir}
                        />
                      )}
                      <SortableTh
                        label="Due"
                        href={sortHref("due")}
                        active={sortColumn === "due"}
                        dir={sortDir}
                      />
                      <SortableTh
                        label="Amount"
                        href={sortHref("amount")}
                        active={sortColumn === "amount"}
                        dir={sortDir}
                        align="right"
                      />
                      <SortableTh
                        label="Balance"
                        href={sortHref("balance")}
                        active={sortColumn === "balance"}
                        dir={sortDir}
                        align="right"
                      />
                      <SortableTh
                        label="Paid"
                        href={sortHref("paid")}
                        active={sortColumn === "paid"}
                        dir={sortDir}
                        align="right"
                      />
                      <SortableTh
                        label="Status"
                        href={sortHref("status")}
                        active={sortColumn === "status"}
                        dir={sortDir}
                        align="right"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleCharges.map((charge) => {
                      const tenantName = tenantLabel(charge);
                      return (
                        <FinanceChargeRow
                          key={charge.id}
                          href={`/protected/finances/${charge.id}`}
                          label={`View details for ${charge.title}`}
                        >
                          <td className="px-4 py-3.5 align-middle">
                            <span className="font-medium">{charge.title}</span>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {CHARGE_TYPE_LABEL[charge.type]}
                              {charge.periodStart
                                ? ` · ${format(charge.periodStart, "MMM yyyy")}`
                                : ""}
                            </p>
                          </td>
                          {isAdminView && (
                            <td className="px-4 py-3.5 align-middle">
                              <p>{tenantName}</p>
                              <p className="text-xs text-muted-foreground">
                                {charge.unit.property.name} ·{" "}
                                {formatUnitLabel(
                                  charge.unit.property.propertyType,
                                  charge.unit.label,
                                )}
                              </p>
                            </td>
                          )}
                          <td className="whitespace-nowrap px-4 py-3.5 align-middle text-muted-foreground">
                            {format(charge.dueDate, "dd MMM yyyy")}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 align-middle text-right tabular-nums">
                            {formatMoney(charge.amount)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 align-middle text-right font-medium tabular-nums">
                            {formatMoney(chargeBalance(charge))}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 align-middle text-right text-muted-foreground tabular-nums">
                            {formatMoney(approvedTotal(charge.payments))}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 align-middle text-right">
                            <ChargeStatusBadge charge={charge} />
                          </td>
                        </FinanceChargeRow>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {(isAdmin || isOwner) && (
          <div className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
            <AdminTools tenancies={activeTenancies} />
          </div>
        )}
      </div>
    </div>
  );
}

function AdminTools({
  tenancies,
}: {
  tenancies: Array<{
    id: string;
    tenant: {
      email: string;
      firstName: string | null;
      lastName: string | null;
    };
    unit: { label: string; property: { name: string } };
  }>;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="h-4 w-4" />
            Generate monthly rent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3">
            <Field label="Rent month">
              <Input
                name="month"
                type="month"
                defaultValue={monthInputValue()}
                required
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Safe to run again: existing rent for the same tenancy and month is
              skipped.
            </p>
            <SubmitButton
              formAction={generateRentChargesAction}
              className="w-full"
              pendingText="Generating..."
            >
              Generate rent
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" />
            Add a charge or bill
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tenancies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Start a tenancy before adding rent or bills.
            </p>
          ) : (
            <form className="space-y-4" encType="multipart/form-data">
              <Field label="Tenant / unit">
                <Select name="tenancyId" defaultValue="" required>
                  <option value="" disabled>
                    Select tenancy
                  </option>
                  {tenancies.map((tenancy) => (
                    <option key={tenancy.id} value={tenancy.id}>
                      {tenancy.unit.property.name} · {tenancy.unit.label} ·{" "}
                      {tenancy.tenant.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <Select name="type" defaultValue={ChargeType.other}>
                    {NON_UTILITY_CHARGE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CHARGE_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Amount (OMR)">
                  <Input
                    name="amount"
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                  />
                </Field>
              </div>
              <Field label="Title">
                <Input
                  name="title"
                  placeholder="Parking fee · August 2026"
                  required
                />
              </Field>
              <Field label="Due date">
                <Input
                  name="dueDate"
                  type="date"
                  defaultValue={dateInputValue()}
                  required
                />
              </Field>
              <Field label="Billing month">
                <Input
                  name="period"
                  type="month"
                  defaultValue={monthInputValue()}
                />
              </Field>
              <Field label="Bill / invoice (optional)">
                <UploadFileInput name="bill" />
              </Field>
              <Field label="Notes">
                <Textarea name="notes" className="min-h-16" />
              </Field>
              <SubmitButton
                formAction={createChargeAction}
                className="w-full"
                pendingText="Adding..."
              >
                Add to ledger
              </SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  danger = false,
  href,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint: string;
  danger?: boolean;
  href?: string;
  active?: boolean;
}) {
  const content = (
    <CardContent className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight ${danger ? "text-rose-700" : ""}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </CardContent>
  );

  if (!href) {
    return <Card>{content}</Card>;
  }

  return (
    <Link href={href} className="block no-underline">
      <Card
        className={`transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${
          active ? "border-primary/50 ring-1 ring-primary/30" : ""
        }`}
      >
        {content}
      </Card>
    </Link>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function filterHref(
  params: Record<string, string | string[] | undefined>,
  update: Record<string, string>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.set(key, value);
  }
  for (const [key, value] of Object.entries(update)) search.set(key, value);
  return `/protected/finances?${search.toString()}`;
}
