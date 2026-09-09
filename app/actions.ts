"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  notifyAdminsResumeRequested,
  notifyAdminsNewRequest,
  notifyAdminsWorkerReadyToResume,
  notifyRequestHeld,
  notifyRequestResumed,
  notifyStatusChange,
  notifySupplyReceiptUploaded,
  notifySupplyRequestDecided,
  notifySupplyRequested,
  notifyTenantCompletionCode,
  notifyWorkerAssigned,
  notifyWorkerUnassigned,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import {
  getCurrentUser,
  requireRole,
  requireUser,
} from "@/lib/session";
import {
  deleteAttachment,
  uploadAttachment,
  uploadEntityDocument,
} from "@/lib/storage";
import { encodedRedirect } from "@/utils/utils";
import {
  Priority,
  RequestStatus,
  RejectionKind,
  SupplyRequestStatus,
  UserType,
} from "@/lib/generated/prisma/client";

const PRIORITIES = Object.values(Priority) as string[];
const STATUSES = Object.values(RequestStatus) as string[];
const USER_TYPES = Object.values(UserType) as string[];

/**
 * True when `actor` may manage this maintenance request as an admin.
 * Property owners are read-only everywhere except creating a new property
 * (see createPropertyAction) — they never get management rights here, even
 * over their own properties' requests. */
async function canManageRequest(
  actor: { id: string; userType: UserType },
  _requestId: string,
): Promise<boolean> {
  return actor.userType === UserType.admin;
}
const HOLDABLE_STATUSES: RequestStatus[] = [
  RequestStatus.pending,
  RequestStatus.en_route,
  RequestStatus.in_progress,
];

function parsePriority(value: string | undefined): Priority {
  return PRIORITIES.includes(value ?? "")
    ? (value as Priority)
    : Priority.medium;
}

/**
 * Saves every uploaded file to storage and records it in the database.
 * Returns true if at least one file failed, so the caller can warn the user
 * without throwing away the request itself.
 */
export async function saveAttachments(
  files: FormDataEntryValue[],
  requestId: string,
  userId: string,
): Promise<boolean> {
  let hadFailure = false;

  for (const file of files) {
    if (!(file instanceof File) || file.size === 0) {
      continue;
    }

    try {
      const uploaded = await uploadAttachment(file, requestId);

      await prisma.maintenanceAttachment.create({
        data: {
          requestId,
          fileName: uploaded.fileName,
          filePath: uploaded.objectKey,
          fileType: uploaded.fileType,
          fileSize: uploaded.fileSize,
          createdById: userId,
        },
      });
    } catch (error) {
      console.error("Attachment upload failed:", error);
      hadFailure = true;
    }
  }

  return hadFailure;
}

/* ── Auth ──────────────────────────────────────────────────────────────────── */

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return encodedRedirect(
      "error",
      "/sign-in",
      "Email and password are required",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return encodedRedirect("error", "/sign-in", "Invalid email or password");
  }

  redirect("/protected");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
};

export const changePasswordAction = async (formData: FormData) => {
  const user = await requireUser();

  const currentPassword = formData.get("currentPassword")?.toString();
  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();

  if (!currentPassword || !password || !confirmPassword) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "All fields are required",
    );
  }

  if (password !== confirmPassword) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "Passwords do not match",
    );
  }

  if (password.length < 6) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password must be at least 6 characters",
    );
  }

  const supabase = await createClient();

  // Supabase has no direct "check this password" call for someone already
  // signed in, so re-authenticate with it — the same check signing in does.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "Your current password is incorrect",
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "Could not update your password",
    );
  }

  return encodedRedirect(
    "success",
    "/protected/reset-password",
    "Password updated",
  );
};

/* ── Maintenance requests ──────────────────────────────────────────────────── */

export const reportIssueAction = async (formData: FormData) => {
  const user = await requireUser();

  const title = formData.get("title")?.toString().trim();
  const location = formData.get("location")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const priority = parsePriority(formData.get("priority")?.toString());
  const isCommonArea = formData.get("isCommonArea")?.toString() === "true";
  const attachments = formData.getAll("attachments");

  if (!title || !location || !description) {
    return encodedRedirect(
      "error",
      "/protected/report",
      "Please fill in all required fields",
    );
  }

  // The apartment is taken from the tenancy, never from the form, so a tenant cannot
  // raise an issue against someone else's apartment.
  const unit = await prisma.unit.findUnique({
    where: { tenantId: user.id },
    select: { id: true, propertyId: true },
  });

  if (!unit) {
    return encodedRedirect(
      "error",
      "/protected/report",
      "You are not assigned to an apartment yet. Please contact your administrator.",
    );
  }

  // A common-area request belongs to the whole property, not this tenant's
  // own unit — a single-unit property has no shared space distinct from
  // that unit, so this option is only offered when there's more than one.
  const unitCount = isCommonArea
    ? await prisma.unit.count({ where: { propertyId: unit.propertyId } })
    : 0;
  const isValidCommonArea = isCommonArea && unitCount > 1;

  const request = await prisma.maintenanceRequest.create({
    data: {
      userId: user.id,
      unitId: isValidCommonArea ? null : unit.id,
      propertyId: isValidCommonArea ? unit.propertyId : null,
      title,
      location,
      description,
      priority,
      status: RequestStatus.pending,
      taskLogs: {
        create: {
          status: RequestStatus.pending,
          changedById: user.id,
          notes: "Request created",
        },
      },
    },
  });

  const uploadFailed = await saveAttachments(attachments, request.id, user.id);

  await notifyAdminsNewRequest({
    id: request.id,
    title: request.title,
    location: request.location,
    reportedBy: user.email,
  });

  // Lands on every admin's queue while the tenant is still on the success page.
  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [user.id],
  });

  revalidatePath("/protected/requests");
  revalidatePath("/protected/maintenance");

  return encodedRedirect(
    "success",
    "/protected/requests",
    uploadFailed
      ? "Your maintenance request has been submitted, but some attachments failed to upload."
      : "Your maintenance request has been submitted successfully.",
  );
};

export const updateRequestAction = async (formData: FormData) => {
  const user = await requireUser();

  const requestId = formData.get("requestId")?.toString();
  const title = formData.get("title")?.toString().trim();
  const location = formData.get("location")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const priority = parsePriority(formData.get("priority")?.toString());

  if (!requestId) {
    return encodedRedirect("error", "/protected/requests", "Invalid request");
  }

  if (!title || !location || !description) {
    return encodedRedirect(
      "error",
      `/protected/requests/${requestId}`,
      "Please fill in all required fields",
    );
  }

  const request = await prisma.maintenanceRequest.findUnique({
    where: { id: requestId },
    select: {
      userId: true,
      status: true,
      assignedToId: true,
      taskLogs: {
        where: { status: RequestStatus.on_hold },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!request) {
    return encodedRedirect("error", "/protected/requests", "Request not found");
  }

  if (request.userId !== user.id) {
    return encodedRedirect(
      "error",
      "/protected/requests",
      "You can only update your own requests",
    );
  }

  if (request.status !== RequestStatus.pending || request.taskLogs.length > 0) {
    return encodedRedirect(
      "error",
      `/protected/requests/${requestId}`,
      "You can only update a new request before work has started",
    );
  }

  await prisma.maintenanceRequest.update({
    where: { id: requestId },
    data: { title, location, description, priority },
  });

  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [user.id, request.assignedToId].filter((id): id is string =>
      Boolean(id),
    ),
  });

  revalidatePath(`/protected/requests/${requestId}`);

  return encodedRedirect(
    "success",
    `/protected/requests/${requestId}`,
    "Request updated successfully.",
  );
};

export const deleteRequestAction = async (formData: FormData) => {
  const user = await requireUser();

  const requestId = formData.get("requestId")?.toString();

  if (!requestId) {
    return encodedRedirect("error", "/protected/requests", "Invalid request");
  }

  const request = await prisma.maintenanceRequest.findUnique({
    where: { id: requestId },
    select: {
      userId: true,
      status: true,
      assignedToId: true,
      taskLogs: {
        where: { status: RequestStatus.on_hold },
        select: { id: true },
        take: 1,
      },
      attachments: { select: { filePath: true } },
    },
  });

  if (!request) {
    return encodedRedirect("error", "/protected/requests", "Request not found");
  }

  if (request.userId !== user.id) {
    return encodedRedirect(
      "error",
      "/protected/requests",
      "You can only delete your own requests",
    );
  }

  if (request.status !== RequestStatus.pending || request.taskLogs.length > 0) {
    return encodedRedirect(
      "error",
      `/protected/requests/${requestId}`,
      "You can only cancel a new request before work has started",
    );
  }

  // The attachment rows cascade with the request; the bucket objects do not.
  for (const attachment of request.attachments) {
    try {
      await deleteAttachment(attachment.filePath);
    } catch (error) {
      console.error(
        "Could not remove stored file:",
        attachment.filePath,
        error,
      );
    }
  }

  await prisma.maintenanceRequest.delete({ where: { id: requestId } });

  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [user.id, request.assignedToId].filter((id): id is string =>
      Boolean(id),
    ),
  });

  revalidatePath("/protected/requests");

  return encodedRedirect(
    "success",
    "/protected/requests",
    "Request cancelled successfully.",
  );
};

/* ── Worker actions ────────────────────────────────────────────────────────── */

export type TaskStatusResult = { ok: boolean; message: string };

/**
 * Returns a result instead of redirecting. The worker's task card updates in
 * place via router.refresh(); a redirect here would race with Next's client
 * cache and leave the card showing the previous status until a manual reload.
 */
export const updateTaskStatusAction = async (
  formData: FormData,
): Promise<TaskStatusResult> => {
  const user = await requireRole(UserType.worker);

  const taskId = formData.get("taskId")?.toString();
  const status = formData.get("status")?.toString();
  const notes = formData.get("notes")?.toString() ?? "";
  const attachments = formData.getAll("attachments");

  if (!taskId || !status || !STATUSES.includes(status)) {
    return { ok: false, message: "Missing required information" };
  }

  const nextStatus = status as RequestStatus;

  const task = await prisma.maintenanceRequest.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      userId: true,
      assignedToId: true,
      status: true,
    },
  });

  if (!task || task.assignedToId !== user.id) {
    return { ok: false, message: "You can only update tasks assigned to you" };
  }

  if (task.status === RequestStatus.on_hold) {
    return {
      ok: false,
      message: "This job is waiting for an admin to assign and resume it.",
    };
  }

  const followsWorkerFlow =
    (task.status === RequestStatus.pending &&
      nextStatus === RequestStatus.en_route) ||
    (task.status === RequestStatus.en_route &&
      nextStatus === RequestStatus.in_progress);

  if (!followsWorkerFlow) {
    return {
      ok: false,
      message:
        nextStatus === RequestStatus.completed
          ? "Use 'Mark as Completed' to request the tenant's code."
          : nextStatus === RequestStatus.on_hold
            ? "Use 'Put On Hold' so a reason is recorded for the admin."
            : "Follow the normal En Route → In Progress task flow.",
    };
  }

  await prisma.maintenanceRequest.update({
    where: { id: taskId },
    data: {
      status: nextStatus,
      ...(nextStatus === RequestStatus.en_route && { enRouteAt: new Date() }),
      ...(nextStatus === RequestStatus.in_progress && {
        inProgressAt: new Date(),
      }),
      taskLogs: {
        create: {
          status: nextStatus,
          changedById: user.id,
          notes: notes || `Status changed to ${nextStatus}`,
        },
      },
    },
  });

  await notifyStatusChange({ ...task, status: nextStatus });

  // The tenant watches this one land; so does every admin's board.
  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [task.userId, user.id],
  });

  revalidatePath("/protected/tasks");
  revalidatePath("/protected/history");
  revalidatePath(`/protected/maintenance/${taskId}`);

  if (nextStatus === RequestStatus.en_route) {
    return {
      ok: true,
      message: "You're now marked as en route to the location.",
    };
  }
  if (nextStatus === RequestStatus.in_progress) {
    return { ok: true, message: "Work has been started on this task." };
  }

  return { ok: true, message: "Task status updated successfully." };
};

/**
 * A worker or admin can pause active work, but neither can silently resume it.
 * Held work leaves the worker queue and waits for an explicit admin decision.
 */
export const holdTaskAction = async (
  formData: FormData,
): Promise<TaskStatusResult> => {
  const actor = await requireUser();
  const taskId = formData.get("taskId")?.toString() ?? "";
  const reason = formData.get("reason")?.toString().trim() ?? "";
  const supplyItem = formData.get("supplyItem")?.toString().trim() ?? "";
  const supplyNotes = formData.get("supplyNotes")?.toString().trim() ?? "";

  if (!taskId || !reason) {
    return {
      ok: false,
      message: "Please explain why this job is being put on hold.",
    };
  }

  if (reason.length > 1000) {
    return {
      ok: false,
      message: "The hold reason must be 1,000 characters or less.",
    };
  }

  if (supplyItem.length > 200) {
    return {
      ok: false,
      message: "The item name must be 200 characters or less.",
    };
  }

  const task = await prisma.maintenanceRequest.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      userId: true,
      assignedToId: true,
      status: true,
    },
  });

  const isAssignedWorker =
    actor.userType === UserType.worker && task?.assignedToId === actor.id;
  const canManage = task ? await canManageRequest(actor, task.id) : false;

  if (!task || (!isAssignedWorker && !canManage)) {
    return { ok: false, message: "You cannot put this job on hold." };
  }

  if (!HOLDABLE_STATUSES.includes(task.status)) {
    return task.status === RequestStatus.on_hold
      ? { ok: false, message: "This job is already on hold." }
      : { ok: false, message: "Completed jobs cannot be put on hold." };
  }

  const heldAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.maintenanceRequest.update({
      where: { id: taskId },
      data: {
        status: RequestStatus.on_hold,
        holdReason: reason,
        heldAt,
        heldFromStatus: task.status,
        resumeRequestedAt: null,
        completionCode: null,
        completionCodeAt: null,
        taskLogs: {
          create: {
            status: RequestStatus.on_hold,
            changedById: actor.id,
            notes: `Put on hold: ${reason}`,
          },
        },
      },
    });

    if (supplyItem) {
      await tx.supplyRequest.create({
        data: {
          requestId: taskId,
          item: supplyItem,
          notes: supplyNotes || null,
          requestedById: actor.id,
        },
      });
    }
  });

  await notifyRequestHeld({
    id: task.id,
    title: task.title,
    tenantId: task.userId,
    reason,
    actorId: actor.id,
  });

  if (supplyItem) {
    await notifySupplyRequested({
      requestId: taskId,
      taskId: task.id,
      taskTitle: task.title,
      item: supplyItem,
      actorId: actor.id,
    });
  }

  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [task.userId, task.assignedToId].filter((id): id is string =>
      Boolean(id),
    ),
  });

  revalidatePath("/protected");
  revalidatePath("/protected/tasks");
  revalidatePath("/protected/maintenance");
  revalidatePath(`/protected/maintenance/${taskId}`);
  revalidatePath("/protected/requests");
  revalidatePath(`/protected/requests/${taskId}`);

  return {
    ok: true,
    message: "Job put on hold and moved to the admin review queue.",
  };
};

/**
 * Lets the assigned worker ask for something else while a job is already on
 * hold — realizing mid-hold they also need a second part, say. Separate from
 * holdTaskAction, which creates the first request as part of the hold itself.
 */
export const addSupplyRequestAction = async (
  formData: FormData,
): Promise<TaskStatusResult> => {
  const actor = await requireUser();
  const taskId = formData.get("taskId")?.toString() ?? "";
  const item = formData.get("item")?.toString().trim() ?? "";
  const notes = formData.get("notes")?.toString().trim() ?? "";

  if (!taskId || !item) {
    return { ok: false, message: "Say what you need." };
  }

  if (item.length > 200) {
    return { ok: false, message: "The item name must be 200 characters or less." };
  }

  const task = await prisma.maintenanceRequest.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, assignedToId: true, status: true },
  });

  const isAssignedWorker =
    actor.userType === UserType.worker && task?.assignedToId === actor.id;
  const canManage = task ? await canManageRequest(actor, task.id) : false;

  if (!task || (!isAssignedWorker && !canManage)) {
    return { ok: false, message: "You cannot request supplies for this job." };
  }

  if (task.status !== RequestStatus.on_hold) {
    return {
      ok: false,
      message: "Supplies can only be requested while a job is on hold.",
    };
  }

  await prisma.supplyRequest.create({
    data: {
      requestId: taskId,
      item,
      notes: notes || null,
      requestedById: actor.id,
    },
  });

  await notifySupplyRequested({
    requestId: taskId,
    taskId: task.id,
    taskTitle: task.title,
    item,
    actorId: actor.id,
  });

  revalidatePath("/protected/maintenance");
  revalidatePath(`/protected/maintenance/${taskId}`);
  revalidatePath("/protected/tasks");

  return { ok: true, message: "Request sent to the admin." };
};

/**
 * Lets the worker who made a still-pending supply request attach proof they
 * already bought it — a receipt photo/PDF and, optionally, what they paid.
 * `workerCost` is only ever a suggestion the admin sees; the authoritative,
 * locked `cost` is still set by decideSupplyRequestAction on approval.
 */
export const uploadSupplyReceiptAction = async (
  formData: FormData,
): Promise<TaskStatusResult> => {
  const actor = await requireUser();
  const supplyRequestId = formData.get("supplyRequestId")?.toString() ?? "";
  const receipt = formData.get("receipt");
  const workerCostRaw = formData.get("workerCost")?.toString().trim() ?? "";

  if (!supplyRequestId) {
    return { ok: false, message: "Request not found." };
  }

  if (!(receipt instanceof File) || receipt.size === 0) {
    return { ok: false, message: "Choose a receipt photo or PDF to upload." };
  }

  let workerCost: number | null = null;
  if (workerCostRaw) {
    workerCost = Number(workerCostRaw);
    if (!Number.isFinite(workerCost) || workerCost < 0) {
      return { ok: false, message: "Cost must be a valid, non-negative number." };
    }
  }

  const supplyRequest = await prisma.supplyRequest.findUnique({
    where: { id: supplyRequestId },
    include: { request: { select: { id: true, title: true } } },
  });

  if (!supplyRequest) {
    return { ok: false, message: "Request not found." };
  }

  if (
    supplyRequest.requestedById !== actor.id &&
    actor.userType !== UserType.admin
  ) {
    return { ok: false, message: "You can only attach a receipt to your own request." };
  }

  if (supplyRequest.status !== SupplyRequestStatus.pending) {
    return {
      ok: false,
      message: "This request was already decided; the receipt can no longer be attached.",
    };
  }

  try {
    const uploaded = await uploadEntityDocument(
      receipt,
      "supply-request",
      supplyRequestId,
    );

    await prisma.supplyRequest.update({
      where: { id: supplyRequestId },
      data: {
        receiptPath: uploaded.objectKey,
        receiptFileName: uploaded.fileName,
        receiptFileType: uploaded.fileType,
        workerCost,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not upload the receipt.";
    return { ok: false, message };
  }

  await notifySupplyReceiptUploaded({
    taskId: supplyRequest.request.id,
    taskTitle: supplyRequest.request.title,
    item: supplyRequest.item,
  });

  revalidatePath("/protected/maintenance");
  revalidatePath(`/protected/maintenance/${supplyRequest.requestId}`);
  revalidatePath("/protected/tasks");

  return { ok: true, message: "Receipt uploaded. The admin will review it." };
};

/** Only an admin decides a supply request — approve (optionally with a note
 * on where it is) or deny (with a reason). The job itself doesn't change
 * status here; the worker still resumes once they actually have the item. */
export const decideSupplyRequestAction = async (
  formData: FormData,
): Promise<TaskStatusResult> => {
  // Admin-only — property owners have read-only access to everything
  // except creating a new property (see createPropertyAction).
  const admin = await requireRole(UserType.admin);

  const supplyRequestId = formData.get("supplyRequestId")?.toString() ?? "";
  const decision = formData.get("decision")?.toString();
  const adminNote = formData.get("adminNote")?.toString().trim() || null;
  const costRaw = formData.get("cost")?.toString().trim() ?? "";

  if (!supplyRequestId || (decision !== "approved" && decision !== "denied")) {
    return { ok: false, message: "Choose approve or deny." };
  }

  if (decision === "denied" && !adminNote) {
    return { ok: false, message: "Please give a reason for denying this." };
  }

  let cost: number | null = null;
  if (decision === "approved" && costRaw) {
    cost = Number(costRaw);
    if (!Number.isFinite(cost) || cost < 0) {
      return { ok: false, message: "Cost must be a valid, non-negative number." };
    }
  }

  const supplyRequest = await prisma.supplyRequest.findUnique({
    where: { id: supplyRequestId },
    include: {
      request: { select: { id: true, title: true, assignedToId: true } },
    },
  });

  if (!supplyRequest) {
    return { ok: false, message: "Request not found." };
  }

  if (!(await canManageRequest(admin, supplyRequest.request.id))) {
    return { ok: false, message: "You cannot decide this request." };
  }

  if (supplyRequest.status !== SupplyRequestStatus.pending) {
    return { ok: false, message: "This request was already decided." };
  }

  await prisma.supplyRequest.update({
    where: { id: supplyRequestId },
    data: {
      status: decision as SupplyRequestStatus,
      adminNote,
      cost,
      decidedById: admin.id,
      decidedAt: new Date(),
    },
  });

  if (decision === "denied") {
    await prisma.rejectionLog.create({
      data: {
        kind: RejectionKind.supply_request,
        entityLabel: `${supplyRequest.item} (${supplyRequest.request.title})`,
        reason: adminNote,
        rejectedById: admin.id,
      },
    });
  }

  if (supplyRequest.request.assignedToId) {
    await notifySupplyRequestDecided({
      taskId: supplyRequest.request.id,
      taskTitle: supplyRequest.request.title,
      item: supplyRequest.item,
      workerId: supplyRequest.request.assignedToId,
      approved: decision === "approved",
      adminNote,
    });
  }

  revalidatePath("/protected/maintenance");
  revalidatePath(`/protected/maintenance/${supplyRequest.request.id}`);
  revalidatePath("/protected/tasks");

  return {
    ok: true,
    message:
      decision === "approved" ? "Request approved." : "Request denied.",
  };
};

/**
 * The tenant can signal that a blocker is clear, but cannot restart work or pick
 * a worker. This keeps assignment and scheduling under admin control.
 */
export const requestHeldTaskResumeAction = async (formData: FormData) => {
  const tenant = await requireRole(UserType.user);
  const taskId = formData.get("taskId")?.toString() ?? "";

  if (!taskId) {
    return encodedRedirect("error", "/protected/requests", "Invalid request.");
  }

  const task = await prisma.maintenanceRequest.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      userId: true,
      status: true,
      resumeRequestedAt: true,
    },
  });

  if (!task || task.userId !== tenant.id) {
    return encodedRedirect(
      "error",
      "/protected/requests",
      "Request not found.",
    );
  }

  if (task.status !== RequestStatus.on_hold) {
    return encodedRedirect(
      "error",
      `/protected/requests/${taskId}`,
      "Only a held request can be sent back for admin review.",
    );
  }

  let newlyRequested = false;

  if (!task.resumeRequestedAt) {
    const { count } = await prisma.maintenanceRequest.updateMany({
      where: {
        id: taskId,
        userId: tenant.id,
        status: RequestStatus.on_hold,
        resumeRequestedAt: null,
      },
      data: { resumeRequestedAt: new Date() },
    });
    newlyRequested = count > 0;

    if (newlyRequested) {
      await notifyAdminsResumeRequested({
        id: task.id,
        title: task.title,
        tenantEmail: tenant.email,
      });

      await publish({
        kind: "request",
        roles: [UserType.admin],
        userIds: [tenant.id],
      });
    }
  }

  revalidatePath("/protected");
  revalidatePath("/protected/maintenance");
  revalidatePath(`/protected/maintenance/${taskId}`);
  revalidatePath(`/protected/requests/${taskId}`);

  return encodedRedirect(
    "success",
    `/protected/requests/${taskId}`,
    newlyRequested
      ? "The admin has been notified and will choose a worker to resume the job."
      : "The admin has already been notified.",
  );
};

/**
 * The worker's side of "blocker is clear" — e.g. once a supply request is
 * approved and the worker actually has the item in hand. Same mechanism as
 * the tenant's version above (resumeRequestedAt), just reachable by whichever
 * side was actually waiting. Still only an admin can pick a worker and
 * restart the job.
 */
export const workerReadyToResumeAction = async (
  formData: FormData,
): Promise<TaskStatusResult> => {
  const worker = await requireRole(UserType.worker);
  const taskId = formData.get("taskId")?.toString() ?? "";

  if (!taskId) {
    return { ok: false, message: "Invalid job." };
  }

  const task = await prisma.maintenanceRequest.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      assignedToId: true,
      status: true,
      resumeRequestedAt: true,
    },
  });

  if (!task || task.assignedToId !== worker.id) {
    return { ok: false, message: "This job isn't assigned to you." };
  }

  if (task.status !== RequestStatus.on_hold) {
    return { ok: false, message: "This job is not on hold." };
  }

  if (task.resumeRequestedAt) {
    return { ok: true, message: "The admin has already been notified." };
  }

  const { count } = await prisma.maintenanceRequest.updateMany({
    where: {
      id: taskId,
      assignedToId: worker.id,
      status: RequestStatus.on_hold,
      resumeRequestedAt: null,
    },
    data: { resumeRequestedAt: new Date() },
  });

  if (count === 0) {
    return { ok: true, message: "The admin has already been notified." };
  }

  await notifyAdminsWorkerReadyToResume({
    id: task.id,
    title: task.title,
    workerEmail: worker.email,
  });

  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [worker.id],
  });

  revalidatePath("/protected");
  revalidatePath("/protected/tasks");
  revalidatePath("/protected/maintenance");
  revalidatePath(`/protected/maintenance/${taskId}`);

  return {
    ok: true,
    message: "The admin has been notified and will resume the job.",
  };
};

/**
 * Only an admin can release a held job. The previous worker remains selected by
 * default. A different worker receives a fresh pending task so they still follow
 * the normal En Route → In Progress flow.
 */
export const resumeHeldTaskAction = async (
  formData: FormData,
): Promise<TaskStatusResult> => {
  // Admin-only — see decideSupplyRequestAction's note above.
  const admin = await requireRole(UserType.admin);
  const taskId = formData.get("taskId")?.toString() ?? "";
  const workerId = formData.get("workerId")?.toString() ?? "";
  const notes = formData.get("notes")?.toString().trim() ?? "";

  if (!taskId || !workerId) {
    return { ok: false, message: "Choose a worker before resuming this job." };
  }

  const [task, worker] = await Promise.all([
    prisma.maintenanceRequest.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        userId: true,
        assignedToId: true,
        status: true,
        heldFromStatus: true,
        location: true,
        unit: {
          select: {
            label: true,
            property: {
              select: {
                name: true,
                propertyType: { select: { unitPrefix: true } },
              },
            },
          },
        },
      },
    }),
    prisma.user.findFirst({
      where: { id: workerId, userType: UserType.worker },
      select: { id: true, email: true },
    }),
  ]);

  if (!task) {
    return { ok: false, message: "Job not found." };
  }

  if (!(await canManageRequest(admin, taskId))) {
    return { ok: false, message: "You cannot manage this job." };
  }

  if (task.status !== RequestStatus.on_hold) {
    return { ok: false, message: "This job is no longer on hold." };
  }

  if (!worker) {
    return { ok: false, message: "Choose a valid worker." };
  }

  const workerChanged = task.assignedToId !== worker.id;
  const resumeStatus =
    !workerChanged &&
    task.heldFromStatus &&
    HOLDABLE_STATUSES.includes(task.heldFromStatus)
      ? task.heldFromStatus
      : RequestStatus.pending;
  const resumeLabel = resumeStatus.replaceAll("_", " ");

  const resumed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.maintenanceRequest.updateMany({
      where: { id: taskId, status: RequestStatus.on_hold },
      data: {
        assignedToId: worker.id,
        status: resumeStatus,
        holdReason: null,
        heldAt: null,
        heldFromStatus: null,
        resumeRequestedAt: null,
        ...(workerChanged && { enRouteAt: null, inProgressAt: null }),
      },
    });

    if (count === 0) {
      return false;
    }

    await tx.taskLog.create({
      data: {
        requestId: taskId,
        status: resumeStatus,
        changedById: admin.id,
        notes: [
          workerChanged
            ? `Resumed from hold with ${worker.email}; restarted as pending`
            : `Resumed from hold with the same worker at ${resumeLabel}`,
          notes,
        ]
          .filter(Boolean)
          .join(" — "),
      },
    });

    return true;
  });

  if (!resumed) {
    return {
      ok: false,
      message: "Another admin has already resumed this job.",
    };
  }

  const place = task.unit
    ? `${task.unit.property.name} · ${
        task.unit.property.propertyType.unitPrefix
          ? `${task.unit.property.propertyType.unitPrefix} ${task.unit.label}`
          : task.unit.label
      } (${task.location})`
    : task.location;

  await notifyRequestResumed({
    id: task.id,
    title: task.title,
    tenantId: task.userId,
    workerId: worker.id,
    workerChanged,
    place,
  });

  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [task.userId, task.assignedToId, worker.id].filter(
      (id): id is string => Boolean(id),
    ),
  });

  revalidatePath("/protected");
  revalidatePath("/protected/tasks");
  revalidatePath("/protected/maintenance");
  revalidatePath(`/protected/maintenance/${taskId}`);
  revalidatePath("/protected/requests");
  revalidatePath(`/protected/requests/${taskId}`);

  return {
    ok: true,
    message: workerChanged
      ? `Assigned to ${worker.email} and restarted as Pending.`
      : `Resumed with ${worker.email} at ${resumeLabel}.`,
  };
};

/* ── Completion verification (tenant → worker 4-digit code) ────────────────── */

function generateCode(): string {
  // Crypto-backed so the next digit isn't guessable from the last.
  const { randomBytes } = require("node:crypto");
  const n = randomBytes(4).readUInt32BE(0) % 10000;
  return String(n).padStart(4, "0");
}

/**
 * Worker says "I'm done". Instead of completing outright, this mints a 4-digit
 * code the tenant reads off their dashboard and gives back to the worker. The
 * task stays in_progress until the worker enters that code — proving the tenant
 * saw the finished work and agreed.
 */
export const requestCompletionAction = async (
  taskId: string,
): Promise<TaskStatusResult> => {
  const user = await requireRole(UserType.worker);

  const task = await prisma.maintenanceRequest.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      userId: true,
      assignedToId: true,
      status: true,
      completionCode: true,
    },
  });

  if (!task || task.assignedToId !== user.id) {
    return { ok: false, message: "You can only update tasks assigned to you" };
  }

  if (task.status !== RequestStatus.in_progress) {
    return { ok: false, message: "Start work before requesting completion" };
  }

  // A code is already pending (e.g. a double-tap before the page refreshed,
  // or the worker also asked via WhatsApp) — reuse it instead of minting a
  // new one, which would silently invalidate the code the tenant was
  // already given and produce a confusing "doesn't match" a moment later.
  if (task.completionCode) {
    return {
      ok: true,
      message: "Ask the tenant for their 4-digit code, then enter it below.",
    };
  }

  const code = generateCode();

  await prisma.maintenanceRequest.update({
    where: { id: taskId },
    data: { completionCode: code, completionCodeAt: new Date() },
  });

  // Tell the tenant a code is waiting for the worker — including on
  // WhatsApp, since they need this in hand before the worker can finish up.
  await notifyTenantCompletionCode({
    taskId,
    taskTitle: task.title,
    tenantId: task.userId,
    code,
  });

  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [task.userId, user.id],
  });

  revalidatePath("/protected/tasks");
  revalidatePath("/protected/requests");
  revalidatePath(`/protected/requests/${taskId}`);

  return {
    ok: true,
    message: "Ask the tenant for their 4-digit code, then enter it below.",
  };
};

/** Worker types in the code the tenant gave them. Match → completed. */
export const submitCompletionCodeAction = async (
  formData: FormData,
): Promise<TaskStatusResult> => {
  const user = await requireRole(UserType.worker);

  const taskId = formData.get("taskId")?.toString() ?? "";
  const code = formData.get("code")?.toString() ?? "";
  const notes = formData.get("notes")?.toString() ?? "";
  const attachments = formData.getAll("attachments");

  const task = await prisma.maintenanceRequest.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      userId: true,
      assignedToId: true,
      status: true,
      completionCode: true,
    },
  });

  if (!task || task.assignedToId !== user.id) {
    return { ok: false, message: "You can only update tasks assigned to you" };
  }

  if (!task.completionCode) {
    return { ok: false, message: "No completion code was requested" };
  }

  if (code.trim() !== task.completionCode) {
    return {
      ok: false,
      message: "That code doesn't match. Ask the tenant again.",
    };
  }

  await prisma.maintenanceRequest.update({
    where: { id: taskId },
    data: {
      status: RequestStatus.completed,
      completedAt: new Date(),
      completionCode: null,
      completionCodeAt: null,
      taskLogs: {
        create: {
          status: RequestStatus.completed,
          changedById: user.id,
          notes: notes
            ? `${notes} (verified by tenant code)`
            : "Completed and verified by tenant code",
        },
      },
    },
  });

  let uploadFailed = false;

  if (attachments.length > 0) {
    uploadFailed = await saveAttachments(attachments, taskId, user.id);
  }

  await notifyStatusChange({ ...task, status: RequestStatus.completed });

  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [task.userId, user.id],
  });

  revalidatePath("/protected/tasks");
  revalidatePath("/protected/history");
  revalidatePath("/protected/requests");
  revalidatePath(`/protected/requests/${taskId}`);
  revalidatePath(`/protected/maintenance/${taskId}`);

  return {
    ok: true,
    message: uploadFailed
      ? "Completed and verified — but some photos failed to upload."
      : "Completed and verified by the tenant.",
  };
};

/** Worker backs out of the completion step without finishing. */
export const cancelCompletionAction = async (
  taskId: string,
): Promise<TaskStatusResult> => {
  const user = await requireRole(UserType.worker);

  const task = await prisma.maintenanceRequest.findUnique({
    where: { id: taskId },
    select: { id: true, assignedToId: true, completionCode: true },
  });

  if (!task || task.assignedToId !== user.id) {
    return { ok: false, message: "You can only update tasks assigned to you" };
  }

  await prisma.maintenanceRequest.update({
    where: { id: taskId },
    data: { completionCode: null, completionCodeAt: null },
  });

  revalidatePath("/protected/tasks");
  revalidatePath("/protected/requests");

  return { ok: true, message: "Completion cancelled." };
};

/* ── Admin actions ─────────────────────────────────────────────────────────── */

/** An admin files a request directly — for a specific unit, or for a
 * common area shared by the whole property — and can optionally assign a
 * worker to it in the same step. Admin-only — property owners have
 * read-only access to everything except creating a new property. */
export const createRequestAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const propertyId = formData.get("propertyId")?.toString();
  const unitId = formData.get("unitId")?.toString() || undefined;
  const isCommonArea = formData.get("isCommonArea")?.toString() === "true";
  const title = formData.get("title")?.toString().trim();
  const location = formData.get("location")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const priority = parsePriority(formData.get("priority")?.toString());
  const workerId = formData.get("workerId")?.toString() || undefined;

  if (!propertyId || !title || !location || !description) {
    return encodedRedirect(
      "error",
      "/protected/maintenance/new",
      "Please fill in all required fields.",
    );
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      units: { select: { id: true, tenantId: true } },
    },
  });

  if (!property) {
    return encodedRedirect(
      "error",
      "/protected/maintenance/new",
      "Property not found.",
    );
  }

  // Never trust the client's isCommonArea flag alone — a single-unit
  // property has no shared space distinct from that one unit.
  const useCommonArea = isCommonArea && property.units.length > 1;

  if (!useCommonArea) {
    if (!unitId || !property.units.some((u) => u.id === unitId)) {
      return encodedRedirect(
        "error",
        "/protected/maintenance/new",
        "Select a unit in this property.",
      );
    }
  }

  if (workerId) {
    const worker = await prisma.user.findUnique({
      where: { id: workerId },
      select: { userType: true },
    });
    if (!worker || worker.userType !== UserType.worker) {
      return encodedRedirect(
        "error",
        "/protected/maintenance/new",
        "Select a valid worker.",
      );
    }
  }

  // Attribute the request to the unit's tenant (if it has one) so they're
  // the one notified of status changes and see it under "My requests" —
  // not the admin who merely filed it on their behalf.
  const tenantId = useCommonArea
    ? null
    : (property.units.find((u) => u.id === unitId)?.tenantId ?? null);

  const request = await prisma.maintenanceRequest.create({
    data: {
      userId: tenantId ?? admin.id,
      // Distinct from userId (the tenant it's for) — this is who actually
      // filed it, so the UI can show "Added by <admin>" on requests an
      // admin created on someone's behalf.
      createdById: admin.id,
      unitId: useCommonArea ? null : unitId,
      propertyId: useCommonArea ? property.id : null,
      title,
      location,
      description,
      priority,
      status: RequestStatus.pending,
      assignedToId: workerId,
      taskLogs: {
        create: {
          status: RequestStatus.pending,
          changedById: admin.id,
          notes: `Request created by ${admin.email}${
            useCommonArea ? " for a common area" : ""
          }`,
        },
      },
    },
  });

  if (workerId) {
    const worker = await prisma.user.findUnique({
      where: { id: workerId },
      select: {
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        workerCategory: true,
        companyName: true,
      },
    });

    const place = useCommonArea
      ? `${property.name} · ${location} (Common area)`
      : `${property.name} (${location})`;

    await notifyWorkerAssigned(
      { id: request.id, title: request.title, userId: request.userId },
      workerId,
      worker,
      place,
    );
  }

  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: workerId ? [workerId] : [],
  });

  revalidatePath("/protected/maintenance");
  revalidatePath("/protected/requests");
  if (workerId) revalidatePath("/protected/tasks");

  return encodedRedirect(
    "success",
    "/protected/maintenance",
    "Request created.",
  );
};

export const assignWorkerAction = async (formData: FormData) => {
  // Admin-only — property owners have read-only access to everything
  // except creating a new property (see createPropertyAction).
  const admin = await requireRole(UserType.admin);

  const requestId = formData.get("requestId")?.toString();
  const workerId = formData.get("workerId")?.toString() || undefined;
  const status = formData.get("status")?.toString();

  if (!requestId || !status || !STATUSES.includes(status)) {
    throw new Error("Missing required fields");
  }

  const nextStatus = status as RequestStatus;

  const current = await prisma.maintenanceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      title: true,
      userId: true,
      status: true,
      assignedToId: true,
      location: true,
      unit: {
        select: {
          label: true,
          property: {
            select: {
              name: true,
              propertyType: { select: { unitPrefix: true } },
            },
          },
        },
      },
      property: { select: { name: true } },
    },
  });

  if (!current) {
    throw new Error("Request not found");
  }

  if (!(await canManageRequest(admin, requestId))) {
    throw new Error("You cannot manage this request");
  }

  if (
    (current.status === RequestStatus.on_hold) !==
    (nextStatus === RequestStatus.on_hold)
  ) {
    throw new Error(
      current.status === RequestStatus.on_hold
        ? "Use the held-job review controls to resume this request"
        : "Use Put On Hold so a reason is recorded",
    );
  }

  if (
    current.status === RequestStatus.on_hold &&
    workerId &&
    workerId !== current.assignedToId
  ) {
    throw new Error("Choose the worker from the Assign & Resume controls");
  }

  const statusChanged = nextStatus !== current.status;
  const workerChanged = Boolean(workerId) && workerId !== current.assignedToId;

  await prisma.maintenanceRequest.update({
    where: { id: requestId },
    data: {
      status: nextStatus,
      ...(workerId && { assignedToId: workerId }),
      ...(statusChanged &&
        nextStatus === RequestStatus.en_route && { enRouteAt: new Date() }),
      ...(statusChanged &&
        nextStatus === RequestStatus.in_progress && {
          inProgressAt: new Date(),
        }),
      ...(statusChanged &&
        nextStatus === RequestStatus.completed && { completedAt: new Date() }),
    },
  });

  if (statusChanged) {
    await prisma.taskLog.create({
      data: {
        requestId,
        status: nextStatus,
        changedById: admin.id,
        notes: `Status changed from ${current.status} to ${nextStatus} by admin`,
      },
    });

    await notifyStatusChange({
      ...current,
      status: nextStatus,
      assignedToId: workerId ?? current.assignedToId,
    });
  }

  if (workerChanged && workerId) {
    const worker = await prisma.user.findUnique({
      where: { id: workerId },
      select: {
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        workerCategory: true,
        companyName: true,
      },
    });

    await prisma.taskLog.create({
      data: {
        requestId,
        status: nextStatus,
        changedById: admin.id,
        notes: `Worker assigned: ${worker?.email ?? workerId}${
          worker?.workerCategory === "third_party"
            ? ` (3rd-party${worker.companyName ? ` — ${worker.companyName}` : ""})`
            : worker?.workerCategory === "in_house"
              ? " (in-house)"
              : ""
        }`,
      },
    });

    const place = current.unit
      ? `${current.unit.property.name} · ${
          current.unit.property.propertyType.unitPrefix
            ? `${current.unit.property.propertyType.unitPrefix} ${current.unit.label}`
            : current.unit.label
        } (${current.location})`
      : current.property
        ? `${current.property.name} · ${current.location} (Common area)`
        : current.location;

    await notifyWorkerAssigned(current, workerId, worker, place);

    if (current.assignedToId && current.assignedToId !== workerId) {
      await notifyWorkerUnassigned({
        id: current.id,
        title: current.title,
        workerId: current.assignedToId,
      });
    }
  }

  // The worker losing the job needs to hear about it as much as the one getting it.
  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [current.userId, workerId, current.assignedToId].filter(
      (id): id is string => Boolean(id),
    ),
  });

  revalidatePath("/protected/maintenance");
  revalidatePath(`/protected/maintenance/${requestId}`);
  revalidatePath("/protected/tasks");

  return { success: true };
};

/* ── Notifications ─────────────────────────────────────────────────────────── */

/**
 * Every role sees the same request through a different page, and each of those
 * pages turns away the other roles. So the link has to follow the recipient,
 * not the request.
 */
function notificationHref(
  userType: UserType,
  relatedId: string | null,
): string | null {
  if (!relatedId) {
    return null;
  }

  if (userType === UserType.admin) {
    return `/protected/maintenance/${relatedId}`;
  }

  // Workers have no per-task page, only the board they work off.
  if (userType === UserType.worker) {
    return "/protected/tasks";
  }

  return `/protected/requests/${relatedId}`;
}

export const getNotificationsAction = async () => {
  const user = await getCurrentUser();

  if (!user) {
    return { notifications: [], unreadCount: 0 };
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return {
    notifications: notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      href:
        notification.href ??
        notificationHref(user.userType, notification.relatedId),
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    })),
    unreadCount: await prisma.notification.count({
      where: { userId: user.id, isRead: false },
    }),
  };
};

export const markNotificationAsReadAction = async (formData: FormData) => {
  const user = await requireUser();

  const markAllRead = formData.get("markAllRead")?.toString();
  const notificationId = formData.get("notificationId")?.toString();

  if (markAllRead === "true") {
    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });

    return { success: true };
  }

  if (notificationId) {
    // Scoping by userId means someone else's notification matches nothing,
    // rather than being readable or writable.
    const { count } = await prisma.notification.updateMany({
      where: { id: notificationId, userId: user.id },
      data: { isRead: true },
    });

    if (count === 0) {
      throw new Error("Notification not found or doesn't belong to you");
    }

    return { success: true };
  }

  throw new Error("Invalid request");
};
