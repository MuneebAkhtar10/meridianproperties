import { format } from "date-fns";
import {
  Home,
  Image as ImageIcon,
  MapPin,
  PauseCircle,
  User,
  Wrench,
} from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { RequestTimeline } from "@/components/request-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { requireAnyRole } from "@/lib/session";
import { formatOmanAddress } from "@/lib/oman";
import { PriorityBadge, StatusBadge } from "@/lib/status";
import { attachmentUrl } from "@/lib/utils";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function MaintenanceDetailPage({ params }: PageProps) {
  const { id } = await params;

  const user = await requireAnyRole(UserType.admin, UserType.owner);

  const request = await prisma.maintenanceRequest.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, phone: true } },
      assignedTo: { select: { email: true } },
      unit: { include: { property: { include: { propertyType: true } } } },
      attachments: true,
      taskLogs: {
        orderBy: { createdAt: "asc" },
        include: { changedBy: { select: { email: true } } },
      },
      supplyRequests: {
        orderBy: { createdAt: "asc" },
        include: {
          requestedBy: { select: { email: true } },
          decidedBy: { select: { email: true } },
        },
      },
    },
  });

  if (
    !request ||
    (user.userType === UserType.owner &&
      request.unit?.property.ownerId !== user.id)
  ) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <PageHeader
        title={request.title}
        back={{ href: "/protected/maintenance", label: "All requests" }}
      >
        <PriorityBadge priority={request.priority} />
        <StatusBadge status={request.status} />
      </PageHeader>

      {request.status === "on_hold" && (
        <Card className="border-orange-200 bg-orange-50 text-orange-900">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 font-semibold">
              <PauseCircle className="h-4 w-4" />
              Waiting in the admin hold queue
            </div>
            <p className="whitespace-pre-wrap text-sm">
              {request.holdReason ?? "No hold reason was recorded."}
            </p>
            <p className="text-xs text-orange-800/80">
              {request.heldAt
                ? `Held ${format(request.heldAt, "d MMM yyyy, HH:mm")}. `
                : ""}
              {request.resumeRequestedAt
                ? "The blocker is resolved. Return to the request list to choose a worker and resume."
                : "An admin can choose the previous worker or assign a different one from the request list."}
            </p>
          </CardContent>
        </Card>
      )}

      {request.supplyRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supply requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {request.supplyRequests.map((supplyRequest) => (
              <div
                key={supplyRequest.id}
                className="space-y-1 rounded-lg border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{supplyRequest.item}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      requested by {supplyRequest.requestedBy.email}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      supplyRequest.status === "approved"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                        : supplyRequest.status === "denied"
                          ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                          : "bg-sky-50 text-sky-700 ring-sky-600/20"
                    }`}
                  >
                    {supplyRequest.status === "pending"
                      ? "Pending"
                      : supplyRequest.status === "approved"
                        ? "Approved"
                        : "Denied"}
                  </span>
                </div>
                {supplyRequest.notes && (
                  <p className="text-xs text-muted-foreground">
                    {supplyRequest.notes}
                  </p>
                )}
                {supplyRequest.receiptPath && (
                  <a
                    href={`/api/supply-receipt/${supplyRequest.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
                  >
                    View uploaded receipt
                    {supplyRequest.workerCost != null
                      ? ` · worker says they paid ${formatMoney(supplyRequest.workerCost)}`
                      : ""}
                  </a>
                )}
                {supplyRequest.adminNote && (
                  <p className="text-xs text-muted-foreground">
                    {supplyRequest.decidedBy?.email ?? "Admin"}:{" "}
                    {supplyRequest.adminNote}
                  </p>
                )}
                {supplyRequest.status === "approved" &&
                  supplyRequest.cost != null && (
                    <p className="text-xs font-medium text-emerald-700">
                      Cost: {formatMoney(supplyRequest.cost)}
                      {supplyRequest.decidedBy
                        ? ` · approved by ${supplyRequest.decidedBy.email}`
                        : ""}
                      {supplyRequest.decidedAt
                        ? ` on ${format(supplyRequest.decidedAt, "d MMM yyyy")}`
                        : ""}
                    </p>
                  )}
              </div>
            ))}
            {request.status === "on_hold" &&
              request.supplyRequests.some((s) => s.status === "pending") && (
                <p className="text-xs text-muted-foreground">
                  Approve or deny pending requests from the{" "}
                  <Link
                    href="/protected/maintenance?status=on_hold"
                    className="underline"
                  >
                    hold queue
                  </Link>
                  .
                </p>
              )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {request.unit ? (
              <>
                <p className="flex items-center gap-2 font-medium">
                  <Home className="h-4 w-4 text-muted-foreground" />
                  <Link
                    href={`/protected/properties/${request.unit.propertyId}`}
                    className="hover:underline"
                  >
                    {request.unit.property.name}
                  </Link>{" "}
                  ·{" "}
                  {formatUnitLabel(
                    request.unit.property.propertyType,
                    request.unit.label,
                  )}
                </p>
                <p className="text-muted-foreground">
                  {formatOmanAddress(request.unit.property)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">No unit linked.</p>
            )}

            <p className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {request.location}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">People</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              {request.user.email}
              {request.user.phone ? ` · ${request.user.phone}` : ""}
            </p>
            <p className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              {request.assignedTo?.email ?? (
                <span className="text-muted-foreground">Not assigned</span>
              )}
            </p>
            <p className="text-muted-foreground">
              Reported {format(request.createdAt, "PPP")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{request.description}</p>
        </CardContent>
      </Card>

      {request.attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Photos ({request.attachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {request.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachmentUrl(attachment.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group space-y-1"
                >
                  <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
                    {attachment.fileType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={attachmentUrl(attachment.id)}
                        alt={attachment.fileName}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {attachment.fileName}
                  </p>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestTimeline
            currentStatus={request.status}
            logs={request.taskLogs}
          />
        </CardContent>
      </Card>
    </div>
  );
}
