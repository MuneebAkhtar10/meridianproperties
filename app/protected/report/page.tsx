import { Home } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { ReportForm } from "@/components/report-form";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatUnitLabel } from "@/lib/property-types";
import { requireUser } from "@/lib/session";
import { PageProps } from "@/types/page";

export default async function ReportIssuePage({ searchParams }: PageProps) {
  const message = (await searchParams) as unknown as Message;
  const user = await requireUser();

  // The unit comes from the tenancy, so the form never asks for it.
  const unit = await prisma.unit.findUnique({
    where: { tenantId: user.id },
    include: { property: { include: { propertyType: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <PageHeader
        title="Report an issue"
        description="Tell us what needs fixing and we'll assign someone."
        back={{ href: "/protected/requests", label: "My requests" }}
      />

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      {!unit ? (
        <EmptyState
          icon={Home}
          title="No unit assigned"
          description="Your account is not linked to a unit yet, so there is nowhere to file this issue against. Please ask your administrator to assign you one."
        />
      ) : (
        <>
          <Card className="border-primary/20 bg-accent/40">
            <CardContent className="flex items-center gap-3 p-4">
              <Home className="h-4 w-4 text-accent-foreground" />
              <p className="text-sm">
                Reporting for{" "}
                <span className="font-medium">
                  {formatUnitLabel(unit.property.propertyType, unit.label)}
                </span>{" "}
                at {unit.property.name}
              </p>
            </CardContent>
          </Card>

          <ReportForm
            locationOptions={unit.property.propertyType.locationOptions}
            unitNoun={unit.property.propertyType.unitNounSingular.toLowerCase()}
          />
        </>
      )}
    </div>
  );
}
