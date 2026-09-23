import { FormMessage, type Message } from "@/components/form-message";
import { NewInvoiceForm } from "@/components/new-invoice-form";
import { PageHeader } from "@/components/page-header";
import { getExpenseCategoriesWithSubcategories } from "@/lib/expenses";
import {
  collectsServiceCharge,
  formatUnitLabel,
} from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewInvoicePage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);
  const raw = (await searchParams) as Record<string, string | string[] | undefined> &
    Message;
  const message = raw as Message;
  const initialPropertyId = firstParam(raw.property);
  const initialUnitId = firstParam(raw.unit);

  const [properties, units, funds, categories] = await Promise.all([
    prisma.property.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.unit.findMany({
      orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
      select: {
        id: true,
        propertyId: true,
        label: true,
        serviceChargeAmount: true,
        owner: { select: { email: true, firstName: true, lastName: true } },
        property: {
          select: {
            propertyType: {
              select: {
                unitPrefix: true,
                hasFloors: true,
                isOwnerAssociation: true,
                isBuildingManagement: true,
                showRentBills: true,
                showMaintenance: true,
                hasCommonAreas: true,
              },
            },
          },
        },
      },
    }),
    prisma.fund.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    getExpenseCategoriesWithSubcategories(),
  ]);

  const defaultFundId = funds[0]?.id ?? "";

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="New invoice"
        description="Bill a unit for extra charges or service charge. Pick the unit, add the lines, and issue."
        back={{ href: "/protected/invoices", label: "All invoices" }}
      />
      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}
      {!defaultFundId ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Add at least one fund in settings before issuing invoices.
        </p>
      ) : (
        <NewInvoiceForm
          properties={properties}
          units={units.map((unit) => ({
            id: unit.id,
            propertyId: unit.propertyId,
            label: formatUnitLabel(unit.property.propertyType, unit.label),
            serviceChargeAmount: unit.serviceChargeAmount
              ? String(unit.serviceChargeAmount)
              : null,
            collectsServiceCharge: collectsServiceCharge(unit.property.propertyType),
            owner: unit.owner,
          }))}
          categories={categories.map((category) => ({
            id: category.id,
            label: category.label,
          }))}
          defaultFundId={defaultFundId}
          initialPropertyId={initialPropertyId}
          initialUnitId={initialUnitId}
        />
      )}
    </div>
  );
}
