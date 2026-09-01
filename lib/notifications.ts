import "server-only";

import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { UserType } from "@/lib/generated/prisma/client";
import type { RequestStatus } from "@/lib/generated/prisma/client";

/**
 * Notifications are written from application code, not database triggers, so
 * every path that changes a request must call into here.
 */

const STATUS_NOTIFICATION: Partial<
  Record<RequestStatus, { title: string; message: (t: string) => string }>
> = {
  en_route: {
    title: "Worker En Route",
    message: (title) =>
      `A maintenance worker is on the way for your request "${title}".`,
  },
  in_progress: {
    title: "Request In Progress",
    message: (title) =>
      `Your maintenance request "${title}" is now being processed.`,
  },
  completed: {
    title: "Request Completed",
    message: (title) =>
      `Your maintenance request "${title}" has been marked as completed.`,
  },
};

export async function notifyStatusChange(request: {
  id: string;
  title: string;
  userId: string;
  status: RequestStatus;
}): Promise<void> {
  const template = STATUS_NOTIFICATION[request.status];

  if (!template) {
    return;
  }

  await prisma.notification.create({
    data: {
      userId: request.userId,
      title: template.title,
      message: template.message(request.title),
      relatedId: request.id,
    },
  });

  await publish({ kind: "notification", userIds: [request.userId] });
}

/** A held job belongs to the admin queue, so both the tenant and admins are told. */
export async function notifyRequestHeld(input: {
  id: string;
  title: string;
  tenantId: string;
  reason: string;
  actorId: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin, id: { not: input.actorId } },
    select: { id: true },
  });
  const recipientIds = [input.tenantId, ...admins.map((admin) => admin.id)];

  await prisma.notification.createMany({
    data: [
      {
        userId: input.tenantId,
        title: "Request Put On Hold",
        message: `Work on "${input.title}" is paused. Reason: ${input.reason}`,
        relatedId: input.id,
      },
      ...admins.map((admin) => ({
        userId: admin.id,
        title: "Job Needs Admin Review",
        message: `"${input.title}" was put on hold. Reason: ${input.reason}`,
        relatedId: input.id,
        href: "/protected/maintenance?status=on_hold",
      })),
    ],
  });

  await publish({ kind: "notification", userIds: recipientIds });
}

/** Tenant signals readiness; only admins can choose a worker and resume the job. */
export async function notifyAdminsResumeRequested(input: {
  id: string;
  title: string;
  tenantEmail: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Held Job Ready for Review",
      message: `${input.tenantEmail} says the blocker for "${input.title}" is resolved. Choose a worker to resume it.`,
      relatedId: input.id,
      href: "/protected/maintenance?status=on_hold",
    })),
  });

  await publish({
    kind: "notification",
    userIds: admins.map((admin) => admin.id),
  });
}

/** Admin has deliberately put the job back into a worker's active queue. */
export async function notifyRequestResumed(input: {
  id: string;
  title: string;
  tenantId: string;
  workerId: string;
  workerChanged: boolean;
}): Promise<void> {
  await prisma.notification.createMany({
    data: [
      {
        userId: input.tenantId,
        title: "Maintenance Work Resumed",
        message: input.workerChanged
          ? `A worker has been assigned and work on "${input.title}" is ready to continue.`
          : `Work on "${input.title}" has been resumed with the same worker.`,
        relatedId: input.id,
      },
      {
        userId: input.workerId,
        title: input.workerChanged
          ? "Held Job Assigned to You"
          : "Task Resumed",
        message: input.workerChanged
          ? `"${input.title}" has been assigned to you after an admin review.`
          : `You can continue work on "${input.title}".`,
        relatedId: input.id,
      },
    ],
  });

  await publish({
    kind: "notification",
    userIds: [input.tenantId, input.workerId],
  });
}

/**
 * A new request sits untouched until an admin triages it, so every admin hears
 * about it. Tenants raise these; nobody else is watching the list.
 */
export async function notifyAdminsNewRequest(request: {
  id: string;
  title: string;
  location: string;
  reportedBy: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "New Maintenance Request",
      message: `${request.reportedBy} reported "${request.title}" at ${request.location}.`,
      relatedId: request.id,
    })),
  });

  await publish({
    kind: "notification",
    userIds: admins.map((admin) => admin.id),
  });
}

/** Tells both the tenant and the newly assigned worker about the assignment. */
export async function notifyWorkerAssigned(
  request: { id: string; title: string; userId: string },
  workerId: string,
): Promise<void> {
  await prisma.notification.createMany({
    data: [
      {
        userId: request.userId,
        title: "Worker Assigned",
        message: `A maintenance worker has been assigned to your request "${request.title}".`,
        relatedId: request.id,
      },
      {
        userId: workerId,
        title: "New Task Assigned",
        message: `You have been assigned to work on a maintenance request: "${request.title}".`,
        relatedId: request.id,
      },
    ],
  });

  await publish({
    kind: "notification",
    userIds: [request.userId, workerId],
  });
}

/** A worker needs something to finish a held job. Every admin sees it, since
 * whoever is free can pick it up or make the purchase. */
export async function notifySupplyRequested(input: {
  requestId: string;
  taskId: string;
  taskTitle: string;
  item: string;
  actorId: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Worker Needs Something",
      message: `For "${input.taskTitle}", the worker needs: ${input.item}.`,
      relatedId: input.taskId,
      href: "/protected/maintenance?status=on_hold",
    })),
  });

  await publish({
    kind: "notification",
    userIds: admins.map((admin) => admin.id),
  });
}

/** The worker attached a purchase receipt to a pending supply request —
 * lets the admin know there's proof (and a suggested cost) to review. */
export async function notifySupplyReceiptUploaded(input: {
  taskId: string;
  taskTitle: string;
  item: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Receipt Uploaded",
      message: `A receipt was added for "${input.item}" on "${input.taskTitle}".`,
      relatedId: input.taskId,
      href: "/protected/maintenance?status=on_hold",
    })),
  });

  await publish({
    kind: "notification",
    userIds: admins.map((admin) => admin.id),
  });
}

/** The admin has approved or denied a worker's supply request. */
export async function notifySupplyRequestDecided(input: {
  taskId: string;
  taskTitle: string;
  item: string;
  workerId: string;
  approved: boolean;
  adminNote: string | null;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.workerId,
      title: input.approved ? "Supply Request Approved" : "Supply Request Denied",
      message: input.approved
        ? `Your request for "${input.item}" on "${input.taskTitle}" was approved.${
            input.adminNote ? ` Note: ${input.adminNote}` : ""
          }`
        : `Your request for "${input.item}" on "${input.taskTitle}" was denied.${
            input.adminNote ? ` Reason: ${input.adminNote}` : ""
          }`,
      relatedId: input.taskId,
    },
  });

  await publish({ kind: "notification", userIds: [input.workerId] });
}

/** The worker (not just the tenant) can say "I have what I need, ready to
 * resume" — only admins can actually pick a worker and restart the job. */
export async function notifyAdminsWorkerReadyToResume(input: {
  id: string;
  title: string;
  workerEmail: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Held Job Ready for Review",
      message: `${input.workerEmail} says they're ready to resume "${input.title}".`,
      relatedId: input.id,
      href: "/protected/maintenance?status=on_hold",
    })),
  });

  await publish({
    kind: "notification",
    userIds: admins.map((admin) => admin.id),
  });
}

export async function notifyAdminsPaymentProof(input: {
  chargeId: string;
  tenantEmail: string;
  title: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Payment Proof Submitted",
      message: `${input.tenantEmail} submitted proof for “${input.title}”.`,
      href: `/protected/finances/${input.chargeId}`,
    })),
  });

  await publish({
    kind: "notification",
    userIds: admins.map((admin) => admin.id),
  });
}

export async function notifyTenantCharge(input: {
  tenantId: string;
  chargeId: string;
  title: string;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.tenantId,
      title: "New Amount Due",
      message: `A new charge has been added: “${input.title}”.`,
      href: `/protected/finances/${input.chargeId}`,
    },
  });

  await publish({ kind: "notification", userIds: [input.tenantId] });
}

export async function notifyPaymentReviewed(input: {
  tenantId: string;
  chargeId: string;
  title: string;
  approved: boolean;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.tenantId,
      title: input.approved ? "Payment Approved" : "Payment Needs Attention",
      message: input.approved
        ? `Your payment for “${input.title}” was approved.`
        : `Your payment proof for “${input.title}” was not approved. You can review the note and submit it again.`,
      href: `/protected/finances/${input.chargeId}`,
    },
  });

  await publish({ kind: "notification", userIds: [input.tenantId] });
}
