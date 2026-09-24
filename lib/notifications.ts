import "server-only";

import { after } from "next/server";
import { format } from "date-fns";

import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import {
  sendEmail,
  renderNotificationEmail,
  renderInvoiceEmail,
} from "@/lib/email";
import { sendWhatsAppAlert, sendWhatsAppTemplate } from "@/lib/whatsapp";
import {
  formatOwnerWhatsApp,
  ownerChargeIssuedCopy,
  ownerChargeReminderCopy,
  ownerServiceChargeCopy,
} from "@/lib/owner-alerts";
import {
  ownerChargePaidCopy,
  ownerPaymentProofCopy,
  tenantChargeIssuedCopy,
  tenantPaymentApprovedCopy,
  tenantPaymentRejectedCopy,
  tenantRentReminderCopy,
  workerTaskAssignedCopy,
  workerTaskReassignedCopy,
} from "@/lib/tenant-alerts";
import { formatMoney, PAYMENT_METHOD_LABEL } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { syncWorkerWhatsappSession } from "@/lib/whatsapp-session";
import { UserType } from "@/lib/generated/prisma/client";
import { STAFF_ADMIN_TYPES } from "@/lib/user-roles";
import type { RequestStatus } from "@/lib/generated/prisma/client";

/**
 * Notifications are written from application code, not database triggers, so
 * every path that changes a request must call into here.
 */

/** Every email sent to a property owner is also copied here — a single
 * inbox to audit what owners actually receive. Requested directly; not
 * configurable via env since it's a one-off monitoring address rather than
 * a deployment setting. */
const OWNER_EMAIL_MONITOR = "m.muneebakhtar1998@gmail.com";

type NotificationRow = {
  userId: string;
  title: string;
  message: string;
  relatedId?: string;
  href?: string;
};

/** Extra, email-only presentation data — never written to the database, only
 * used to build a richer email than the plain title/message the in-app
 * notification and WhatsApp message use. */
type ChannelExtras = {
  /** Label/value rows rendered as a small details box under the message
   * (property, unit, amount, due date, etc.). */
  details?: { label: string; value: string }[];
  /** Fully custom email HTML (e.g. a real invoice) that replaces the default
   * template entirely for this notification's email. */
  emailHtml?: string;
  /** Send this approved WhatsApp Message Template instead of free-form text.
   * Needed for a true first contact — see lib/whatsapp.ts's note on the
   * 24-hour customer-service window. If the recipient has no phone, or the
   * template env var isn't configured, this is silently skipped like every
   * other best-effort channel here. */
  whatsappTemplate?: { envVar: string; bodyParams: string[] };
  /** Real file attachments on the outbound email (PDF invoices). */
  attachments?: import("@/lib/email").EmailAttachment[];
  /** Override the default WhatsApp body. Owners otherwise get a formatted
   * account notice built from title/message/details. */
  whatsappBody?: string;
};

/** Every in-app notification also goes out by email and (when the recipient
 * has a phone on file) WhatsApp. Both channels are best-effort: a missing
 * provider API key or a send failure never blocks the in-app notification —
 * see lib/email.ts and lib/whatsapp.ts for the no-op-until-configured
 * behavior. */
async function dispatchExternalChannels(
  rows: (NotificationRow & ChannelExtras)[],
): Promise<void> {
  if (rows.length === 0) return;

  const userIds = [...new Set(rows.map((row) => row.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, phone: true, userType: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));

  await Promise.allSettled(
    rows.flatMap((row) => {
      const user = byId.get(row.userId);
      if (!user) return [];

      const tasks: Promise<unknown>[] = [];

      if (user.email) {
        const emailHtml =
          row.emailHtml ??
          renderNotificationEmail(row.title, row.message, row.href, row.details);

        tasks.push(
          sendEmail({
            to: user.email,
            subject: row.title,
            html: emailHtml,
            attachments: row.attachments,
          }),
        );

        // Every property-owner email also goes to this monitoring address —
        // requested so there's a single inbox to audit what owners receive.
        if (user.userType === UserType.owner && OWNER_EMAIL_MONITOR) {
          tasks.push(
            sendEmail({
              to: OWNER_EMAIL_MONITOR,
              subject: `[Owner copy — ${user.email}] ${row.title}`,
              html: emailHtml,
              attachments: row.attachments,
            }),
          );
        }
      }

      if (user.phone && row.whatsappTemplate) {
        const templateName = process.env[row.whatsappTemplate.envVar];
        if (templateName) {
          tasks.push(
            sendWhatsAppTemplate({
              to: user.phone,
              templateName,
              bodyParams: row.whatsappTemplate.bodyParams,
            }),
          );
        } else {
          console.warn(
            `[whatsapp] ${row.whatsappTemplate.envVar} not set — skipping first-contact template message to`,
            user.phone,
          );
        }
      } else if (user.phone) {
        // Anything without its own tailored copy still goes out as one tidy
        // labelled line - "Title: message | Label: value | ..." - rather than
        // a bare sentence, so tenant, owner and worker messages all read the
        // same professional way.
        const body =
          row.whatsappBody ||
          formatOwnerWhatsApp({
            heading: row.title,
            intro: row.message ? `${row.title}: ${row.message}` : row.title,
            lines: row.details,
          });

        // A trailing segment that isn't a "Label: value" pair is the closing
        // note; everything else is already in the row's own fields.
        const segments = body.split(" | ");
        const last = segments.length > 1 ? segments[segments.length - 1] : "";
        const closing = last && !/^[^:]{1,40}: /.test(last) ? last : undefined;

        tasks.push(
          sendWhatsAppAlert({
            to: user.phone,
            flatBody: body,
            parts: {
              title: row.title,
              message: row.message,
              details: row.details ?? [],
              closing,
            },
          }),
        );
      }

      return tasks;
    }),
  );
}

/** Drop-in replacement for `prisma.notification.create` that also fans the
 * same notification out over email/WhatsApp. Same `{ data }` shape (plus the
 * optional email-only extras above), so every existing call site below works
 * unchanged. */
async function createNotification(args: {
  data: NotificationRow & ChannelExtras;
}) {
  const { details, emailHtml, whatsappTemplate, whatsappBody, ...dbData } = args.data;
  const created = await prisma.notification.create({ data: dbData });
  const work = dispatchExternalChannels([
    { ...dbData, details, emailHtml, whatsappTemplate, whatsappBody },
  ]).catch((error) =>
    console.error("Notification email/WhatsApp dispatch failed:", error),
  );
  // Start the send immediately — a nested `after()` from charge create can
  // otherwise never run WhatsApp. Keep the request alive until it finishes.
  after(() => work);
  await work;
  return created;
}

/** Drop-in replacement for `prisma.notification.createMany`, same idea. */
async function createNotifications(args: {
  data: (NotificationRow & ChannelExtras)[];
}) {
  const dbData = args.data.map(
    ({ details, emailHtml, whatsappTemplate, attachments, whatsappBody, ...rest }) => rest,
  );
  const created = await prisma.notification.createMany({ data: dbData });
  const work = dispatchExternalChannels(args.data).catch((error) =>
    console.error("Notification email/WhatsApp dispatch failed:", error),
  );
  after(() => work);
  await work;
  return created;
}

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

/** Admin-facing wording for the same status transitions as
 * STATUS_NOTIFICATION below — worded for someone managing the job, not
 * living in it ("Worker is heading to..." vs "A maintenance worker is on
 * the way for your request..."). */
const ADMIN_STATUS_NOTIFICATION: Partial<
  Record<RequestStatus, { title: string; message: (t: string) => string }>
> = {
  en_route: {
    title: "Worker En Route",
    message: (title) => `Worker is heading to "${title}".`,
  },
  in_progress: {
    title: "Work Started",
    message: (title) => `Worker started work on "${title}".`,
  },
  completed: {
    title: "Request Completed",
    message: (title) => `"${title}" has been marked completed by the worker.`,
  },
};

export async function notifyStatusChange(request: {
  id: string;
  title: string;
  userId: string;
  status: RequestStatus;
  /** The worker currently on the job, if any — surfaced as contact details
   * on the "en route" / "in progress" emails so the tenant knows who to
   * expect and how to reach them. */
  assignedToId?: string | null;
}): Promise<void> {
  const template = STATUS_NOTIFICATION[request.status];

  if (!template) {
    return;
  }

  let details: { label: string; value: string }[] | undefined;

  if (
    request.assignedToId &&
    (request.status === "en_route" || request.status === "in_progress")
  ) {
    const worker = await prisma.user.findUnique({
      where: { id: request.assignedToId },
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        workerCategory: true,
        companyName: true,
      },
    });

    if (worker) {
      const workerName =
        [worker.firstName, worker.lastName].filter(Boolean).join(" ") ||
        worker.email;

      details = [
        {
          label: "Assigned to",
          value:
            worker.workerCategory === "third_party" && worker.companyName
              ? `${workerName} (${worker.companyName})`
              : workerName,
        },
        {
          label: "Type",
          value:
            worker.workerCategory === "third_party"
              ? "3rd-party contractor"
              : "In-house staff",
        },
        ...(worker.phone ? [{ label: "Contact number", value: worker.phone }] : []),
        ...(worker.email ? [{ label: "Email", value: worker.email }] : []),
      ];
    }
  }

  await createNotification({
    data: {
      userId: request.userId,
      title: template.title,
      message: template.message(request.title),
      relatedId: request.id,
      ...(details && { details }),
    },
  });

  // A status change here only ever happens because a worker did something
  // (headed over, started, finished) — admins get their own notice of it,
  // separate from the tenant's, worded for someone managing the job.
  const admins = await prisma.user.findMany({
    where: { userType: { in: STAFF_ADMIN_TYPES } },
    select: { id: true },
  });

  if (admins.length > 0) {
    const adminTemplate = ADMIN_STATUS_NOTIFICATION[request.status] ?? template;
    await createNotifications({
      data: admins.map((admin) => ({
        userId: admin.id,
        title: adminTemplate.title,
        message: adminTemplate.message(request.title),
        relatedId: request.id,
        ...(details && { details }),
      })),
    });
    await publish({
      kind: "notification",
      userIds: admins.map((admin) => admin.id),
    });
  }

  await publish({ kind: "notification", userIds: [request.userId] });
}

/** The worker says the job's done and is waiting on the tenant's 4-digit
 * code — tenant needs this in hand to actually give it to the worker, so
 * (unlike a plain in-app-only notice) this has to reach them wherever
 * they'll see it fastest, which for most tenants is WhatsApp. */
export async function notifyTenantCompletionCode(input: {
  taskId: string;
  taskTitle: string;
  tenantId: string;
  code: string;
}): Promise<void> {
  await createNotification({
    data: {
      userId: input.tenantId,
      title: "Give this code to the worker",
      message: `Work on "${input.taskTitle}" is ready. Share code ${input.code} with the worker to confirm completion.`,
      relatedId: input.taskId,
    },
  });

  await publish({ kind: "notification", userIds: [input.tenantId] });
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
    where: { userType: { in: STAFF_ADMIN_TYPES }, id: { not: input.actorId } },
    select: { id: true },
  });
  const recipientIds = [input.tenantId, ...admins.map((admin) => admin.id)];

  await createNotifications({
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
    where: { userType: { in: STAFF_ADMIN_TYPES } },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await createNotifications({
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
  place?: string;
}): Promise<void> {
  await createNotifications({
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
        message:
          (input.workerChanged
            ? `"${input.title}" has been assigned to you after an admin review.${input.place ? ` Location: ${input.place}.` : ""}`
            : `You can continue work on "${input.title}".`) +
          ` Just let me know here once it's finished, or open My Tasks.`,
        relatedId: input.id,
        href: "/protected/tasks",
      },
    ],
  });

  await publish({
    kind: "notification",
    userIds: [input.tenantId, input.workerId],
  });

  await syncWorkerWhatsappSession(input.workerId, input.id);
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
    where: { userType: { in: STAFF_ADMIN_TYPES } },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await createNotifications({
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

/** An owner finished setting up a property's units and submitted it for
 * review — distinct from the property just existing as a draft, which
 * admins never hear about until this fires. */
export async function notifyAdminsPropertySubmitted(input: {
  propertyId: string;
  propertyName: string;
  ownerEmail: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userType: { in: STAFF_ADMIN_TYPES } },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await createNotifications({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Property Submitted for Review",
      message: `${input.ownerEmail} submitted “${input.propertyName}” for approval.`,
      href: "/protected/properties",
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
  worker?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    workerCategory?: "in_house" | "third_party" | null;
    companyName?: string | null;
  } | null,
  /** "Property · Unit (Room)" — where the worker needs to go. Omitted only if
   * the request somehow has no unit on record. */
  place?: string,
): Promise<void> {
  const isThirdParty = worker?.workerCategory === "third_party";

  const tenantMessage = isThirdParty
    ? `A 3rd-party contractor has been assigned to your request "${request.title}".`
    : `A maintenance worker has been assigned to your request "${request.title}".`;

  const workerMessage =
    (place
      ? `You've been assigned a maintenance job: "${request.title}" at ${place}.`
      : `You have been assigned to work on a maintenance request: "${request.title}".`) +
    ` Just let me know here once you're heading over, or open My Tasks for full details.`;

  const workerCopy = workerTaskAssignedCopy({ jobTitle: request.title, place });

  const workerName =
    [worker?.firstName, worker?.lastName].filter(Boolean).join(" ") ||
    worker?.email;

  const tenantDetails = worker
    ? [
        {
          label: "Assigned to",
          value:
            isThirdParty && worker.companyName
              ? `${workerName} (${worker.companyName})`
              : (workerName ?? "Unassigned"),
        },
        {
          label: "Type",
          value: isThirdParty ? "3rd-party contractor" : "In-house staff",
        },
        ...(worker.phone
          ? [{ label: "Contact number", value: worker.phone }]
          : []),
        ...(worker.email ? [{ label: "Email", value: worker.email }] : []),
      ]
    : undefined;

  await createNotifications({
    data: [
      {
        userId: request.userId,
        title: "Worker Assigned",
        message: tenantMessage,
        relatedId: request.id,
        ...(tenantDetails && { details: tenantDetails }),
      },
      {
        userId: workerId,
        title: workerCopy.title,
        message: workerMessage,
        relatedId: request.id,
        href: "/protected/tasks",
        details: workerCopy.details.filter((d) => d.value),
        whatsappBody: workerCopy.whatsappBody,
      },
    ],
  });

  await publish({
    kind: "notification",
    userIds: [request.userId, workerId],
  });

  // So the worker's next plain "1" / "done" on WhatsApp is understood
  // against this job.
  await syncWorkerWhatsappSession(workerId, request.id);
}

/** A different worker took over a request — lets the one who lost it know,
 * so their task list doesn't just silently drop something they were on. */
export async function notifyWorkerUnassigned(request: {
  id: string;
  title: string;
  workerId: string;
}): Promise<void> {
  const copy = workerTaskReassignedCopy({ jobTitle: request.title });
  await createNotification({
    data: {
      userId: request.workerId,
      title: copy.title,
      message: copy.message,
      relatedId: request.id,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
    },
  });

  await publish({ kind: "notification", userIds: [request.workerId] });
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
    where: { userType: { in: STAFF_ADMIN_TYPES } },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await createNotifications({
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
    where: { userType: { in: STAFF_ADMIN_TYPES } },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await createNotifications({
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
  await createNotification({
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
    where: { userType: { in: STAFF_ADMIN_TYPES } },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await createNotifications({
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
    where: { userType: { in: STAFF_ADMIN_TYPES } },
    select: { id: true },
  });

  if (admins.length === 0) {
    return;
  }

  await createNotifications({
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

/** Property/unit/tenant/kind for a charge — every payment message names
 * where it is about, so none of them read as a bare one-liner. */
async function chargeContext(chargeId: string) {
  const charge = await prisma.charge.findUnique({
    where: { id: chargeId },
    select: {
      title: true,
      amount: true,
      dueDate: true,
      type: true,
      tenant: { select: { firstName: true, lastName: true, email: true } },
      unit: {
        select: {
          label: true,
          property: {
            select: {
              name: true,
              propertyType: { select: { unitPrefix: true, hasFloors: true } },
            },
          },
        },
      },
    },
  });
  if (!charge) return null;
  return {
    charge,
    propertyName: charge.unit.property.name,
    unitLabel: formatUnitLabel(charge.unit.property.propertyType, charge.unit.label),
    tenantName:
      [charge.tenant.firstName, charge.tenant.lastName].filter(Boolean).join(" ") ||
      charge.tenant.email,
  };
}

export async function notifyTenantCharge(input: {
  tenantId: string;
  chargeId: string;
  title: string;
}): Promise<void> {
  const ctx = await chargeContext(input.chargeId);
  const copy = ctx
    ? tenantChargeIssuedCopy({
        propertyName: ctx.propertyName,
        unitLabel: ctx.unitLabel,
        chargeTitle: input.title,
        amount: formatMoney(ctx.charge.amount),
        dueDate: format(ctx.charge.dueDate, "d MMM yyyy"),
      })
    : null;

  await createNotification({
    data: {
      userId: input.tenantId,
      title: copy?.title ?? "New Amount Due",
      message: copy?.message ?? `A new charge has been added: “${input.title}”.`,
      href: `/protected/finances/${input.chargeId}`,
      ...(copy && { details: copy.details, whatsappBody: copy.whatsappBody }),
    },
  });

  await publish({ kind: "notification", userIds: [input.tenantId] });
}

/** One or more charges were just created for a tenant (move-in charges, an
 * ad-hoc bill, generated rent) — sends a single proper invoice email instead
 * of a plain "a charge was added" line, with every line item and the total.
 * The in-app notification stays a short summary; only the email uses the
 * full invoice layout. */
export async function notifyTenantInvoice(input: {
  tenantId: string;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
  /** A stable-ish id to show as the invoice number — the tenancy id or
   * charge id both work; it just needs to be recognizable if referenced. */
  invoiceRef: string;
  dueDate: string;
  /** Where "View & Pay" and the in-app notification should link. */
  href: string;
  lineItems: { label: string; amount: string }[];
  total: string;
}): Promise<void> {
  if (input.lineItems.length === 0) return;

  const summary =
    input.lineItems.length === 1
      ? `A new charge has been added: “${input.lineItems[0].label}” — ${input.lineItems[0].amount}, due ${input.dueDate}.`
      : `${input.lineItems.length} new charges have been added, totaling ${input.total}, due ${input.dueDate}.`;

  const emailHtml = renderInvoiceEmail({
    invoiceNumber: input.invoiceRef.slice(0, 8).toUpperCase(),
    issueDate: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    dueDate: input.dueDate,
    tenantName: input.tenantName,
    propertyName: input.propertyName,
    unitLabel: input.unitLabel,
    lineItems: input.lineItems,
    total: input.total,
    href: input.href,
  });

  await createNotification({
    data: {
      userId: input.tenantId,
      title: input.lineItems.length === 1 ? "New Amount Due" : "New Invoice",
      message: summary,
      href: input.href,
      details: [
        ...input.lineItems.map((item) => ({
          label: item.label,
          value: item.amount,
        })),
        ...(input.lineItems.length > 1
          ? [{ label: "Total", value: input.total }]
          : []),
      ],
      emailHtml,
    },
  });

  await publish({ kind: "notification", userIds: [input.tenantId] });
}

/** Landlord copy of a rent or bill just issued to their tenant. */
export async function notifyOwnerChargeIssued(input: {
  ownerId: string | null | undefined;
  chargeId: string;
  kind: "rent" | "bill";
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  amount: string;
  dueDate: string;
  title: string;
}): Promise<void> {
  if (!input.ownerId) return;

  const copy = ownerChargeIssuedCopy(input);
  await createNotification({
    data: {
      userId: input.ownerId,
      title: copy.title,
      message: copy.message,
      href: `/protected/finances/${input.chargeId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

/** Upcoming / due / overdue rent or bill — owners only. */
/** Plain rent reminder to the tenant themselves — sent on the 1st and 15th
 * while a month's rent is still unpaid (see lib/tenant-rent-reminders.ts).
 * Goes out in-app, by email and by WhatsApp like every other notification. */
export async function notifyTenantRentReminder(input: {
  tenantId: string;
  chargeId: string;
  monthLabel: string;
  amount: string;
  overdue: boolean;
  propertyName: string;
  unitLabel: string;
}): Promise<void> {
  const copy = tenantRentReminderCopy(input);
  await createNotification({
    data: {
      userId: input.tenantId,
      title: copy.title,
      message: copy.message,
      href: `/protected/finances/${input.chargeId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
    },
  });
  await publish({ kind: "notification", userIds: [input.tenantId] });
}

/** A post-dated cheque's date has arrived and it's still uncleared — tells
 * every admin to deposit it / chase it. See lib/cheque-date-reminders.ts. */
export async function notifyAdminsChequeDue(input: {
  chargeId: string;
  chequeNumber: string | null;
  amount: string;
  tenantName: string;
  unitLabel: string;
  propertyName: string;
  chequeDate: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userType: { in: STAFF_ADMIN_TYPES } },
    select: { id: true },
  });
  if (admins.length === 0) return;

  await createNotifications({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Cheque due today",
      message: `Cheque${input.chequeNumber ? ` no. ${input.chequeNumber}` : ""} of ${input.amount} from ${input.tenantName} (${input.unitLabel}, ${input.propertyName}) is dated ${input.chequeDate}. Deposit it and mark the outcome.`,
      href: "/protected/finances/cheque-reminders",
    })),
  });
  await publish({ kind: "notification", userIds: admins.map((a) => a.id) });
}

export async function notifyOwnerChargeReminder(input: {
  ownerId: string;
  chargeId: string;
  stage: "upcoming" | "due" | "overdue";
  kind: "rent" | "bill";
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  amount: string;
  dueDate: string;
  title: string;
  daysOverdue?: number;
}): Promise<void> {
  const copy = ownerChargeReminderCopy(input);
  await createNotification({
    data: {
      userId: input.ownerId,
      title: copy.title,
      message: copy.message,
      href: `/protected/finances/${input.chargeId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

export async function notifyOwnerServiceChargeIssued(input: {
  ownerId: string | null | undefined;
  propertyId: string;
  propertyName: string;
  unitLabel: string;
  amount: string;
  dueDate: string;
  invoiceNumber?: string;
}): Promise<void> {
  if (!input.ownerId) return;

  const copy = ownerServiceChargeCopy({
    stage: "issued",
    propertyName: input.propertyName,
    unitLabel: input.unitLabel,
    amount: input.amount,
    dueDate: input.dueDate,
    invoiceNumber: input.invoiceNumber,
  });

  await createNotification({
    data: {
      userId: input.ownerId,
      title: copy.title,
      message: copy.message,
      href: `/protected/properties/${input.propertyId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

export async function notifyOwnerChequeUpdate(input: {
  ownerId: string | null | undefined;
  chargeId: string;
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  amount: string;
  chequeNumber: string | null;
  clearanceStatus: "cleared" | "bounced";
}): Promise<void> {
  if (!input.ownerId) return;

  const cleared = input.clearanceStatus === "cleared";
  const title = cleared ? "Cheque cleared" : "Cheque bounced";
  const message = cleared
    ? `A cheque of ${input.amount} from ${input.tenantName} for ${input.unitLabel} at ${input.propertyName} has cleared.`
    : `A cheque of ${input.amount} from ${input.tenantName} for ${input.unitLabel} at ${input.propertyName} has bounced. The charge remains outstanding.`;
  const details = [
    { label: "Property", value: input.propertyName },
    { label: "Unit", value: input.unitLabel },
    { label: "Tenant", value: input.tenantName },
    { label: "Amount", value: input.amount },
    ...(input.chequeNumber
      ? [{ label: "Cheque no.", value: input.chequeNumber }]
      : []),
    { label: "Status", value: cleared ? "Cleared" : "Bounced" },
  ];

  await createNotification({
    data: {
      userId: input.ownerId,
      title,
      message,
      href: `/protected/finances/${input.chargeId}`,
      details,
      whatsappBody: formatOwnerWhatsApp({
        heading: title,
        intro: "",
        lines: details,
        closing: cleared
          ? "The payment is now on the ledger."
          : "Please follow up with the tenant, or reply here and we will assist.",
      }),
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

/** A tenant was just moved into a unit — welcomes them with the lease
 * specifics (rent, due day, deposit, move-in date) instead of a bare "you
 * were assigned" line. */
export async function notifyTenantAssigned(input: {
  tenantId: string;
  propertyName: string;
  unitLabel: string;
  moveInDate: string;
  monthlyRent: string;
  rentDueDay: number;
  securityDeposit?: string;
  leaseEndDate?: string;
  /** The property's owner, if it has one — they get their own "new tenant
   * moved in" notice alongside the tenant's welcome email. */
  ownerId?: string | null;
}): Promise<void> {
  const details = [
    { label: "Property", value: input.propertyName },
    { label: "Unit", value: input.unitLabel },
    { label: "Move-in date", value: input.moveInDate },
    { label: "Monthly rent", value: input.monthlyRent },
    { label: "Rent due day", value: `${ordinal(input.rentDueDay)} of each month` },
    ...(input.securityDeposit
      ? [{ label: "Security deposit", value: input.securityDeposit }]
      : []),
    ...(input.leaseEndDate
      ? [{ label: "Lease end date", value: input.leaseEndDate }]
      : []),
  ];

  await createNotification({
    data: {
      userId: input.tenantId,
      title: "You've Been Assigned a New Home",
      message: `You've been assigned to ${input.unitLabel} at ${input.propertyName}. Welcome!`,
      href: "/protected",
      details,
      // This is very often the tenant's first-ever contact with the
      // WhatsApp number — Meta blocks free-form text in that case, so this
      // sends the approved WHATSAPP_TEMPLATE_TENANT_WELCOME template
      // instead (see lib/whatsapp.ts). Update the params here to match
      // that template's {{1}}, {{2}}, ... order if you change its wording.
      whatsappTemplate: {
        envVar: "WHATSAPP_TEMPLATE_TENANT_WELCOME",
        bodyParams: [
          input.unitLabel,
          input.propertyName,
          input.moveInDate,
          input.monthlyRent,
        ],
      },
    },
  });

  if (input.ownerId) {
    await createNotification({
      data: {
        userId: input.ownerId,
        title: "New Tenant Moved In",
        message: `A new tenant has been assigned to ${input.unitLabel} at ${input.propertyName}.`,
        href: "/protected/tenancies",
        details,
      },
    });
  }

  await publish({
    kind: "notification",
    userIds: input.ownerId
      ? [input.tenantId, input.ownerId]
      : [input.tenantId],
  });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export async function notifyPaymentReviewed(input: {
  tenantId: string;
  chargeId: string;
  title: string;
  approved: boolean;
  /** Admin's note when rejecting — shown to the tenant as the reason. */
  reason?: string | null;
  /** The property's owner. When the tenant IS the owner (same account) the
   * tenant-directed wording is skipped — they get the owner-side notice
   * instead — so nobody is ever told "your payment" about a payment that
   * isn't theirs. */
  ownerId?: string | null;
}): Promise<void> {
  if (input.ownerId && input.ownerId === input.tenantId) return;

  const ctx = await chargeContext(input.chargeId);
  const place = ctx
    ? { propertyName: ctx.propertyName, unitLabel: ctx.unitLabel }
    : { propertyName: "your property", unitLabel: "your unit" };

  let copy;
  if (input.approved) {
    const payment = await prisma.payment.findFirst({
      where: { chargeId: input.chargeId, status: "approved" },
      orderBy: { reviewedAt: "desc" },
      select: { amount: true, method: true, paidAt: true },
    });
    copy = tenantPaymentApprovedCopy({
      ...place,
      chargeTitle: input.title,
      amount: formatMoney(payment?.amount ?? ctx?.charge.amount ?? 0),
      method: payment ? PAYMENT_METHOD_LABEL[payment.method] : undefined,
      paidOn: payment ? format(payment.paidAt, "d MMM yyyy") : undefined,
    });
  } else {
    copy = tenantPaymentRejectedCopy({
      ...place,
      chargeTitle: input.title,
      reason: input.reason ?? undefined,
    });
  }

  await createNotification({
    data: {
      userId: input.tenantId,
      title: copy.title,
      message: copy.message,
      href: `/protected/finances/${input.chargeId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
    },
  });

  await publish({ kind: "notification", userIds: [input.tenantId] });
}

/** A charge on one of the owner's properties was fully paid (regardless of
 * which path made that happen — admin-recorded, tenant proof approved, or
 * the owner recording it themselves). Skipped when the property has no owner. */
export async function notifyOwnerChargePaid(input: {
  ownerId: string | null | undefined;
  chargeId: string;
  title: string;
  amount: string;
  tenantEmail: string;
}): Promise<void> {
  if (!input.ownerId) return;

  const ctx = await chargeContext(input.chargeId);
  const copy = ownerChargePaidCopy({
    propertyName: ctx?.propertyName ?? "your property",
    unitLabel: ctx?.unitLabel ?? "your unit",
    kind: ctx?.charge.type === "rent" ? "rent" : "bill",
    tenantName: ctx?.tenantName ?? input.tenantEmail,
    chargeTitle: input.title,
    amount: input.amount,
  });

  await createNotification({
    data: {
      userId: input.ownerId,
      title: copy.title,
      message: copy.message,
      href: `/protected/finances/${input.chargeId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

/** A pending payment proof was submitted for a charge on the owner's
 * property — mirrors notifyAdminsPaymentProof but for the owner. */
export async function notifyOwnerPaymentProof(input: {
  ownerId: string | null | undefined;
  chargeId: string;
  title: string;
  tenantEmail: string;
}): Promise<void> {
  if (!input.ownerId) return;

  const ctx = await chargeContext(input.chargeId);
  const copy = ownerPaymentProofCopy({
    propertyName: ctx?.propertyName ?? "your property",
    unitLabel: ctx?.unitLabel ?? "your unit",
    tenantName: ctx?.tenantName ?? input.tenantEmail,
    chargeTitle: input.title,
  });

  await createNotification({
    data: {
      userId: input.ownerId,
      title: copy.title,
      message: copy.message,
      href: `/protected/finances/${input.chargeId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

/** A charge was waived (written off) — the tenant no longer owes it, and the
 * owner should know the money isn't coming for that charge. */
export async function notifyChargeWaived(input: {
  tenantId: string;
  ownerId: string | null | undefined;
  chargeId: string;
  title: string;
}): Promise<void> {
  const recipientIds = Array.from(
    new Set([input.tenantId, input.ownerId].filter((id): id is string => Boolean(id))),
  );
  if (recipientIds.length === 0) return;

  await createNotifications({
    data: recipientIds.map((userId) => ({
      userId,
      title: "Charge Waived",
      message: `“${input.title}” has been waived and is no longer due.`,
      href: `/protected/finances/${input.chargeId}`,
    })),
  });

  await publish({ kind: "notification", userIds: recipientIds });
}

/** An admin approved a property an owner submitted — it's now live. */
export async function notifyPropertyApproved(input: {
  ownerId: string;
  propertyId: string;
  propertyName: string;
}): Promise<void> {
  await createNotification({
    data: {
      userId: input.ownerId,
      title: "Property Approved",
      message: `“${input.propertyName}” has been approved and is now live.`,
      href: `/protected/properties/${input.propertyId}`,
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

/** A property's service charge became known to its owner — at creation, at
 * approval, or whenever an owner is (re)assigned to a property that already
 * has one configured. Deliberately its own notification rather than a
 * detail bolted onto "Property Assigned"/"Property Approved": a service
 * charge invoice is its own thing, not a footnote on an unrelated event. */
export async function notifyPropertyServiceCharge(input: {
  ownerId: string;
  propertyId: string;
  propertyName: string;
  amount: string;
  cycleMonths: number;
  dueDate: string;
}): Promise<void> {
  await createNotification({
    data: {
      userId: input.ownerId,
      title: "Property Service Charge",
      message: `Your service charge invoice for “${input.propertyName}” has been generated.`,
      href: `/protected/properties/${input.propertyId}`,
      details: [
        { label: "Service charge", value: input.amount },
        {
          label: "Billing cycle",
          value: `Every ${input.cycleMonths} month${input.cycleMonths === 1 ? "" : "s"}`,
        },
        { label: "Due date", value: input.dueDate },
      ],
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

/** An admin rejected a property an owner submitted. The property row is
 * deleted as part of rejection, so this carries no `href` to it. */
export async function notifyPropertyRejected(input: {
  ownerId: string;
  propertyName: string;
  reason: string;
}): Promise<void> {
  await createNotification({
    data: {
      userId: input.ownerId,
      title: "Property Rejected",
      message: `“${input.propertyName}” was not approved: ${input.reason}. Fix it up and submit it again from the property page.`,
      href: "/protected/properties",
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

/** An admin assigned an existing (or newly created) property to an owner. */
export async function notifyPropertyAssigned(input: {
  ownerId: string;
  propertyId: string;
  propertyName: string;
}): Promise<void> {
  await createNotification({
    data: {
      userId: input.ownerId,
      title: "Property Assigned to You",
      message: `“${input.propertyName}” has been assigned to you.`,
      href: `/protected/properties/${input.propertyId}`,
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

/**
 * Service charge reminders. `recipientIds` is the property owner plus every
 * admin (deduped by the caller) — everyone who can act on collecting or
 * chasing the payment.
 */
export async function notifyServiceChargeUpcoming(input: {
  propertyId: string;
  propertyName: string;
  unitLabel?: string;
  amount: string;
  dueDate: string;
  recipientIds: string[];
  attachments?: import("@/lib/email").EmailAttachment[];
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  const copy = ownerServiceChargeCopy({
    stage: "upcoming",
    propertyName: input.propertyName,
    unitLabel: input.unitLabel ?? input.propertyName,
    amount: input.amount,
    dueDate: input.dueDate,
  });

  await createNotifications({
    data: input.recipientIds.map((userId) => ({
      userId,
      title: copy.title,
      message: copy.message,
      href: `/protected/properties/${input.propertyId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
      attachments: input.attachments,
    })),
  });

  await publish({ kind: "notification", userIds: input.recipientIds });
}

export async function notifyServiceChargeDue(input: {
  propertyId: string;
  propertyName: string;
  unitLabel?: string;
  amount: string;
  recipientIds: string[];
  attachments?: import("@/lib/email").EmailAttachment[];
  dueDate?: string;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  const copy = ownerServiceChargeCopy({
    stage: "due",
    propertyName: input.propertyName,
    unitLabel: input.unitLabel ?? input.propertyName,
    amount: input.amount,
    dueDate: input.dueDate,
  });

  await createNotifications({
    data: input.recipientIds.map((userId) => ({
      userId,
      title: copy.title,
      message: copy.message,
      href: `/protected/properties/${input.propertyId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
      attachments: input.attachments,
    })),
  });

  await publish({ kind: "notification", userIds: input.recipientIds });
}

/** A scheduled installment on a payment plan is due within a week — sent
 * either by the daily cron (lib/installment-reminders.ts) or the admin's
 * manual "Send invoice" button on that installment. */
export async function notifyInstallmentDue(input: {
  propertyId: string;
  propertyName: string;
  unitLabel: string;
  sequence: number;
  installmentCount: number;
  amount: string;
  dueDate: string;
  recipientIds: string[];
  attachments?: import("@/lib/email").EmailAttachment[];
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  const copy = ownerServiceChargeCopy({
    stage: "installment",
    propertyName: input.propertyName,
    unitLabel: input.unitLabel,
    amount: input.amount,
    dueDate: input.dueDate,
    installmentLabel: `Installment ${input.sequence} of ${input.installmentCount}`,
  });

  await createNotifications({
    data: input.recipientIds.map((userId) => ({
      userId,
      title: copy.title,
      message: copy.message,
      href: `/protected/properties/${input.propertyId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
      attachments: input.attachments,
    })),
  });

  await publish({ kind: "notification", userIds: input.recipientIds });
}

export async function notifyServiceChargeOverdue(input: {
  propertyId: string;
  propertyName: string;
  unitLabel?: string;
  amount: string;
  daysOverdue: number;
  recipientIds: string[];
  attachments?: import("@/lib/email").EmailAttachment[];
  dueDate?: string;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  const copy = ownerServiceChargeCopy({
    stage: "overdue",
    propertyName: input.propertyName,
    unitLabel: input.unitLabel ?? input.propertyName,
    amount: input.amount,
    dueDate: input.dueDate,
    daysOverdue: input.daysOverdue,
  });

  await createNotifications({
    data: input.recipientIds.map((userId) => ({
      userId,
      title: copy.title,
      message: copy.message,
      href: `/protected/properties/${input.propertyId}`,
      details: copy.details,
      whatsappBody: copy.whatsappBody,
      attachments: input.attachments,
    })),
  });

  await publish({ kind: "notification", userIds: input.recipientIds });
}

/** An admin (or the owner) marked the current cycle's service charge as
 * received, rolling the due date forward to the next cycle. */
export async function notifyServiceChargeReceived(input: {
  propertyId: string;
  propertyName: string;
  amount: string;
  nextDueDate: string;
  recipientIds: string[];
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  await createNotifications({
    data: input.recipientIds.map((userId) => ({
      userId,
      title: "Service Charge Received",
      message: `The ${input.amount} service charge for “${input.propertyName}” was recorded as received. Next due: ${input.nextDueDate}.`,
      href: `/protected/properties/${input.propertyId}`,
    })),
  });

  await publish({ kind: "notification", userIds: input.recipientIds });
}

/** A one-off, system-composed owner message with an optional link
 * attachment — used by sendServiceChargeInvoiceAction (app/service-charge-invoice-actions.ts)
 * to send an invoice, as opposed to the automatic staged reminders above.
 * Same email+WhatsApp fan-out as every other notification here; an
 * attachment (if any) is a link, not a real email attachment — this app's
 * email sender has no attachment API. */
export async function notifyOwnerCustom(input: {
  propertyId: string;
  propertyName: string;
  unitLabel: string;
  message: string;
  attachmentUrl?: string;
  attachments?: import("@/lib/email").EmailAttachment[];
  recipientIds: string[];
  /** Defaults to "Service Charge Reminder" — the ad-hoc Notify Owner case
   * this was originally built for. sendServiceChargeInvoiceAction passes
   * "Service Charge Invoice" instead so the email/notification title
   * matches what's actually being sent. */
  title?: string;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  const details = [
    { label: "Property", value: input.propertyName },
    { label: "Unit", value: input.unitLabel },
    ...(input.attachmentUrl && !input.attachments?.length
      ? [{ label: "Attachment", value: input.attachmentUrl }]
      : []),
    ...(input.attachments?.length
      ? [{ label: "Invoice", value: "PDF attached to this email" }]
      : []),
  ];

  await createNotifications({
    data: input.recipientIds.map((userId) => ({
      userId,
      title: input.title ?? "Service Charge Reminder",
      message: input.message,
      href: `/protected/properties/${input.propertyId}`,
      details,
      attachments: input.attachments,
    })),
  });

  await publish({ kind: "notification", userIds: input.recipientIds });
}

/** An in-house worker's HR paperwork (passport, visa, Civil ID, car
 * insurance) is approaching, at, or past its expiry — sent to every admin
 * so renewal can't be missed. See lib/hr-reminders.ts for the daily cron
 * that calls this once per document per stage. */
export async function notifyHrDocumentExpiring(input: {
  workerId: string;
  workerName: string;
  documentLabel: string;
  expiryDate: string;
  daysUntilDue: number;
  recipientIds: string[];
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  const title =
    input.daysUntilDue < 0
      ? `${input.documentLabel} Overdue`
      : input.daysUntilDue === 0
        ? `${input.documentLabel} Expires Today`
        : `${input.documentLabel} Expiring Soon`;

  const message =
    input.daysUntilDue < 0
      ? `${input.workerName}'s ${input.documentLabel.toLowerCase()} expired on ${input.expiryDate} (${Math.abs(input.daysUntilDue)} day${Math.abs(input.daysUntilDue) === 1 ? "" : "s"} ago).`
      : input.daysUntilDue === 0
        ? `${input.workerName}'s ${input.documentLabel.toLowerCase()} expires today (${input.expiryDate}).`
        : `${input.workerName}'s ${input.documentLabel.toLowerCase()} expires on ${input.expiryDate} (in ${input.daysUntilDue} day${input.daysUntilDue === 1 ? "" : "s"}).`;

  // Note: relatedId is a MaintenanceRequest FK elsewhere in this file, so it
  // can't carry the worker's id here — the worker record link goes through
  // href instead.
  await createNotifications({
    data: input.recipientIds.map((userId) => ({
      userId,
      title,
      message,
      href: "/protected/users?role=worker",
    })),
  });

  await publish({ kind: "notification", userIds: input.recipientIds });
}
