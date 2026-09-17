import { notFound } from "next/navigation";
import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { PendingLink } from "@/components/ui/pending-link";
import { formatMoney, moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { requireAnyRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

/** The "Units Ledgers" index one level above each unit's own ledger — pick
 * a unit here, then drill into its full Due/Paid Date | Trans. Number |
 * Balance history on the page it links to. */
export default async function PropertyUnitLedgersPage({ params }: PageProps) {
  const { id: propertyId } = (await params) as { id: string };
  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = user.userType === UserType.owner;

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      name: true,
      buildingNumber: true,
      propertyType: { select: { unitPrefix: true, hasFloors: true, unitNounPlural: true } },
      units: {
        orderBy: [{ floor: "asc" }, { label: "asc" }],
        where: isOwner ? { ownerId: user.id } : undefined,
        select: {
          id: true,
          label: true,
          floor: true,
          serviceChargeBalance: true,
          owner: { select: { firstName: true, lastName: true, email: true } },
          tenant: { select: { email: true } },
        },
      },
    },
  });

  if (!property) {
    notFound();
  }

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <PendingLink href="/protected/properties" className="hover:text-foreground">
          Properties
        </PendingLink>
        <span>/</span>
        <PendingLink
          href={`/protected/properties/${propertyId}`}
          className="hover:text-foreground"
        >
          {property.name}
        </PendingLink>
        <span>/</span>
        <span className="font-medium text-foreground">Unit Ledgers</span>
      </div>

      <PageHeader
        title="Unit Ledgers"
        description={`${property.name} · pick a unit to view its full ledger`}
        back={{
          href: `/protected/properties/${propertyId}`,
          label: "Back to property",
        }}
      />

      {property.units.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No units yet"
          description="Add units to this property to start tracking their ledgers."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5">Owner</th>
                  <th className="px-4 py-2.5">Tenant</th>
                  <th className="px-4 py-2.5 text-right">Balance</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {property.units.map((unit) => {
                  const unitLabel = formatUnitLabel(property.propertyType, unit.label);
                  const balance = moneyValue(unit.serviceChargeBalance);
                  const ownerName = unit.owner
                    ? [unit.owner.firstName, unit.owner.lastName]
                        .filter(Boolean)
                        .join(" ") || unit.owner.email
                    : "Unassigned";
                  return (
                    <tr key={unit.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{unitLabel}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {ownerName}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {unit.tenant?.email ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right font-medium",
                          balance < 0 ? "text-emerald-600" : "text-rose-600",
                        )}
                      >
                        {balance < 0
                          ? `Credit ${formatMoney(Math.abs(balance))}`
                          : formatMoney(balance)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <PendingLink
                          href={`/protected/properties/${propertyId}/units/${unit.id}/ledger`}
                          className="font-medium text-primary hover:underline"
                        >
                          View Ledger
                        </PendingLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
