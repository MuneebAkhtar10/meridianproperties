import { format } from "date-fns";
import {
  CheckCircle2,
  Home,
  Image as ImageIcon,
  KeyRound,
  MapPin,
  PauseCircle,
  Trash2,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";

import {
  deleteRequestAction,
  requestHeldTaskResumeAction,
  updateRequestAction,
} from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { RequestTimeline } from "@/components/request-timeline";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PriorityBadge, StatusBadge } from "@/lib/status";
import { attachmentUrl } from "@/lib/utils";
import { formatUnitLabel } from "@/lib/property-types";
import { RequestStatus } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function RequestDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const message = (await searchParams) as unknown as Message;

  const user = await requireUser();

  const request = await prisma.maintenanceRequest.findUnique({
    where: { id },
    include: {
      attachments: true,
      unit: { include: { property: { include: { propertyType: true } } } },
      taskLogs: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!request) {
    notFound();
  }

  if (request.userId !== user.id) {
    redirect("/protected/requests");
  }

  const canEdit =
    request.status === RequestStatus.pending &&
    !request.taskLogs.some((log) => log.status === RequestStatus.on_hold);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <PageHeader
        title={request.title}
        back={{ href: "/protected/requests", label: "My requests" }}
      >
        <PriorityBadge priority={request.priority} />
        <StatusBadge status={request.status} />
      </PageHeader>

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      {request.status === RequestStatus.on_hold && (
        <Card className="border-[#dc961e]/30 bg-[#dc961e]/10 text-[#8a5c10]">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">Work is temporarily on hold</p>
                <p className="whitespace-pre-wrap text-sm">
                  {request.holdReason ?? "No hold reason was recorded."}
                </p>
                {request.heldAt && (
                  <p className="text-xs text-[#8a5c10]/80">
                    Paused {format(request.heldAt, "d MMM yyyy, HH:mm")}
                  </p>
                )}
              </div>
            </div>

            {request.resumeRequestedAt ? (
              <div className="flex items-start gap-2 rounded-md bg-white/60 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Admin has been notified. They will confirm the worker and
                  restart the job.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 border-t border-[#dc961e]/30 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-xs text-[#8a5c10]/80">
                  If the item, access, approval, or other dependency mentioned
                  above is now ready, notify the admin. This will not restart
                  the job automatically.
                </p>
                <form>
                  <input type="hidden" name="taskId" value={request.id} />
                  <SubmitButton
                    formAction={requestHeldTaskResumeAction}
                    size="sm"
                    pendingText="Notifying..."
                  >
                    Blocker is resolved
                  </SubmitButton>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* The worker is waiting on this number to close the job out. */}
      {request.completionCode && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">Give this code to the worker</p>
                <p className="text-sm text-muted-foreground">
                  Only share it once you&apos;re happy the work is actually
                  done. The job stays open until they enter it.
                </p>
              </div>
            </div>

            <p className="text-4xl font-semibold tracking-[0.3em] text-primary">
              {request.completionCode}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Home className="h-4 w-4 text-muted-foreground" />
            {request.unit
              ? `${request.unit.property.name} · ${formatUnitLabel(
                  request.unit.property.propertyType,
                  request.unit.label,
                )}`
              : "No unit linked"}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {request.location}
          </span>
          <span className="text-muted-foreground">
            Reported {format(request.createdAt, "PPP")}
          </span>
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Edit request</CardTitle>
            <form>
              <input type="hidden" name="requestId" value={request.id} />
              <SubmitButton
                formAction={deleteRequestAction}
                variant="ghost"
                size="sm"
                pendingText="Cancelling..."
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Cancel request
              </SubmitButton>
            </form>
          </CardHeader>

          <CardContent>
            <form className="space-y-4">
              <input type="hidden" name="requestId" value={request.id} />

              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  defaultValue={request.title}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="location">Room</Label>
                  <Input
                    id="location"
                    name="location"
                    defaultValue={request.location}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    id="priority"
                    name="priority"
                    defaultValue={request.priority}
                  >
                    <option value="low">Low — can wait</option>
                    <option value="medium">
                      Medium — needs attention soon
                    </option>
                    <option value="high">High — urgent</option>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={4}
                  defaultValue={request.description}
                  required
                />
              </div>

              <SubmitButton
                formAction={updateRequestAction}
                pendingText="Saving..."
              >
                Save changes
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm">{request.description}</p>

            {request.notes && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="mb-1 text-xs font-medium">Notes from staff</p>
                <p className="text-sm">{request.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
          <CardTitle className="text-base">Progress</CardTitle>
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
