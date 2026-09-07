import { format } from "date-fns";
import { CheckCircle2, Home, Image as ImageIcon, MapPin } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PriorityBadge } from "@/lib/status";
import { attachmentUrl } from "@/lib/utils";
import { formatUnitLabel } from "@/lib/property-types";
import { RequestStatus, UserType } from "@/lib/generated/prisma/client";
import type { Attachment, RequestWithPlace } from "@/types/maintenance";

export default async function TaskHistoryPage() {
  const worker = await requireRole(UserType.worker);

  const tasks = await prisma.maintenanceRequest.findMany({
    where: { assignedToId: worker.id, status: RequestStatus.completed },
    orderBy: { completedAt: "desc" },
    include: {
      user: { select: { email: true } },
      unit: {
        include: {
          property: {
            select: {
              name: true,
              propertyType: { select: { hasFloors: true, unitPrefix: true } },
            },
          },
        },
      },
      property: { select: { name: true } },
      attachments: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8">
      <PageHeader
        title="Task history"
        description={`${tasks.length} completed job${tasks.length === 1 ? "" : "s"}`}
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing completed yet"
          description="Jobs you finish will be listed here."
        />
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <CompletedCard
              key={task.id}
              task={task}
              attachments={task.attachments}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CompletedCard({
  task,
  attachments,
}: {
  task: RequestWithPlace;
  attachments: Attachment[];
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h3 className="font-semibold">{task.title}</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Home className="h-3.5 w-3.5" />
                {task.unit
                  ? `${task.unit.property.name} · ${formatUnitLabel(
                      task.unit.property.propertyType,
                      task.unit.label,
                    )}`
                  : "No unit linked"}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {task.location}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <PriorityBadge priority={task.priority} />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{task.description}</p>

        {attachments.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {attachments.map((attachment) => (
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
        )}

        <p className="border-t pt-3 text-xs text-muted-foreground">
          Reported {format(task.createdAt, "PPP")}
          {task.completedAt
            ? ` · completed ${format(task.completedAt, "PPP")}`
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}
