import "server-only";

import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import {
  sendEmail,
  renderNotificationEmail,
  renderInvoiceEmail,
} from "@/lib/email";
import { sendWhatsApp, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { generateWhatsAppMessage } from "@/lib/gemini";
import { syncWorkerWhatsappSession } from "@/lib/whatsapp-session";
import { UserType } from "@/lib/generated/prisma/client";
import type { RequestStatus } from "@/lib/generated/prisma/client";

/**
 * Notifications are written from application code, not database triggers, so
 * every path that changes a request must call into here.
 */

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
    select: { id: true, email: true, phone: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));

  await Promise.allSettled(
    rows.flatMap((row) => {
      const user = byId.get(row.userId);
      if (!user) return [];

      const tasks: Promise<unknown>[] = [];

      if (user.email) {
        tasks.push(
          sendEmail({
            to: user.email,
            subject: row.title,
            html:
              row.emailHtml ??
              renderNotificationEmail(
                row.title,
                row.message,
                row.href,
                row.details,
              ),
          }),
        );
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
        const phone = user.phone;
        const detailLines = row.details
          ?.map((d) => `${d.label}: ${d.value}`)
          .join("\n");
        const fallbackBody = `*${row.title}*\n${row.message}${detailLines ? `\n\n${detailLines}` : ""}`;

        tasks.push(
          (async () => {
            const generated = await generateWhatsAppMessage({
              title: row.title,
              message: row.message,
              details: row.details,
            });
            await sendWhatsApp({ to: phone, body: generated ?? fallbackBody });
          })(),
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
  const { details, emailHtml, whatsappTemplate, ...dbData } = args.data;
  const created = await prisma.notification.create({ data: dbData });
  await dispatchExternalChannels([{ ...dbData, details, emailHtml, whatsappTemplate }]);
  return created;
}

/** Drop-in replacement for `prisma.notification.createMany`, same idea. */
async function createNotifications(args: {
  data: (NotificationRow & ChannelExtras)[];
}) {
  const dbData = args.data.map(
    ({ details, emailHtml, whatsappTemplate, ...rest }) => rest,
  );
  const created = await prisma.notification.createMany({ data: dbData });
  await dispatchExternalChannels(args.data);
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
    where: { userType: UserType.admin },
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
          ` Reply *done* here on WhatsApp once it's finished, or open My Tasks.`,
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
    where: { userType: UserType.admin },
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
    ` Reply *1* here on WhatsApp when you're on your way, or open My Tasks for full details.`;

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
        title: "New Task Assigned",
        message: workerMessage,
        relatedId: request.id,
        href: "/protected/tasks",
        details: [
          { label: "Job", value: request.title },
          ...(place ? [{ label: "Location", value: place }] : []),
        ],
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
  await createNotification({
    data: {
      userId: request.workerId,
      title: "Reassigned",
      message: `"${request.title}" has been reassigned to someone else.`,
      relatedId: request.id,
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
    where: { userType: UserType.admin },
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
    where: { userType: UserType.admin },
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
    where: { userType: UserType.admin },
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
    where: { userType: UserType.admin },
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

export async function notifyTenantCharge(input: {
  tenantId: string;
  chargeId: string;
  title: string;
}): Promise<void> {
  await createNotification({
    data: {
      userId: input.tenantId,
      title: "New Amount Due",
      message: `A new charge has been added: “${input.title}”.`,
      href: `/protected/finances/${input.chargeId}`,
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

  await publish({ kind: "notification", userIds: [input.tenantId] });
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
}): Promise<void> {
  await createNotification({
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

  await createNotification({
    data: {
      userId: input.ownerId,
      title: "Charge Paid",
      message: `${input.tenantEmail} paid ${input.amount} for “${input.title}”.`,
      href: `/protected/finances/${input.chargeId}`,
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

  await createNotification({
    data: {
      userId: input.ownerId,
      title: "Payment Proof Submitted",
      message: `${input.tenantEmail} submitted proof for “${input.title}”.`,
      href: `/protected/finances/${input.chargeId}`,
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

/** An admin rejected a property an owner submitted. The property row is
 * deleted as part of rejection, so this carries no `href` to it. */
export async function notifyPropertyRejected(input: {
  ownerId: string;
  propertyName: string;
}): Promise<void> {
  await createNotification({
    data: {
      userId: input.ownerId,
      title: "Property Rejected",
      message: `“${input.propertyName}” was not approved. Please contact the admin, or submit it again with corrections.`,
    },
  });

  await publish({ kind: "notification", userIds: [input.ownerId] });
}

/** An admin assigned an existing (or newly created) property to an owner. */
export async function notifyPropertyAssigned(input: {
  ownerId: string;
  propertyId: string;
  propertyName: string;
  /** Included when the property has a service charge configured — surfaced
   * as details on the email/WhatsApp message so the owner knows what
   * they're on the hook for from day one. */
  serviceCharge?: { amount: string; cycleMonths: number; dueDate: string };
}): Promise<void> {
  const details = input.serviceCharge
    ? [
        { label: "Service charge", value: input.serviceCharge.amount },
        {
          label: "Billing cycle",
          value: `Every ${input.serviceCharge.cycleMonths} month${input.serviceCharge.cycleMonths === 1 ? "" : "s"}`,
        },
        { label: "Due date", value: input.serviceCharge.dueDate },
      ]
    : undefined;

  await createNotification({
    data: {
      userId: input.ownerId,
      title: "Property Assigned to You",
      message: `“${input.propertyName}” has been assigned to you.`,
      href: `/protected/properties/${input.propertyId}`,
      ...(details && { details }),
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
  amount: string;
  dueDate: string;
  recipientIds: string[];
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  await createNotifications({
    data: input.recipientIds.map((userId) => ({
      userId,
      title: "Service Charge Due Soon",
      message: `The ${input.amount} service charge for “${input.propertyName}” is due on ${input.dueDate}.`,
      href: `/protected/properties/${input.propertyId}`,
    })),
  });

  await publish({ kind: "notification", userIds: input.recipientIds });
}

export async function notifyServiceChargeDue(input: {
  propertyId: string;
  propertyName: string;
  amount: string;
  recipientIds: string[];
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  await createNotifications({
    data: input.recipientIds.map((userId) => ({
      userId,
      title: "Service Charge Due Today",
      message: `The ${input.amount} service charge for “${input.propertyName}” is due today.`,
      href: `/protected/properties/${input.propertyId}`,
    })),
  });

  await publish({ kind: "notification", userIds: input.recipientIds });
}

export async function notifyServiceChargeOverdue(input: {
  propertyId: string;
  propertyName: string;
  amount: string;
  daysOverdue: number;
  recipientIds: string[];
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  await createNotifications({
    data: input.recipientIds.map((userId) => ({
      userId,
      title: "Service Charge Overdue",
      message: `The ${input.amount} service charge for “${input.propertyName}” is ${input.daysOverdue} day${
        input.daysOverdue === 1 ? "" : "s"
      } overdue.`,
      href: `/protected/properties/${input.propertyId}`,
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
