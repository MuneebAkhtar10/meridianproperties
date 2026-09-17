import { format } from "date-fns";
import { FileText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PendingLink } from "@/components/ui/pending-link";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/finance";
import { getAgreementListData } from "@/lib/tenant-report";
import { prisma } from "@/lib/prisma";
import { requireAnyRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const STATUS_BADGE: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  "Ending soon": "bg-amber-50 text-amber-700 ring-amber-600/20",
  Ended: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

/**
 * Spec #25 "Agreement List" — a flat, portfolio-wide table of every tenant
 * agreement (active and ended), distinct from the Tenant Report (spec #26,
 * app/protected/tenancies/report/page.tsx), which only covers one
 * property's active tenancies with a different column set.
 */
type StatusFilter = "all" | "Active" | "Ending soon" | "Ended";

export default async function AgreementListPage({ searchParams }: PageProps) {
  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = user.userType === UserType.owner;

  const params = (await searchParams) as unknown as {
    property?: string;
    tenant?: string;
    status?: string;
    q?: string;
  };
  const propertyFilter =
    typeof params.property === "string" ? params.property : "all";
  const tenantFilter = typeof params.tenant === "string" ? params.tenant : "all";
  const statusFilter = (
    typeof params.status === "string" ? params.status : "all"
  ) as StatusFilter;
  const search = typeof params.q === "string" ? params.q.trim() : "";

  const [allRows, properties, tenants] = await Promise.all([
    getAgreementListData(propertyFilter, user, tenantFilter),
    prisma.property.findMany({
      // OA properties never have tenant agreements.
      where: { propertyType: { name: { not: "building" } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: {
        userType: UserType.user,
        tenancies: { some: isOwner ? { unit: { ownerId: user.id } } : {} },
      },
      orderBy: { email: "asc" },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
  ]);

  const searchLower = search.toLowerCase();
  const rows = allRows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (!searchLower) return true;
    return (
      row.tenantName.toLowerCase().includes(searchLower) ||
      row.agreementNo.toLowerCase().includes(searchLower) ||
      row.unitNo.toLowerCase().includes(searchLower) ||
      row.buildingLabel.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Agreement List"
        description="Every tenant agreement across the portfolio, active and ended."
        back={{ href: "/protected/tenancies", label: "All tenancies" }}
      />

      <form className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="agreement-property" className="text-xs">
            Property
          </Label>
          <Select
            id="agreement-property"
            name="property"
            defaultValue={propertyFilter}
          >
            <option value="all">All properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="agreement-tenant" className="text-xs">
            Tenant
          </Label>
          <Select id="agreement-tenant" name="tenant" defaultValue={tenantFilter}>
            <option value="all">All tenants</option>
            {tenants.map((tenant) => {
              const name = [tenant.firstName, tenant.lastName]
                .filter(Boolean)
                .join(" ");
              return (
                <option key={tenant.id} value={tenant.id}>
                  {name ? `${name} · ${tenant.email}` : tenant.email}
                </option>
              );
            })}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="agreement-status" className="text-xs">
            Status
          </Label>
          <Select id="agreement-status" name="status" defaultValue={statusFilter}>
            <option value="all">All statuses</option>
            <option value="Active">Active</option>
            <option value="Ending soon">Ending soon</option>
            <option value="Ended">Ended</option>
          </Select>
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="agreement-search" className="text-xs">
            Search
          </Label>
          <input
            id="agreement-search"
            name="q"
            type="text"
            defaultValue={search}
            placeholder="Tenant, agreement no., unit, building…"
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg border px-4 text-sm font-medium hover:bg-muted"
        >
          Apply
        </button>
        {(propertyFilter !== "all" ||
          tenantFilter !== "all" ||
          statusFilter !== "all" ||
          search) && (
          <PendingLink
            href="/protected/tenancies/agreements"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </PendingLink>
        )}
      </form>

      <p className="text-xs text-muted-foreground">
        {rows.length} agreement{rows.length === 1 ? "" : "s"}
        {rows.length !== allRows.length ? ` of ${allRows.length}` : ""}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={allRows.length === 0 ? "No agreements yet" : "No agreements match these filters"}
          description={
            allRows.length === 0
              ? "Tenant agreements will show up here once created."
              : "Try clearing a filter or broadening your search."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Building Name/No.</th>
                  <th className="px-3 py-2.5 font-medium">Agreement No</th>
                  <th className="px-3 py-2.5 font-medium">Tenant Name</th>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Rented Unit No</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Advance Payment
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Payment Per Month
                  </th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Expiry Date</th>
                  <th className="px-3 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5">{row.buildingLabel}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.agreementNo}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{row.tenantName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.contact}
                    </td>
                    <td className="px-3 py-2.5">{row.unitNo}</td>
                    <td className="px-3 py-2.5 text-right">
                      {formatMoney(row.advancePayment)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">
                      {formatMoney(row.paymentPerMonth)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_BADGE[row.status]}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.expiryDate ? format(row.expiryDate, "dd/MM/yyyy") : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <PendingLink
                        href={`/protected/tenancies?property=${row.propertyId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        Manage
                      </PendingLink>
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
