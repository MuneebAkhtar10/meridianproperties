import { format } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FileWarning,
  Filter,
  Plus,
  Search,
  Wallet,
} from "lucide-react";

import { BulkGenerateServiceChargeModal } from "@/components/bulk-generate-service-charge-modal";
import { StatTile, TileMoney } from "@/components/dashboard-ui";
import { EmptyState } from "@/components/empty-state";
import { FormMessage, type Message } from "@/components/form-message";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingLink } from "@/components/ui/pending-link";
import { Select } from "@/components/ui/select";
import { formatMoney, formatOmrAmount } from "@/lib/finance";
import {
  INVOICE_BUCKETS,
  INVOICE_KIND_LABEL,
  type InvoiceBucket,
  type InvoiceKind,
} from "@/lib/invoice-options";
import { listOwnerInvoices } from "@/lib/invoices";
import { collectsServiceCharge } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";
import { cn } from "@/lib/utils";

const BUCKET_LABEL: Record<InvoiceBucket, string> = {
  open: "Open",
  billed: "Billed",
  unpaid: "Unpaid",
  overdue: "Overdue",
  drafts: "Drafts",
  paid: "Paid",
  all: "All",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);

  const raw = (await searchParams) as Record<string, string | string[] | undefined> &
    Message;
  const message = raw as Message;
  const bucketRaw = firstParam(raw.bucket) ?? "open";
  const bucket: InvoiceBucket = INVOICE_BUCKETS.includes(bucketRaw as InvoiceBucket)
    ? (bucketRaw as InvoiceBucket)
    : "open";
  const propertyId = firstParam(raw.property) || undefined;
  const ownerId = firstParam(raw.owner) || undefined;
  const kindRaw = firstParam(raw.kind);
  const kind: InvoiceKind | "all" =
    kindRaw === "service_charge" || kindRaw === "additional" ? kindRaw : "all";
  const search = firstParam(raw.q) ?? "";
  const unitId = firstParam(raw.unit) || undefined;

  const [result, properties, owners, funds] = await Promise.all([
    listOwnerInvoices({
      bucket,
      propertyId: propertyId && propertyId !== "all" ? propertyId : undefined,
      ownerId: ownerId && ownerId !== "all" ? ownerId : undefined,
      kind,
      search,
      unitId,
    }),
    prisma.property.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        propertyType: {
          select: {
            isOwnerAssociation: true,
            isBuildingManagement: true,
            showRentBills: true,
            showMaintenance: true,
            hasCommonAreas: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { userType: UserType.owner },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
    prisma.fund.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true },
    }),
  ]);

  const buildHref = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const nextBucket = next.bucket ?? bucket;
    const nextProperty = next.property ?? propertyId ?? "all";
    const nextOwner = next.owner ?? ownerId ?? "all";
    const nextKind = next.kind ?? kind;
    const nextSearch = next.q ?? search;
    if (nextBucket !== "open") params.set("bucket", nextBucket);
    if (nextProperty && nextProperty !== "all") params.set("property", nextProperty);
    if (nextOwner && nextOwner !== "all") params.set("owner", nextOwner);
    if (nextKind !== "all") params.set("kind", nextKind);
    if (nextSearch) params.set("q", nextSearch);
    const qs = params.toString();
    return `/protected/invoices${qs ? `?${qs}` : ""}`;
  };

  const { rows, totals } = result;
  const chips: InvoiceBucket[] = ["open", "billed", "unpaid", "overdue", "drafts", "paid", "all"];
  const serviceChargeProperties = properties
    .filter((property) => collectsServiceCharge(property.propertyType))
    .map(({ id, name }) => ({ id, name }));

  const brandButton =
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90";

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Invoices & payments"
        description="Open balances, billed invoices, and one-off charges against a unit — including every invoice already issued."
      >
        <BulkGenerateServiceChargeModal
          properties={serviceChargeProperties}
          owners={owners}
          funds={funds}
          redirectTo="/protected/invoices?bucket=billed"
          triggerLabel="Service-charge run"
        />
        <ButtonLink href="/protected/invoices/new" className={brandButton}>
          <Plus className="h-4 w-4" />
          New invoice
        </ButtonLink>
      </PageHeader>

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Outstanding"
          value={<TileMoney amount={totals.outstanding} />}
          hint="Still to collect"
          icon={<Wallet className="h-4 w-4" />}
          color="amber"
          href={buildHref({ bucket: bucket === "unpaid" ? "open" : "unpaid" })}
        />
        <StatTile
          label="Overdue invoices"
          value={totals.overdueCount}
          hint="Past due date"
          icon={<AlertCircle className="h-4 w-4" />}
          color="rose"
          href={buildHref({ bucket: bucket === "overdue" ? "open" : "overdue" })}
        />
        <StatTile
          label="Drafts to review"
          value={totals.draftCount}
          hint="Not issued yet"
          icon={<FileWarning className="h-4 w-4" />}
          color="violet"
          href={buildHref({ bucket: bucket === "drafts" ? "open" : "drafts" })}
        />
        <StatTile
          label="Collected this year"
          value={<TileMoney amount={totals.collectedThisYear} />}
          hint="Paid in the current year"
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="emerald"
          href={buildHref({ bucket: bucket === "paid" ? "open" : "paid" })}
        />
      </div>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <div className="border-b border-border/60 bg-primary/[0.04] px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap gap-1 rounded-lg bg-white/80 p-1 ring-1 ring-inset ring-border/60">
            {chips.map((value) => {
              const active = bucket === value;
              const count =
                value === "billed"
                  ? totals.billedCount
                  : value === "drafts"
                    ? totals.draftCount
                    : value === "overdue"
                      ? totals.overdueCount
                      : null;
              return (
                <PendingLink
                  key={value}
                  href={buildHref({ bucket: value })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  {BUCKET_LABEL[value]}
                  {count != null ? (
                    <span
                      className={cn(
                        "tabular-nums text-[11px]",
                        active ? "text-white/80" : "text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </PendingLink>
              );
            })}
          </div>
        </div>

        <form
          action="/protected/invoices"
          className="flex flex-wrap items-end gap-3 px-3 py-3 sm:px-4"
        >
          {bucket !== "open" && <input type="hidden" name="bucket" value={bucket} />}
          {unitId && <input type="hidden" name="unit" value={unitId} />}
          <div className="min-w-[16rem] flex-1 space-y-1">
            <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={search}
                placeholder="Number, owner or property"
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-40 space-y-1">
            <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Type
            </Label>
            <Select name="kind" defaultValue={kind}>
              <option value="all">All types</option>
              <option value="service_charge">{INVOICE_KIND_LABEL.service_charge}</option>
              <option value="additional">{INVOICE_KIND_LABEL.additional}</option>
            </Select>
          </div>
          <div className="w-48 space-y-1">
            <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Property
            </Label>
            <Select name="property" defaultValue={propertyId ?? "all"}>
              <option value="all">All properties</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-52 space-y-1">
            <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Owner
            </Label>
            <Select name="owner" defaultValue={ownerId ?? "all"}>
              <option value="all">All owners</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {[owner.firstName, owner.lastName].filter(Boolean).join(" ") ||
                    owner.email}
                </option>
              ))}
            </Select>
          </div>
          <button
            type="submit"
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium",
              brandButton,
            )}
          >
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </form>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="inline-flex items-center gap-2 font-medium text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-3.5 w-3.5" />
          </span>
          {rows.length} invoice{rows.length === 1 ? "" : "s"}
        </p>
        <p className="text-muted-foreground">
          Billed{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatMoney(totals.billedAmount)}
          </span>
          <span className="mx-1.5 text-border">·</span>
          Outstanding{" "}
          <span className="font-medium tabular-nums text-amber-700">
            {formatMoney(totals.outstanding)}
          </span>
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={bucket === "open" ? "No open invoices" : "No invoices in this view"}
          description="Issue a service-charge run, or create a one-off invoice against a unit. Everything billed stays on Billed."
        >
          <ButtonLink href="/protected/invoices/new" className={brandButton}>
            New invoice
          </ButtonLink>
        </EmptyState>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary/[0.06] text-left text-[11px] font-semibold uppercase tracking-wide text-primary">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3.5 align-top">
                      <PendingLink
                        href={`/protected/invoices/${row.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        #{row.invoiceNumber}
                      </PendingLink>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                            row.kind === "service_charge"
                              ? "bg-primary/10 text-primary ring-primary/20"
                              : "bg-violet-50 text-violet-700 ring-violet-600/15",
                          )}
                        >
                          {INVOICE_KIND_LABEL[row.kind]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.unitLabel}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-top text-foreground">
                      {row.ownerName}
                    </td>
                    <td className="px-4 py-3.5 align-top">{row.propertyName}</td>
                    <td className="px-4 py-3.5 align-top tabular-nums text-muted-foreground">
                      {format(row.issueDate, "dd/MM/yyyy")}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3.5 align-top tabular-nums",
                        row.displayStatus === "overdue"
                          ? "font-medium text-rose-700"
                          : "text-muted-foreground",
                      )}
                    >
                      {format(row.dueDate, "dd/MM/yyyy")}
                    </td>
                    <td className="px-4 py-3.5 text-right align-top font-medium tabular-nums">
                      {formatOmrAmount(row.currentAmount)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3.5 text-right align-top tabular-nums",
                        row.outstanding > 0.0005
                          ? "font-semibold text-amber-700"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatOmrAmount(row.outstanding)}
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <InvoiceStatusBadge status={row.displayStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
