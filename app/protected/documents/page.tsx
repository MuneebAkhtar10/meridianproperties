import { FileText } from "lucide-react";

import { EntityDocumentManager } from "@/components/entity-document-manager";
import { EmptyState } from "@/components/empty-state";
import { FormMessage, type Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { formatUnitLabel } from "@/lib/property-types";
import { requireUser } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import type { PageProps } from "@/types/page";

export default async function MyDocumentsPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const message = (await searchParams) as unknown as Message;

  const [personalDocuments, tenancies] = await Promise.all([
    prisma.entityDocument.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    user.userType === UserType.user
      ? prisma.tenancy.findMany({
          where: { tenantId: user.id },
          orderBy: [{ endDate: "asc" }, { startDate: "desc" }],
          include: {
            documents: { orderBy: { createdAt: "desc" } },
            unit: {
              include: {
                property: {
                  select: {
                    name: true,
                    propertyType: {
                      select: { hasFloors: true, unitPrefix: true },
                    },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8">
      <PageHeader
        title="My documents"
        description="Your private identity and tenancy records in one place."
      />

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <EntityDocumentManager
        documents={personalDocuments}
        targetType="user"
        targetId={user.id}
        back="/protected/documents"
        title="Personal documents"
        description="Upload your Civil ID, passport, resident card, visa or employment documents. Only you and administrators can access them."
      />

      {user.userType === UserType.user && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Tenancy documents</h2>
            <p className="text-sm text-muted-foreground">
              Agreements, municipality registration and move-in records for your
              tenancies.
            </p>
          </div>

          {tenancies.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No tenancy yet"
              description="Tenancy documents will appear after an administrator starts your tenancy."
            />
          ) : (
            tenancies.map((tenancy) => (
              <EntityDocumentManager
                key={tenancy.id}
                documents={tenancy.documents.map((document) => ({
                  ...document,
                  canDelete: document.uploadedById === user.id,
                }))}
                targetType="tenancy"
                targetId={tenancy.id}
                back="/protected/documents"
                title={`${tenancy.unit.property.name} · ${formatUnitLabel(
                  tenancy.unit.property.propertyType,
                  tenancy.unit.label,
                )}`}
                description={`${tenancy.endDate ? "Past" : "Active"} tenancy from ${tenancy.startDate.toLocaleDateString("en-OM")}.`}
              />
            ))
          )}
        </section>
      )}
    </div>
  );
}
