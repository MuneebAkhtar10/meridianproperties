import { format } from "date-fns";
import { notFound } from "next/navigation";
import { FileText, Trash2 } from "lucide-react";

import {
  createBuildingServiceContractAction,
  deleteBuildingServiceContractAction,
} from "@/app/building-contract-actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dateInputValue, formatMoney } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const CONTRACT_TYPE_SUGGESTIONS = [
  "Elevator Maintenance",
  "Fire Extinguisher Servicing",
  "Fire Alarm & Suppression System",
  "Generator Maintenance",
  "Pest Control",
  "Water Tank Cleaning",
  "Pump & Booster Maintenance",
  "Swimming Pool Maintenance",
  "Landscaping",
  "Security / CCTV",
];

const EXPIRY_WARNING_DAYS = 30;

function contractStatus(endDate: Date | null): {
  label: string;
  className: string;
} {
  if (!endDate) {
    return {
      label: "Ongoing",
      className: "bg-slate-100 text-slate-600 ring-slate-500/20",
    };
  }
  const today = new Date();
  const warningCutoff = new Date(
    today.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000,
  );
  if (endDate < today) {
    return {
      label: "Expired",
      className: "bg-rose-50 text-rose-700 ring-rose-600/20",
    };
  }
  if (endDate <= warningCutoff) {
    return {
      label: "Expiring soon",
      className: "bg-amber-50 text-amber-700 ring-amber-600/20",
    };
  }
  return {
    label: "Active",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  };
}

/**
 * "Agreement with building" — the property manager's own contracts for
 * shared building infrastructure (lift, fire extinguisher, generator,
 * pest control, ...), distinct from a tenant's own parking slot agreement
 * (managed on the Tenancies page). See BuildingServiceContract in
 * schema.prisma.
 */
export default async function BuildingContractsPage({ params }: PageProps) {
  await requireRole(UserType.admin);

  const { id: propertyId } = (await params) as { id: string };

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true },
  });
  if (!property) {
    notFound();
  }

  const [contracts, suppliers] = await Promise.all([
    prisma.buildingServiceContract.findMany({
      where: { propertyId },
      orderBy: [{ endDate: "asc" }, { startDate: "desc" }],
      include: { supplier: { select: { companyName: true } } },
    }),
    prisma.supplier.findMany({
      where: {
        active: true,
        OR: [
          { availableForAllProperties: true },
          { properties: { some: { propertyId } } },
        ],
      },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
  ]);

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Building Contracts"
        description={`${property.name} · lift, fire safety and other shared-infrastructure agreements`}
        back={{
          href: `/protected/properties/${propertyId}`,
          label: "Back to property",
        }}
      />

      {contracts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No building contracts yet"
          description="Add the property's agreements for lift maintenance, fire extinguisher servicing and similar shared infrastructure below."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Contract</th>
                  <th className="px-4 py-2.5">Vendor</th>
                  <th className="px-4 py-2.5">Start</th>
                  <th className="px-4 py-2.5">End</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Document</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {contracts.map((contract) => {
                  const status = contractStatus(contract.endDate);
                  return (
                    <tr key={contract.id}>
                      <td className="px-4 py-2.5 align-top">
                        <div className="font-medium">{contract.contractType}</div>
                        {contract.notes && (
                          <div className="text-xs text-muted-foreground">
                            {contract.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-top text-muted-foreground">
                        {contract.supplier?.companyName ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 align-top text-muted-foreground">
                        {format(contract.startDate, "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-2.5 align-top text-muted-foreground">
                        {contract.endDate
                          ? format(contract.endDate, "d MMM yyyy")
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right align-top font-medium">
                        {contract.amount ? formatMoney(contract.amount) : "—"}
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        {contract.documentFilePath ? (
                          <a
                            href={`/api/building-contracts/${contract.id}/document`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-primary hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <form action={deleteBuildingServiceContractAction}>
                          <input type="hidden" name="contractId" value={contract.id} />
                          <input type="hidden" name="propertyId" value={propertyId} />
                          <SubmitButton
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">Add a contract</h3>
        <form
          action={createBuildingServiceContractAction}
          className="space-y-3"
          encType="multipart/form-data"
        >
          <input type="hidden" name="propertyId" value={propertyId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contractType">Contract type</Label>
              <Input
                id="contractType"
                name="contractType"
                list="contract-type-suggestions"
                placeholder="e.g. Elevator Maintenance"
                required
              />
              <datalist id="contract-type-suggestions">
                {CONTRACT_TYPE_SUGGESTIONS.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplierId">Vendor</Label>
              <Select id="supplierId" name="supplierId" defaultValue="">
                <option value="">— None —</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.companyName}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={dateInputValue()}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" name="endDate" type="date" />
              <p className="text-xs text-muted-foreground">
                Leave blank for an open-ended contract.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (OMR)</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min={0}
                step="0.001"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="document">Signed contract (optional)</Label>
            <Input id="document" name="document" type="file" accept=".pdf,.png,.jpg,.jpeg" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" className="min-h-16" placeholder="Optional" />
          </div>

          <SubmitButton pendingText="Saving...">Add contract</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
