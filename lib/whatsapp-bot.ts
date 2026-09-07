import "server-only";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { notifyAdminsNewRequest, notifyStatusChange } from "@/lib/notifications";
import { isValidPhone } from "@/lib/phone";
import { generateFreeformReply } from "@/lib/gemini";
import {
  getWhatsappSession,
  setWhatsappSession,
  clearWhatsappSession,
} from "@/lib/whatsapp-session";
import {
  Priority,
  RequestStatus,
  UserType,
  WhatsappFlow,
} from "@/lib/generated/prisma/client";

/**
 * The other half of the WhatsApp integration (see lib/whatsapp.ts, which
 * only sends). This is the inbound side: app/api/whatsapp/webhook/route.ts
 * hands every incoming message to `handleIncomingWhatsapp`, which figures
 * out who's texting and what they're trying to do, and returns the plain
 * text reply to send back.
 *
 * Deliberately kept independent of app/actions.ts rather than calling into
 * it: those server actions authenticate via the Supabase session
 * (`requireRole`/`requireUser`), which doesn't exist here — identity comes
 * from the sender's phone number matching a `User.phone` instead. The
 * business rules that matter (status flow order, the completion-code
 * handshake) are re-applied here directly against Prisma so a WhatsApp
 * reply can never skip a step the web app would also enforce.
 */

const CATEGORIES: { label: string; priority: Priority }[] = [
  { label: "Plumbing", priority: Priority.medium },
  { label: "Electrical", priority: Priority.high },
  { label: "AC / Cooling", priority: Priority.high },
  { label: "Appliance", priority: Priority.medium },
  { label: "Other", priority: Priority.low },
];

/** Session data is a flat string map, so the location options list picked
 * for this tenant's property type is stashed as one delimited string
 * between the "category" and "location" steps rather than re-derived from
 * a hardcoded list — different property types have different rooms. */
const LOCATION_OPTIONS_DELIMITER = "||";

/** Same options shown in the web report form's room dropdown, so a tenant
 * picks a number here instead of free-typing a room name (which risked
 * typos ending up as the request's "location" field). Falls back to a
 * single "Other" like the web form does for a property type with none set. */
async function getTenantLocationOptions(userId: string): Promise<string[]> {
  const unit = await prisma.unit.findUnique({
    where: { tenantId: userId },
    select: { property: { select: { propertyType: { select: { locationOptions: true } } } } },
  });

  const options = unit?.property.propertyType.locationOptions;
  return options && options.length > 0 ? options : ["Other"];
}

function generateCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 10000;
  return String(n).padStart(4, "0");
}

/** Meta's Cloud API sends the sender as bare digits with no "+"
 * (e.g. "96812345678"); the rest of the app stores plain E.164
 * ("+96812345678") — see lib/phone.ts. */
export function normalizeWhatsappPhone(rawFrom: string): string {
  const phone = rawFrom.trim();
  return phone.startsWith("+") ? phone : `+${phone}`;
}

const getSession = getWhatsappSession;
const setSession = setWhatsappSession;
const clearSession = clearWhatsappSession;

const MENU_WORDS = ["menu", "hi", "hello", "hey", "start", "new"];

export async function handleIncomingWhatsapp(
  rawFrom: string,
  rawBody: string,
): Promise<string> {
  const phone = normalizeWhatsappPhone(rawFrom);
  const body = rawBody.trim();
  const bodyLower = body.toLowerCase();

  if (!isValidPhone(phone)) {
    return "Sorry, we couldn't read your number. Please contact your administrator.";
  }

  const user = await prisma.user.findFirst({
    where: { phone },
    select: { id: true, userType: true, email: true },
  });

  if (!user) {
    return "This number isn't registered on PropertyCare. Please contact your administrator to get set up.";
  }

  if (user.userType === UserType.user) {
    return tenantFlow(user.id, phone, body, bodyLower);
  }

  if (user.userType === UserType.worker) {
    return workerFlow(user.id, phone, body, bodyLower);
  }

  return "You're signed up as staff — please use the PropertyCare dashboard on the web for this.";
}

/* ── Tenant: report an issue ─────────────────────────────────────────────── */

async function tenantFlow(
  userId: string,
  phone: string,
  body: string,
  bodyLower: string,
): Promise<string> {
  const session = await getSession(phone);

  if (bodyLower === "status") {
    return listTenantRequests(userId);
  }

  if (MENU_WORDS.includes(bodyLower)) {
    await setSession(phone, {
      userId,
      flow: WhatsappFlow.new_request,
      step: "category",
      data: {},
    });
    return (
      "Let's report a maintenance issue. What's it about?\n\n" +
      CATEGORIES.map((c, i) => `${i + 1}. ${c.label}`).join("\n") +
      "\n\nReply with a number. (Reply *status* any time to check your open requests.)"
    );
  }

  if (!session?.flow) {
    const openRequests = await prisma.maintenanceRequest.findMany({
      where: { userId, status: { not: RequestStatus.completed } },
      select: { title: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const context =
      openRequests.length === 0
        ? "No open requests right now."
        : "Open requests:\n" +
          openRequests
            .map((r) => `- ${r.title} (${r.status.replace("_", " ")})`)
            .join("\n");

    const generated = await generateFreeformReply({
      role: "tenant",
      userMessage: body,
      context,
      validCommands: '"menu" to report a new issue, "status" to check open requests',
    });

    return (
      generated ??
      "Reply *menu* to report a new issue, or *status* to check your open requests."
    );
  }

  // Annotated explicitly rather than relying on inference: `A ?? {}` where A
  // is a cast (not a nullable type) makes TS union the result with the
  // empty-object-literal type `{}`, and a later `{...data, x}` spread can
  // then get typed as just `{x: ...}` — silently losing every other key.
  const data: Record<string, string> = (session.data as Record<
    string,
    string
  > | null) ?? {};

  switch (session.step) {
    case "category": {
      const index = Number(body) - 1;
      const category = CATEGORIES[index];

      if (!category) {
        return `Please reply with a number from 1 to ${CATEGORIES.length}.`;
      }

      const locationOptions = await getTenantLocationOptions(userId);

      await setSession(phone, {
        step: "location",
        data: {
          ...data,
          category: category.label,
          priority: category.priority,
          locationOptions: locationOptions.join(LOCATION_OPTIONS_DELIMITER),
        },
      });
      return (
        "Which room or area is this in?\n\n" +
        locationOptions.map((option, i) => `${i + 1}. ${option}`).join("\n") +
        "\n\nReply with a number."
      );
    }

    case "location": {
      const options = data.locationOptions?.split(LOCATION_OPTIONS_DELIMITER) ?? [];
      const index = Number(body) - 1;
      const location = options[index];

      if (!location) {
        return `Please reply with a number from 1 to ${options.length}.`;
      }

      await setSession(phone, {
        step: "description",
        data: { ...data, location },
      });
      return "Got it. Briefly describe the issue.";
    }

    case "description": {
      if (!body) {
        return "Please describe the issue in a few words.";
      }

      const nextData: Record<string, string> = { ...data, description: body };
      await setSession(phone, { step: "confirm", data: nextData });

      return (
        "Please confirm:\n\n" +
        `Issue: ${nextData.category}\n` +
        `Location: ${nextData.location}\n` +
        `Description: ${nextData.description}\n\n` +
        "Reply *YES* to submit this request, or *NO* to cancel."
      );
    }

    case "confirm": {
      if (bodyLower === "yes" || bodyLower === "y") {
        return submitTenantRequest(userId, phone, data);
      }

      if (bodyLower === "no" || bodyLower === "n") {
        await clearSession(phone);
        return "Cancelled. Reply *menu* any time to start a new request.";
      }

      return "Reply *YES* to submit this request, or *NO* to cancel.";
    }

    default:
      await clearSession(phone);
      return "Sorry, something went wrong. Reply *menu* to start over.";
  }
}

async function submitTenantRequest(
  userId: string,
  phone: string,
  data: Record<string, string>,
): Promise<string> {
  const unit = await prisma.unit.findUnique({
    where: { tenantId: userId },
    select: { id: true },
  });

  if (!unit) {
    await clearSession(phone);
    return "You're not assigned to an apartment yet. Please contact your administrator.";
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const request = await prisma.maintenanceRequest.create({
    data: {
      userId,
      unitId: unit.id,
      title: data.category ?? "Maintenance issue",
      location: data.location ?? "Not specified",
      description: data.description ?? "",
      priority: (data.priority as Priority) ?? Priority.medium,
      status: RequestStatus.pending,
      taskLogs: {
        create: {
          status: RequestStatus.pending,
          changedById: userId,
          notes: "Request created via WhatsApp",
        },
      },
    },
  });

  await clearSession(phone);

  await notifyAdminsNewRequest({
    id: request.id,
    title: request.title,
    location: request.location,
    reportedBy: user?.email ?? phone,
  });

  await publish({ kind: "request", roles: [UserType.admin], userIds: [userId] });

  revalidatePath("/protected/requests");
  revalidatePath("/protected/maintenance");

  return (
    `Thanks! Your request "${request.title}" has been submitted. ` +
    "We'll notify you here as soon as a worker is assigned."
  );
}

async function listTenantRequests(userId: string): Promise<string> {
  const requests = await prisma.maintenanceRequest.findMany({
    where: { userId, status: { not: RequestStatus.completed } },
    select: { title: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (requests.length === 0) {
    return "You have no open requests. Reply *menu* to report a new issue.";
  }

  return (
    "Your open requests:\n\n" +
    requests
      .map((r) => `• ${r.title} — ${r.status.replace("_", " ")}`)
      .join("\n")
  );
}

/* ── Worker: act on an assigned task ─────────────────────────────────────── */

const START_WORDS = ["1", "start", "on my way", "en route", "yes"];
const ARRIVED_WORDS = ["1", "arrived", "in progress", "start work", "yes"];
const DONE_WORDS = ["1", "done", "complete", "completed", "finished"];

async function workerFlow(
  workerId: string,
  phone: string,
  body: string,
  bodyLower: string,
): Promise<string> {
  if (bodyLower === "tasks" || bodyLower === "status" || MENU_WORDS.includes(bodyLower)) {
    return listWorkerTasks(workerId, phone);
  }

  const session = await getSession(phone);

  if (session?.flow === WhatsappFlow.awaiting_completion_code && session.taskId) {
    return handleCompletionCode(workerId, phone, session.taskId, body);
  }

  if (session?.flow === WhatsappFlow.worker_task && session.taskId) {
    return handleWorkerTaskReply(workerId, phone, session.taskId, bodyLower);
  }

  return listWorkerTasks(workerId, phone);
}

async function listWorkerTasks(workerId: string, phone: string): Promise<string> {
  const tasks = await prisma.maintenanceRequest.findMany({
    where: {
      assignedToId: workerId,
      status: { in: [RequestStatus.pending, RequestStatus.en_route, RequestStatus.in_progress] },
    },
    select: { id: true, title: true, status: true },
    orderBy: { updatedAt: "desc" },
  });

  if (tasks.length === 0) {
    return "You have no active jobs right now.";
  }

  // Whichever job is most recently touched becomes "the" active job for
  // plain replies like "1" or "done" — matches how the assignment/status
  // notifications already set the session.
  await setSession(phone, {
    userId: workerId,
    flow: WhatsappFlow.worker_task,
    step: null,
    data: null,
    taskId: tasks[0].id,
  });

  return (
    "Your active jobs:\n\n" +
    tasks
      .map((t) => `• ${t.title} — ${t.status.replace("_", " ")}`)
      .join("\n") +
    `\n\n${actionPromptFor(tasks[0].status)}`
  );
}

function actionPromptFor(status: RequestStatus): string {
  switch (status) {
    case RequestStatus.pending:
      return 'Reply *1* when you\'re on your way for the most recent job above.';
    case RequestStatus.en_route:
      return "Reply *1* once you've arrived and started work.";
    case RequestStatus.in_progress:
      return "Reply *1* when the job is done to request the completion code.";
    default:
      return "";
  }
}

async function handleWorkerTaskReply(
  workerId: string,
  phone: string,
  taskId: string,
  bodyLower: string,
): Promise<string> {
  const task = await prisma.maintenanceRequest.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, userId: true, assignedToId: true, status: true },
  });

  if (!task || task.assignedToId !== workerId) {
    await clearSession(phone);
    return "That job isn't assigned to you anymore. Reply *tasks* to see your active jobs.";
  }

  if (task.status === RequestStatus.pending && START_WORDS.includes(bodyLower)) {
    await prisma.maintenanceRequest.update({
      where: { id: taskId },
      data: {
        status: RequestStatus.en_route,
        enRouteAt: new Date(),
        taskLogs: {
          create: {
            status: RequestStatus.en_route,
            changedById: workerId,
            notes: "Status changed to en_route via WhatsApp",
          },
        },
      },
    });

    await notifyStatusChange({ ...task, status: RequestStatus.en_route });
    await publish({ kind: "request", roles: [UserType.admin], userIds: [task.userId, workerId] });
    revalidatePath("/protected/tasks");
    revalidatePath(`/protected/maintenance/${taskId}`);

    return `Marked as on your way for "${task.title}". ${actionPromptFor(RequestStatus.en_route)}`;
  }

  if (task.status === RequestStatus.en_route && ARRIVED_WORDS.includes(bodyLower)) {
    await prisma.maintenanceRequest.update({
      where: { id: taskId },
      data: {
        status: RequestStatus.in_progress,
        inProgressAt: new Date(),
        taskLogs: {
          create: {
            status: RequestStatus.in_progress,
            changedById: workerId,
            notes: "Status changed to in_progress via WhatsApp",
          },
        },
      },
    });

    await notifyStatusChange({ ...task, status: RequestStatus.in_progress });
    await publish({ kind: "request", roles: [UserType.admin], userIds: [task.userId, workerId] });
    revalidatePath("/protected/tasks");
    revalidatePath(`/protected/maintenance/${taskId}`);

    return `Marked "${task.title}" as in progress. ${actionPromptFor(RequestStatus.in_progress)}`;
  }

  if (task.status === RequestStatus.in_progress && DONE_WORDS.includes(bodyLower)) {
    const code = generateCode();

    await prisma.maintenanceRequest.update({
      where: { id: taskId },
      data: { completionCode: code, completionCodeAt: new Date() },
    });

    await prisma.notification.create({
      data: {
        userId: task.userId,
        title: "Give this code to the worker",
        message: `Work on "${task.title}" is ready. Share code ${code} with the worker to confirm completion.`,
        relatedId: taskId,
      },
    });

    await setSession(phone, {
      flow: WhatsappFlow.awaiting_completion_code,
      step: null,
      data: null,
      taskId,
    });

    await publish({ kind: "request", roles: [UserType.admin], userIds: [task.userId, workerId] });
    revalidatePath("/protected/tasks");

    return "Ask the tenant for their 4-digit completion code and reply with it here.";
  }

  const fallback =
    `"${task.title}" is currently ${task.status.replace("_", " ")}.\n` +
    actionPromptFor(task.status);

  const generated = await generateFreeformReply({
    role: "worker",
    userMessage: bodyLower,
    context: `Job: "${task.title}". Current status: ${task.status.replace("_", " ")}.`,
    validCommands: actionPromptFor(task.status).replace(/^Reply /, ""),
  });

  return generated ?? fallback;
}

async function handleCompletionCode(
  workerId: string,
  phone: string,
  taskId: string,
  body: string,
): Promise<string> {
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

  if (!task || task.assignedToId !== workerId) {
    await clearSession(phone);
    return "That job isn't assigned to you anymore. Reply *tasks* to see your active jobs.";
  }

  if (!task.completionCode) {
    await setSession(phone, { flow: WhatsappFlow.worker_task, taskId });
    return "No completion code is pending. Reply *tasks* to see the current status.";
  }

  const code = body.trim();

  if (code !== task.completionCode) {
    return "That code doesn't match. Ask the tenant again, or reply *tasks* to cancel.";
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
          changedById: workerId,
          notes: "Completed and verified by tenant code (via WhatsApp)",
        },
      },
    },
  });

  await clearSession(phone);

  await notifyStatusChange({ ...task, status: RequestStatus.completed });
  await publish({ kind: "request", roles: [UserType.admin], userIds: [task.userId, workerId] });

  revalidatePath("/protected/tasks");
  revalidatePath("/protected/history");
  revalidatePath("/protected/requests");
  revalidatePath(`/protected/requests/${taskId}`);
  revalidatePath(`/protected/maintenance/${taskId}`);

  return `"${task.title}" marked as completed. Nice work!`;
}
