import { format } from "date-fns";
import {
  ChevronRight,
  ClipboardList,
  Image as ImageIcon,
  MapPin,
  PauseCircle,
  Plus,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PriorityBadge, StatusBadge } from "@/lib/status";
import { attachmentUrl } from "@/lib/utils";
import { formatUnitLabel } from "@/lib/property-types";
import { PageProps } from "@/types/page";

export default async function MyRequestsPage({ searchParams }: PageProps) {
  const message = (await searchParams) as unknown as Message;
  const user = await requireUser();

  const [requests, unit] = await Promise.all([
    prisma.maintenanceRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { attachments: true },
    }),
    prisma.unit.findUnique({
      where: { tenantId: user.id },
      include: { property: { include: { propertyType: true } } },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8">
      <PageHeader
        title="My requests"
        description={
          unit
            ? `${unit.property.name} · ${formatUnitLabel(
                unit.property.propertyType,
                unit.label,
              )}`
            : "You are not assigned to a unit yet."
        }
      >
        {unit && (
          <ButtonLink href="/protected/report">
            <Plus className="h-4 w-4" />
            Report an issue
          </ButtonLink>
        )}
      </PageHeader>

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      {requests.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No requests yet"
          description={
            unit
              ? "When something breaks at your place, report it here and you can track it all the way to completion."
              : "Once your administrator assigns you a unit, you'll be able to report issues."
          }
        >
          {unit && (
            <ButtonLink href="/protected/report">Report an issue</ButtonLink>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Link
              key={request.id}
              href={`/protected/requests/${request.id}`}
              className="block"
            >
              <Card className="transition-all hover:border-primary/40 hover:shadow-md">
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="font-semibold">{request.title}</h3>
                    <StatusBadge status={request.status} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={request.priority} />
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {request.location}
                    </span>
                    {request.attachments.length > 0 && (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" />
                        {request.attachments.length}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {request.description.length > 140
                      ? `${request.description.slice(0, 140)}…`
                      : request.description}
                  </p>

                  {request.status === "on_hold" && (
                    <div className="flex items-start gap-2 rounded-md border border-[#dc961e]/30 bg-[#dc961e]/10 p-3 text-sm text-[#8a5c10]">
                      <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p className="line-clamp-2">
                        {request.holdReason ?? "Waiting for admin review."}
                      </p>
                    </div>
                  )}

                  {request.attachments.length > 0 && (
                    <div className="flex gap-2">
                      {request.attachments.slice(0, 3).map((attachment) => (
                        <div
                          key={attachment.id}
                          className="h-14 w-14 overflow-hidden rounded-lg border bg-muted"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={attachmentUrl(attachment.id)}
                            alt={attachment.fileName}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span>Reported {format(request.createdAt, "PPP")}</span>
                    <span className="flex items-center gap-0.5 font-medium text-primary">
                      View details
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
