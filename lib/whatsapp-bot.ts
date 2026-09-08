import "server-only";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { notifyAdminsNewRequest, notifyStatusChange } from "@/lib/notifications";
import { isValidPhone } from "@/lib/phone";
import { classifyChoice, generateFreeformReply } from "@/lib/gemini";
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Household items/problems that clearly point at one category or room even
 * though the word itself never appears in the option list — "stove" doesn't
 * contain "kitchen", but everyone means the same thing. Checked against
 * every word in the message, case-insensitively. Not exhaustive by design:
 * this only needs to cover the common cases fast and for free; anything it
 * doesn't recognize still falls through to classifyChoice. */
const SYNONYMS: Record<string, string> = {
  // Plumbing
  leak: "Plumbing",
  leaking: "Plumbing",
  tap: "Plumbing",
  faucet: "Plumbing",
  pipe: "Plumbing",
  drain: "Plumbing",
  toilet: "Plumbing",
  clog: "Plumbing",
  clogged: "Plumbing",
  // Electrical
  socket: "Electrical",
  outlet: "Electrical",
  switch: "Electrical",
  wire: "Electrical",
  wiring: "Electrical",
  light: "Electrical",
  bulb: "Electrical",
  power: "Electrical",
  // AC / Cooling
  ac: "AC / Cooling",
  aircon: "AC / Cooling",
  "a/c": "AC / Cooling",
  cooling: "AC / Cooling",
  hvac: "AC / Cooling",
  // Appliance
  fridge: "Appliance",
  refrigerator: "Appliance",
  stove: "Appliance",
  oven: "Appliance",
  microwave: "Appliance",
  washer: "Appliance",
  dryer: "Appliance",
  dishwasher: "Appliance",
  // Rooms — for the location step
  bed: "Bedroom",
  shower: "Bathroom",
  sink: "Kitchen",
  cabinet: "Kitchen",
  car: "Garage",
  lawn: "Garden / yard",
  plant: "Garden / yard",
  yard: "Garden / yard",
};

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[a.length][b.length];
}

/** Case-insensitive exact, whole-word, synonym, or near-miss-typo match
 * against a list of options — instant and works with zero network
 * dependency, so replies like "electrical", "stove", or "kitcen" (typo)
 * all resolve immediately instead of waiting on (and depending on) an AI
 * call. Tried before classifyChoice everywhere, which only ever has to
 * handle genuinely free-form phrasing this can't cover. */
function findDirectMatch(bodyLower: string, options: string[]): string | undefined {
  const exact = options.find((o) => o.toLowerCase() === bodyLower);
  if (exact) return exact;

  const wordBoundary = options.find((o) => {
    const optionLower = o.toLowerCase();
    return new RegExp(`\\b${escapeRegExp(optionLower)}\\b`).test(bodyLower);
  });
  if (wordBoundary) return wordBoundary;

  const words = bodyLower.split(/[^a-z0-9/]+/i).filter(Boolean);

  for (const word of words) {
    const synonymLabel = SYNONYMS[word];
    const synonymMatch = synonymLabel && options.find((o) => o === synonymLabel);
    if (synonymMatch) return synonymMatch;
  }

  // Typo tolerance: a short edit distance relative to word length catches
  // "kitcen" → "kitchen" without being loose enough to conflate unrelated
  // short words.
  for (const word of words) {
    if (word.length < 4) continue;
    const closest = options.find((o) => {
      const optionLower = o.toLowerCase();
      const maxDistance = optionLower.length <= 5 ? 1 : 2;
      return levenshtein(word, optionLower) <= maxDistance;
    });
    if (closest) return closest;
  }

  return undefined;
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
// A plain greeting isn't the same as "I want to report something" — jumping
// straight to a category list on "hi" is presumptuous. Greetings get an
// open question instead; only these actually start the report flow.
const GREETING_WORDS = ["hi", "hello", "hey", "hiya", "yo"];
const REPORT_TRIGGER_WORDS = [
  "menu",
  "start",
  "new",
  "report",
  "report an issue",
  "report a problem",
  "problem",
  "issue",
  "new request",
  "new issue",
];
const YES_WORDS = ["yes", "y", "yeah", "yep", "yup", "sure", "go ahead", "confirm", "correct", "submit", "ok", "okay"];
const NO_WORDS = ["no", "n", "nope", "nah", "cancel", "stop"];

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

  if (GREETING_WORDS.includes(bodyLower)) {
    return "Hey there! I can help you report a maintenance issue or check on an existing one — what do you need?";
  }

  if (REPORT_TRIGGER_WORDS.includes(bodyLower)) {
    await setSession(phone, {
      userId,
      flow: WhatsappFlow.new_request,
      step: "category",
      data: {},
    });
    return (
      "Sure — what kind of issue is it?\n\n" +
      CATEGORIES.map((c, i) => `${i + 1}. ${c.label}`).join("\n") +
      "\n\nJust send the number, or tell me what's wrong and I'll figure it out. (Send *status* any time to check your open requests.)"
    );
  }

  if (!session?.flow) {
    // No "menu" needed — if they just described a problem outright ("my AC
    // stopped working"), jump straight into the flow with the category
    // already inferred instead of making them repeat themselves. Direct
    // match first (instant, no AI needed), then classify free-form phrasing.
    const directCategoryLabel = findDirectMatch(
      bodyLower,
      CATEGORIES.map((c) => c.label),
    );
    const matchedCategoryLabel =
      directCategoryLabel ??
      (await classifyChoice({
        question: "Are they reporting a maintenance problem, and if so what kind?",
        userMessage: body,
        options: CATEGORIES.map((c) => c.label),
      }));
    const matchedCategory = CATEGORIES.find(
      (c) => c.label === matchedCategoryLabel,
    );

    if (matchedCategory) {
      const locationOptions = await getTenantLocationOptions(userId);

      await setSession(phone, {
        userId,
        flow: WhatsappFlow.new_request,
        step: "location",
        data: {
          category: matchedCategory.label,
          priority: matchedCategory.priority,
          locationOptions: locationOptions.join(LOCATION_OPTIONS_DELIMITER),
        },
      });

      return (
        `Sounds like a ${matchedCategory.label.toLowerCase()} issue — I'll get that logged. Which room or area?\n\n` +
        locationOptions.map((option, i) => `${i + 1}. ${option}`).join("\n") +
        "\n\nA number works, or just tell me where."
      );
    }

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
      "Send *menu* to report a new issue, or *status* to check your open requests."
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
      let category: { label: string; priority: Priority } | undefined =
        CATEGORIES[index];

      // Fast path (a plain number) failed — try a direct match on the
      // category name itself (instant, no AI needed), then fall back to
      // classifying free-form phrasing ("my sink won't stop leaking").
      if (!category) {
        const directLabel = findDirectMatch(
          bodyLower,
          CATEGORIES.map((c) => c.label),
        );
        category = CATEGORIES.find((c) => c.label === directLabel);
      }

      if (!category) {
        const matchedLabel = await classifyChoice({
          question: "What kind of issue is it?",
          userMessage: body,
          options: CATEGORIES.map((c) => c.label),
        });
        category = CATEGORIES.find((c) => c.label === matchedLabel);
      }

      if (!category) {
        return (
          "Hmm, I didn't quite catch that. Pick a number, or describe it a bit more:\n\n" +
          CATEGORIES.map((c, i) => `${i + 1}. ${c.label}`).join("\n")
        );
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
        `Got it, ${category.label.toLowerCase()} it is. Which room or area?\n\n` +
        locationOptions.map((option, i) => `${i + 1}. ${option}`).join("\n") +
        "\n\nA number works, or just tell me where."
      );
    }

    case "location": {
      const options = data.locationOptions?.split(LOCATION_OPTIONS_DELIMITER) ?? [];
      const index = Number(body) - 1;
      let location: string | undefined = options[index];

      if (!location) {
        location = findDirectMatch(bodyLower, options);
      }

      if (!location) {
        const matched = await classifyChoice({
          question: "Which room or area is the issue in?",
          userMessage: body,
          options,
        });
        location = matched ?? undefined;
      }

      if (!location) {
        return (
          "Sorry, which of these is it closest to?\n\n" +
          options.map((option, i) => `${i + 1}. ${option}`).join("\n")
        );
      }

      await setSession(phone, {
        step: "description",
        data: { ...data, location },
      });
      return "Perfect. What's going on — give me a quick description.";
    }

    case "description": {
      if (!body) {
        return "I'll need a few words on what's happening before I can log this.";
      }

      const nextData: Record<string, string> = { ...data, description: body };
      await setSession(phone, { step: "confirm", data: nextData });

      return (
        "Here's what I've got:\n\n" +
        `Issue: ${nextData.category}\n` +
        `Location: ${nextData.location}\n` +
        `Description: ${nextData.description}\n\n` +
        "Look right? Reply *yes* to send it in, or *no* to cancel."
      );
    }

    case "confirm": {
      const YES = "yes";
      const NO = "no";
      let choice: string | undefined = YES_WORDS.includes(bodyLower)
        ? YES
        : NO_WORDS.includes(bodyLower)
          ? NO
          : undefined;

      if (!choice) {
        choice =
          (await classifyChoice({
            question: "Should I submit this maintenance request?",
            userMessage: body,
            options: [YES, NO],
          })) ?? undefined;
      }

      if (choice === YES) {
        return submitTenantRequest(userId, phone, data);
      }

      if (choice === NO) {
        await clearSession(phone);
        return "No problem, cancelled. Send *menu* whenever you want to start again.";
      }

      return "Just need a yes or no — should I go ahead and submit this?";
    }

    default:
      await clearSession(phone);
      return "Sorry, I lost track of that. Send *menu* to start fresh.";
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
    `Done! Your request "${request.title}" is in. ` +
    "I'll message you here the moment someone's assigned."
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
    return "Nothing open right now. Send *menu* if something needs fixing.";
  }

  return (
    "Here's what's open:\n\n" +
    requests
      .map((r) => `• ${r.title} — ${r.status.replace("_", " ")}`)
      .join("\n")
  );
}

/* ── Worker: act on an assigned task ─────────────────────────────────────── */

const START_WORDS = [
  "1",
  "start",
  "on my way",
  "on the way",
  "heading over",
  "heading there",
  "coming now",
  "en route",
  "yes",
];
const ARRIVED_WORDS = [
  "1",
  "arrived",
  "here now",
  "just got here",
  "just arrived",
  "in progress",
  "start work",
  "starting now",
  "yes",
];
const DONE_WORDS = [
  "1",
  "done",
  "complete",
  "completed",
  "finished",
  "all done",
  "all finished",
  "wrapped up",
  "job's done",
  "job done",
  "task done",
  "task complete",
];

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
    return "Nothing on your plate right now — enjoy the quiet!";
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
      return "Heading over? Just say so, or send *1*.";
    case RequestStatus.en_route:
      return "Let me know when you've arrived and started — send *1* or tell me.";
    case RequestStatus.in_progress:
      return "Reply *1* (or just tell me) once it's done and I'll grab the completion code.";
    default:
      return "";
  }
}

/** True on an exact keyword hit (instant, no AI call) or, failing that, when
 * the free text they sent clearly means the same thing ("heading over now",
 * "just got here", "all wrapped up") — checked one status at a time so a
 * reply is only ever classified against the single action that's actually
 * valid right now. */
async function matchesAction(
  bodyLower: string,
  words: string[],
  question: string,
): Promise<boolean> {
  // Exact hit, or one of the phrases appears in a longer reply ("yeah on my
  // way now") — both instant, no AI needed. Word-boundary, not a naive
  // substring check — otherwise the short entry "1" would match any message
  // that merely contains a "1" somewhere (e.g. "call me at 1pm").
  if (
    words.some(
      (w) => bodyLower === w || new RegExp(`\\b${escapeRegExp(w)}\\b`).test(bodyLower),
    )
  ) {
    return true;
  }

  const match = await classifyChoice({
    question,
    userMessage: bodyLower,
    options: ["yes"],
  });
  return match === "yes";
}

async function handleWorkerTaskReply(
  workerId: string,
  phone: string,
  taskId: string,
  bodyLower: string,
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

  if (
    task.status === RequestStatus.pending &&
    (await matchesAction(
      bodyLower,
      START_WORDS,
      `Are they saying they're heading to / on their way to a job now? They wrote: "${bodyLower}"`,
    ))
  ) {
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

    return `On it! Marked as on your way for "${task.title}". ${actionPromptFor(RequestStatus.en_route)}`;
  }

  if (
    task.status === RequestStatus.en_route &&
    (await matchesAction(
      bodyLower,
      ARRIVED_WORDS,
      `Are they saying they've arrived and started working on the job? They wrote: "${bodyLower}"`,
    ))
  ) {
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

    return `Got it, marked "${task.title}" as in progress. ${actionPromptFor(RequestStatus.in_progress)}`;
  }

  if (
    task.status === RequestStatus.in_progress &&
    (await matchesAction(
      bodyLower,
      DONE_WORDS,
      `Are they saying the job is finished / done / complete? They wrote: "${bodyLower}"`,
    ))
  ) {
    // A code may already be pending — from this same worker tapping "done"
    // on the web dashboard, or a duplicate WhatsApp reply. Reuse it instead
    // of minting a new one, which would silently invalidate the code the
    // tenant was already given (see the matching guard in
    // app/actions.ts's requestCompletionAction).
    if (!task.completionCode) {
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
    }

    await setSession(phone, {
      flow: WhatsappFlow.awaiting_completion_code,
      step: null,
      data: null,
      taskId,
    });

    await publish({ kind: "request", roles: [UserType.admin], userIds: [task.userId, workerId] });
    revalidatePath("/protected/tasks");

    return "Nice work! Just grab the 4-digit code from the tenant and send it here to wrap it up.";
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
    return "There's no code pending right now. Send *tasks* to see where things stand.";
  }

  const code = body.trim();

  if (code !== task.completionCode) {
    return "That doesn't match what I have — double-check with the tenant, or send *tasks* to cancel.";
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
