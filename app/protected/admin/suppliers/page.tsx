import { Building2, Mail, Phone, Pencil } from "lucide-react";

import { deleteSupplierAction } from "@/app/supplier-actions";
import { EmptyState } from "@/components/empty-state";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function SuppliersPage({ searchParams }: PageProps) {
  const message = (await searchParams) as unknown as Message;
  await requireRole(UserType.admin);

  const [suppliers, supplierCounts] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { companyName: "asc" },
      include: {
        categories: { include: { category: { select: { label: true } } } },
        properties: { include: { property: { select: { name: true } } } },
      },
    }),
    prisma.expense.groupBy({ by: ["supplierId"], _count: true }),
  ]);

  const expenseCountBySupplier = new Map(
    supplierCounts
      .filter((row) => row.supplierId !== null)
      .map((row) => [row.supplierId as string, row._count]),
  );

  return (
    <div className="w-full space-y-6 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Suppliers"
        description="Vendor records — their contact details, which expense categories they cover, and which properties they can be assigned to."
      >
        <ButtonLink href="/protected/admin/suppliers/new">
          <Building2 className="h-4 w-4" />
          Add vendor
        </ButtonLink>
      </PageHeader>

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No vendors yet"
          description="Add your first supplier to start suggesting them when logging expenses."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => {
            const expenseCount = expenseCountBySupplier.get(supplier.id) ?? 0;
            const propertyLabel = supplier.availableForAllProperties
              ? "All properties"
              : supplier.properties.length === 0
                ? "No properties linked"
                : supplier.properties.length === 1
                  ? supplier.properties[0].property.name
                  : `${supplier.properties.length} properties`;

            return (
              <Card
                key={supplier.id}
                className="overflow-hidden border-border/60 shadow-sm"
              >
                <div
                  className={`h-1 ${supplier.active ? "bg-emerald-500" : "bg-slate-300"}`}
                />
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">
                        {supplier.companyName}
                      </h3>
                      {supplier.contactPerson && (
                        <p className="text-xs text-muted-foreground">
                          {supplier.contactPerson}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        supplier.active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {supplier.active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {(supplier.phone || supplier.email) && (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {supplier.phone && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 shrink-0" />
                          {supplier.phone}
                        </p>
                      )}
                      {supplier.email && (
                        <p className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 shrink-0" />
                          {supplier.email}
                        </p>
                      )}
                    </div>
                  )}

                  {supplier.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {supplier.categories.map((sc) => (
                        <span
                          key={sc.categoryId}
                          className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700"
                        >
                          {sc.category.label}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {propertyLabel}
                  </p>

                  <div className="flex items-center justify-between border-t border-border/60 pt-3">
                    <ButtonLink
                      href={`/protected/admin/suppliers/${supplier.id}/edit`}
                      variant="outline"
                      size="sm"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </ButtonLink>
                    <form>
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <span
                        title={
                          expenseCount > 0
                            ? "Remove or recategorize its expenses first"
                            : undefined
                        }
                      >
                        <SubmitButton
                          formAction={deleteSupplierAction}
                          variant="ghost"
                          size="sm"
                          pendingText="Deleting..."
                          className="text-muted-foreground hover:text-destructive"
                          disabled={expenseCount > 0}
                        >
                          Delete
                        </SubmitButton>
                      </span>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
