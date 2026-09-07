import { PauseCircle, Wrench } from "lucide-react";

import {
  addSupplyRequestAction,
  cancelCompletionAction,
  holdTaskAction,
  requestCompletionAction,
  submitCompletionCodeAction,
  updateTaskStatusAction,
  uploadSupplyReceiptAction,
  workerReadyToResumeAction,
} from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormMessage, Message } from "@/components/form-message";
import { HeldTaskCard } from "@/components/held-task-card";
import { PageHeader } from "@/components/page-header";
import TaskCard from "@/components/task-card";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { RequestStatus, UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export type CompletionResult = { ok: boolean; message: string };

export default async function WorkerTasksPage({ searchParams }: PageProps) {
  const message = (await searchParams) as unknown as Message;
  const worker = await requireRole(UserType.worker);

  const [tasks, heldTasks] = await Promise.all([
    prisma.maintenanceRequest.findMany({
      where: {
        assignedToId: worker.id,
        status: {
          in: [
            RequestStatus.pending,
            RequestStatus.en_route,
            RequestStatus.in_progress,
          ],
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      // Scalars (including completionCode, which drives the code-entry step) come
      // back by default alongside these relations.
      include: {
        user: { select: { email: true } },
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
        property: { select: { name: true } },
        attachments: true,
        // A hold can be resolved and the job resumed while a supply request
        // stays on the record — this is where the worker sees an approved
        // (or denied) outcome once the job is back in their active queue.
        supplyRequests: {
          orderBy: { createdAt: "asc" },
          include: {
            requestedBy: { select: { email: true } },
            decidedBy: { select: { email: true } },
          },
        },
      },
    }),
    // Held jobs leave the active queue above, so this is the worker's only
    // window into what happens with a hold — and any supply request on it.
    prisma.maintenanceRequest.findMany({
      where: { assignedToId: worker.id, status: RequestStatus.on_hold },
      orderBy: [{ heldAt: "asc" }],
      include: {
        user: { select: { email: true } },
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
        property: { select: { name: true } },
        supplyRequests: {
          orderBy: { createdAt: "asc" },
          include: {
            requestedBy: { select: { email: true } },
            decidedBy: { select: { email: true } },
          },
        },
      },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8">
      <PageHeader
        title="My tasks"
        description={`${tasks.length} job${tasks.length === 1 ? "" : "s"} assigned to you`}
      />

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      {tasks.length === 0 && heldTasks.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Nothing assigned"
          description="You have no open maintenance tasks right now."
        />
      ) : (
        <>
          {tasks.length > 0 && (
            <div className="space-y-4">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  attachments={task.attachments}
                  onStartWork={startWorkAction}
                  onCompleteTask={completeTaskAction}
                  onEnRoute={enRouteAction}
                  onHold={putOnHoldAction}
                  onRequestCompletion={requestCompletionAction}
                  onSubmitCompletionCode={submitCompletionCodeAction}
                  onCancelCompletion={cancelCompletionAction}
                />
              ))}
            </div>
          )}

          {heldTasks.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <PauseCircle className="h-4 w-4" />
                On hold ({heldTasks.length})
              </div>
              <div className="space-y-4">
                {heldTasks.map((task) => (
                  <HeldTaskCard
                    key={task.id}
                    task={task}
                    onAddSupplyRequest={addSupplyRequestFormAction}
                    onReadyToResume={readyToResumeAction}
                    onUploadReceipt={uploadSupplyReceiptFormAction}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

async function startWorkAction(taskId: string) {
  "use server";
  const formData = new FormData();
  formData.append("taskId", taskId);
  formData.append("status", RequestStatus.in_progress);
  return updateTaskStatusAction(formData);
}

async function completeTaskAction(taskId: string, formData: FormData) {
  "use server";
  return updateTaskStatusAction(formData);
}

async function enRouteAction(taskId: string, notes?: string) {
  "use server";
  const formData = new FormData();
  formData.append("taskId", taskId);
  formData.append("status", RequestStatus.en_route);
  if (notes) {
    formData.append("notes", notes);
  }
  return updateTaskStatusAction(formData);
}

async function putOnHoldAction(
  taskId: string,
  reason: string,
  supplyItem?: string,
  supplyNotes?: string,
) {
  "use server";
  const formData = new FormData();
  formData.append("taskId", taskId);
  formData.append("reason", reason);
  if (supplyItem) {
    formData.append("supplyItem", supplyItem);
  }
  if (supplyNotes) {
    formData.append("supplyNotes", supplyNotes);
  }
  return holdTaskAction(formData);
}

async function addSupplyRequestFormAction(
  taskId: string,
  item: string,
  notes: string,
) {
  "use server";
  const formData = new FormData();
  formData.append("taskId", taskId);
  formData.append("item", item);
  formData.append("notes", notes);
  return addSupplyRequestAction(formData);
}

async function uploadSupplyReceiptFormAction(
  supplyRequestId: string,
  receipt: File,
  workerCost: string,
) {
  "use server";
  const formData = new FormData();
  formData.append("supplyRequestId", supplyRequestId);
  formData.append("receipt", receipt);
  if (workerCost) {
    formData.append("workerCost", workerCost);
  }
  return uploadSupplyReceiptAction(formData);
}

async function readyToResumeAction(taskId: string) {
  "use server";
  const formData = new FormData();
  formData.append("taskId", taskId);
  return workerReadyToResumeAction(formData);
}
