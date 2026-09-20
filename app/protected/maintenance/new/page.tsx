import { AdminCreateRequestForm } from "@/components/admin-create-request-form";
import { PageHeader } from "@/components/page-header";
import { FormMessage, Message } from "@/components/form-message";
import { prisma } from "@/lib/prisma";
import { isBuildingType } from "@/lib/property-types";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function NewMaintenanceRequestPage({
  searchParams,
}: PageProps) {
  const message = (await searchParams) as unknown as Message;
  await requireRole(UserType.admin);

  const [allProperties, workers] = await Promise.all([
    prisma.property.findMany({
      where: {},
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        propertyType: {
          select: {
            name: true,
            locationOptions: true,
            hasFloors: true,
            unitPrefix: true,
            isOwnerAssociation: true,
            hasCommonAreas: true,
          },
        },
        units: {
          orderBy: { label: "asc" },
          select: {
            id: true,
            label: true,
            maintenanceEnabled: true,
            tenant: { select: { email: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { userType: UserType.worker },
      select: {
        id: true,
        email: true,
        workerCategory: true,
        companyName: true,
      },
      orderBy: { email: "asc" },
    }),
  ]);

  // An OA/owners-association property never accepts maintenance requests —
  // its units all default maintenanceEnabled off and the toggle to turn it
  // back on isn't even offered for this type (see lib/property-types.ts).
  const properties = allProperties.filter(
    (property) => !isBuildingType(property.propertyType),
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 pt-4 pb-8">
      <PageHeader
        title="New maintenance request"
        description="Create a request for a tenant's unit or a shared common area, and optionally assign a worker right away."
        back={{ href: "/protected/maintenance", label: "Maintenance requests" }}
      />

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <AdminCreateRequestForm properties={properties} workers={workers} />
    </div>
  );
}
