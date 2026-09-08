import "server-only";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import {
  notifyAdminsNewRequest,
  notifyRequestHeld,
  notifyStatusChange,
  notifyTenantCompletionCode,
} from "@/lib/notifications";
import { isValidPhone } from "@/lib/phone";
import { classifyChoice, generateFreeformReply } from "@/lib/gemini";
import { downloadWhatsappMedia } from "@/lib/whatsapp";
import { uploadAttachment } from "@/lib/storage";
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

/** Strips trailing punctuation ("?", "!", ".", ",") so "Whats the status ?"
 * matches the same as "whats the status" — every exact/direct-match list in
 * this file is compared against the normalized form. */
function stripTrailingPunctuation(value: string): string {
  return value.replace(/[?!.,]+$/, "").trim();
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
const GREETING_WORDS = [
  "hi",
  "hello",
  "hey",
  "hiya",
  "yo",
  "sup",
  "wassup",
  "whatsup",
  "howdy",
  "heyy",
  "hii",
  "hiii",
];
// Small talk isn't a greeting-word exact match ("how are you?" isn't "hi"),
// but it's the same "no real request yet" case — deserves a warm, direct
// reply of its own rather than falling through to the AI path (and its
// generic fallback if that call happens to fail). An exact-phrase list can
// never keep up with every casual contraction ("hows you", "you good?",
// "how u doin"), so this matches on the *shape* of a wellbeing check
// instead of specific wording — any "how" ... "you"/"u" combination, or
// "you"/"u" followed by a wellness word, plus the handful of set phrases
// (time-of-day greetings) that pattern wouldn't catch.
const SMALL_TALK_PHRASES = [
  "good morning",
  "good afternoon",
  "good evening",
  "good night",
  "hru",
  "hbu",
];

function isSmallTalk(bodyLower: string): boolean {
  const normalized = stripTrailingPunctuation(bodyLower);
  if (
    SMALL_TALK_PHRASES.some(
      (phrase) => normalized === phrase || normalized.includes(phrase),
    )
  ) {
    return true;
  }

  // "how are you", "hows you", "how's u doing", "how u doin" — "how"
  // anywhere before "you"/"u".
  if (/\bhow'?s?\b[\s\S]*\b(you|u)\b/.test(normalized)) return true;

  // "you good", "u ok", "you alright", "you doing well" — "you"/"u" near a
  // wellness word (order-independent, short phrases only).
  if (
    /\b(you|u)\b[\s\S]{0,15}\b(good|well|okay|ok|alright|fine|doing)\b/.test(
      normalized,
    ) ||
    /\b(good|well|okay|ok|alright|fine|doing)\b[\s\S]{0,15}\b(you|u)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  return false;
}
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

/** Exact-list matching above misses anything phrased slightly differently
 * ("report a issue" — wrong article, "report now", "got a new problem") —
 * this catches those. Only ever checked with no session already in
 * progress (see tenantFlow), so loosely matching on the bare verb "report"
 * can't accidentally hijack an active flow step. */
function isReportTrigger(bodyLower: string): boolean {
  const normalized = stripTrailingPunctuation(bodyLower);
  if (REPORT_TRIGGER_WORDS.includes(normalized)) return true;
  return (
    /\breport(ing)?\b/.test(normalized) ||
    /\bnew\b[\s\S]*\b(issue|problem|request)\b/.test(normalized)
  );
}

const YES_WORDS = ["yes", "y", "yeah", "yep", "yup", "sure", "go ahead", "confirm", "correct", "submit", "ok", "okay"];
const NO_WORDS = ["no", "n", "nope", "nah", "cancel", "stop"];

export async function handleIncomingWhatsapp(
  rawFrom: string,
  rawBody: string,
  /** Meta media id when the inbound message was a photo — used for the
   * worker's "photo of the finished work" completion step. */
  imageId?: string,
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
    return workerFlow(user.id, phone, body, bodyLower, imageId);
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

  if (isSmallTalk(bodyLower)) {
    return "Doing well, thanks for asking! I can help you report a maintenance issue or check on an existing one — what do you need?";
  }

  if (GREETING_WORDS.includes(stripTrailingPunctuation(bodyLower))) {
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
      "\n\nJust send the number, or tell me what's wrong and I'll figure it out. And you can ask me how things are going with an existing request any time."
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
      "Sorry, I'm not quite sure what you need — are you looking to report a new issue, or check on one you've already sent in?"
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

  // "no"/"cancel" only means "don't submit" at the confirm step (handled in
  // its own case below, since a NO there resumes nothing) — everywhere
  // earlier in the flow (category/location/description), the same words
  // mean "abandon this entirely", and previously weren't recognized at all,
  // leaving the retry prompt looping forever on "dismiss it"/"never mind".
  if (
    session.step !== "confirm" &&
    NO_WORDS.includes(stripTrailingPunctuation(bodyLower))
  ) {
    await clearSession(phone);
    return "No problem, all cancelled. Just let me know whenever you want to start again.";
  }

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
        "Does that look right? Just let me know and I'll send it in — or say so if you'd rather cancel."
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
        return "No problem, all cancelled. Just let me know whenever you want to start again.";
      }

      return "Just need a yes or no — should I go ahead and submit this?";
    }

    default:
      await clearSession(phone);
      return "Sorry, I lost my place there — just tell me what you need and we'll start fresh.";
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
    return "You're all clear — nothing open right now. Just tell me if something comes up.";
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
  "started",
  "start",
  "begun",
  "beginning",
  "on it",
  "working on it",
  "im here",
  "i'm here",
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
// Applies across pending/en_route/in_progress alike — a worker can hit a
// blocker at any stage of a job, not just one specific status.
const HOLD_WORDS = [
  "hold",
  "put on hold",
  "pause",
  "paused",
  "cant do this",
  "can't do this",
  "cant continue",
  "can't continue",
  "need to pause",
  "im blocked",
  "i'm blocked",
  "blocked",
  "stuck",
  "need help with this",
];
const SKIP_WORDS = [
  "no",
  "none",
  "skip",
  "nah",
  "n/a",
  "na",
  "nothing",
  "not really",
  "no notes",
  "nope",
];
// "I'm done adding photos" — deliberately its own list rather than reusing
// DONE_WORDS, since a couple of DONE_WORDS entries ("1", "complete") read
// oddly as an answer to "any more photos?" specifically.
const PHOTO_DONE_WORDS = [
  "done",
  "that's all",
  "thats all",
  "no more",
  "finished",
  "that's it",
  "thats it",
  "all set",
  "ok done",
  "no more photos",
];

async function workerFlow(
  workerId: string,
  phone: string,
  body: string,
  bodyLower: string,
  imageId?: string,
): Promise<string> {
  if (bodyLower === "tasks" || bodyLower === "status" || MENU_WORDS.includes(bodyLower)) {
    return listWorkerTasks(workerId, phone);
  }

  const session = await getSession(phone);

  if (session?.flow === WhatsappFlow.awaiting_completion_code && session.taskId) {
    return handleCompletionStep(workerId, phone, session, body, bodyLower, imageId);
  }

  if (
    session?.flow === WhatsappFlow.worker_task &&
    session.step === "awaiting_hold_reason" &&
    session.taskId
  ) {
    return handleHoldReason(workerId, phone, session.taskId, body);
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
      return "Just let me know once you're heading over.";
    case RequestStatus.en_route:
      return "Let me know once you've arrived and gotten started.";
    case RequestStatus.in_progress:
      return "Let me know once it's done and I'll grab the completion code from the tenant.";
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
    return "Looks like that job's moved on without you — just ask and I'll show you what's actually on your plate.";
  }

  // The session only ever tracks one "active" job (whichever was touched
  // most recently), so a worker juggling several open jobs has no way to
  // act on a different one just by naming it — "start the sewerage issue"
  // while "Electrical" is the tracked job silently got evaluated against
  // Electrical and ignored. If the message clearly names a *different* job
  // they're also assigned, switch to that one first.
  if (task.status !== RequestStatus.on_hold) {
    const otherActiveJobs = await prisma.maintenanceRequest.findMany({
      where: {
        assignedToId: workerId,
        id: { not: taskId },
        status: {
          in: [RequestStatus.pending, RequestStatus.en_route, RequestStatus.in_progress],
        },
      },
      select: { id: true, title: true },
    });

    const mentioned = otherActiveJobs.find((job) =>
      bodyLower.includes(job.title.toLowerCase()),
    );

    if (mentioned) {
      await setSession(phone, { taskId: mentioned.id });
      return handleWorkerTaskReply(workerId, phone, mentioned.id, bodyLower);
    }
  }

  // Checked before any status-specific transition — a worker can hit a
  // blocker at any stage (heading over, on site, mid-repair), not just one.
  if (
    task.status !== RequestStatus.completed &&
    HOLD_WORDS.some(
      (w) => bodyLower === w || new RegExp(`\\b${escapeRegExp(w)}\\b`).test(bodyLower),
    )
  ) {
    await setSession(phone, {
      flow: WhatsappFlow.worker_task,
      step: "awaiting_hold_reason",
      data: null,
      taskId,
    });
    return `What's blocking you on "${task.title}"? Give me a quick reason and I'll flag it for the admin to review.`;
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

      await notifyTenantCompletionCode({
        taskId,
        taskTitle: task.title,
        tenantId: task.userId,
        code,
      });
    }

    await setSession(phone, {
      flow: WhatsappFlow.awaiting_completion_code,
      step: "notes",
      data: {},
      taskId,
    });

    await publish({ kind: "request", roles: [UserType.admin], userIds: [task.userId, workerId] });
    revalidatePath("/protected/tasks");

    return `Nice work! Anything worth noting about "${task.title}" before we wrap up? Just tell me, or say "no" if there's nothing to add.`;
  }

  // A code can already be sitting on the job (they said "done" earlier in a
  // different session, or the tenant says they never got it) without the
  // current session actually being in the code-collection state — this
  // lets them re-trigger delivery, or catch up into that state, either way.
  const RESEND_CODE_PHRASES = [
    "send code",
    "send the code",
    "resend code",
    "resend the code",
    "send code to tenant",
    "give me the code",
    "what's the code",
    "whats the code",
    "share the code",
    "code again",
  ];
  if (RESEND_CODE_PHRASES.some((p) => bodyLower.includes(p))) {
    if (!task.completionCode) {
      return `There's no code pending for "${task.title}" yet — say "done" once you've finished and I'll get one sent over to the tenant.`;
    }

    await notifyTenantCompletionCode({
      taskId,
      taskTitle: task.title,
      tenantId: task.userId,
      code: task.completionCode,
    });

    await setSession(phone, {
      flow: WhatsappFlow.awaiting_completion_code,
      step: "code",
      data: {},
      taskId,
    });

    return `Sent — the tenant should have the code for "${task.title}" now. Once they give it to you, send it here.`;
  }

  const fallback =
    `"${task.title}" is currently ${task.status.replace("_", " ")}.\n` +
    actionPromptFor(task.status);

  const generated = await generateFreeformReply({
    role: "worker",
    userMessage: bodyLower,
    context: `Job: "${task.title}". Current status: ${task.status.replace("_", " ")}.`,
    validCommands: actionPromptFor(task.status),
  });

  return generated ?? fallback;
}

/** Downloads a photo the worker just sent and attaches it to the job, the
 * same way a photo uploaded from the web dashboard's completion form would
 * be. Returns false (never throws) on any failure — a bad download or a
 * storage hiccup shouldn't derail the conversation, just that one photo. */
async function saveWhatsappPhoto(
  taskId: string,
  workerId: string,
  mediaId: string,
): Promise<boolean> {
  const media = await downloadWhatsappMedia(mediaId);
  if (!media) return false;

  try {
    const extension = media.mimeType.split("/")[1]?.split(";")[0] || "jpg";
    const file = new File([media.buffer], `whatsapp-photo.${extension}`, {
      type: media.mimeType,
    });

    const uploaded = await uploadAttachment(file, taskId);

    await prisma.maintenanceAttachment.create({
      data: {
        requestId: taskId,
        fileName: uploaded.fileName,
        filePath: uploaded.objectKey,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
        createdById: workerId,
      },
    });

    return true;
  } catch (error) {
    console.error("[whatsapp] Failed to save photo for task", taskId, error);
    return false;
  }
}

/** The worker put a job on hold and just gave the reason — mirrors
 * app/actions.ts's holdTaskAction (status → on_hold, admin review queue),
 * re-applied here directly since WhatsApp replies don't carry a web
 * session (see the file header comment for why). */
async function handleHoldReason(
  workerId: string,
  phone: string,
  taskId: string,
  body: string,
): Promise<string> {
  const reason = body.trim();

  if (!reason || SKIP_WORDS.includes(stripTrailingPunctuation(reason.toLowerCase()))) {
    return "I'll need an actual reason so the admin knows what's going on — what's blocking you?";
  }

  const task = await prisma.maintenanceRequest.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, userId: true, assignedToId: true, status: true },
  });

  const holdableStatuses: RequestStatus[] = [
    RequestStatus.pending,
    RequestStatus.en_route,
    RequestStatus.in_progress,
  ];

  if (!task || task.assignedToId !== workerId) {
    await clearSession(phone);
    return "Looks like that job's moved on without you — just ask and I'll show you what's actually on your plate.";
  }

  if (!holdableStatuses.includes(task.status)) {
    await setSession(phone, { flow: WhatsappFlow.worker_task, step: null, data: null, taskId });
    return task.status === RequestStatus.on_hold
      ? "That one's already on hold — I'll let you know once it's ready to pick back up."
      : "That job's already completed, so there's nothing to hold.";
  }

  await prisma.maintenanceRequest.update({
    where: { id: taskId },
    data: {
      status: RequestStatus.on_hold,
      holdReason: reason,
      heldAt: new Date(),
      heldFromStatus: task.status,
      resumeRequestedAt: null,
      completionCode: null,
      completionCodeAt: null,
      taskLogs: {
        create: {
          status: RequestStatus.on_hold,
          changedById: workerId,
          notes: `Put on hold via WhatsApp: ${reason}`,
        },
      },
    },
  });

  await clearSession(phone);

  await notifyRequestHeld({
    id: task.id,
    title: task.title,
    tenantId: task.userId,
    reason,
    actorId: workerId,
  });

  await publish({ kind: "request", roles: [UserType.admin], userIds: [task.userId, workerId] });

  revalidatePath("/protected/tasks");
  revalidatePath("/protected/maintenance");
  revalidatePath(`/protected/maintenance/${taskId}`);
  revalidatePath("/protected/requests");
  revalidatePath(`/protected/requests/${taskId}`);

  return `Got it — "${task.title}" is on hold and flagged for admin review. I'll let you know once it's ready to pick back up.`;
}

/** Everything after the worker says "done": optional notes, at least one
 * photo of the finished work, then the tenant's completion code — mirrors
 * the web dashboard's completion form (see components/task-card.tsx), just
 * spread across a few messages instead of one form. `session` carries which
 * of those steps they're on. */
async function handleCompletionStep(
  workerId: string,
  phone: string,
  session: { step: string | null; data: unknown; taskId: string | null },
  body: string,
  bodyLower: string,
  imageId?: string,
): Promise<string> {
  const taskId = session.taskId;

  if (!taskId) {
    await clearSession(phone);
    return "Looks like that job's moved on without you — just ask and I'll show you what's actually on your plate.";
  }

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
    return "Looks like that job's moved on without you — just ask and I'll show you what's actually on your plate.";
  }

  const normalized = stripTrailingPunctuation(bodyLower);

  // An escape hatch from anywhere in this sub-flow — previously only exact
  // code entry did anything at all here, so "cancel"/small talk/anything
  // else just silently got compared against the code and failed. Kept
  // deliberately narrow to unambiguous "abandon this" words: a bare "no" is
  // NOT one of these, since it's the legitimate answer to each step's own
  // question ("any notes?", "more photos?") and is handled per-step below —
  // treating it as a global cancel here caused those steps to bounce back
  // to the very start on every "no", looping the same question forever.
  const CANCEL_WORDS = [
    "cancel",
    "dismiss",
    "dismiss it",
    "nevermind",
    "never mind",
    "forget it",
    "quit",
    "exit",
    "stop",
  ];
  if (CANCEL_WORDS.includes(normalized)) {
    await setSession(phone, {
      flow: WhatsappFlow.worker_task,
      step: null,
      data: null,
      taskId,
    });
    return "No problem, backed out of that. Just let me know when you're ready to wrap this one up.";
  }

  if (
    HOLD_WORDS.some(
      (w) => normalized === w || new RegExp(`\\b${escapeRegExp(w)}\\b`).test(normalized),
    )
  ) {
    await setSession(phone, {
      flow: WhatsappFlow.worker_task,
      step: "awaiting_hold_reason",
      data: null,
      taskId,
    });
    return `What's blocking you on "${task.title}"? Give me a quick reason and I'll flag it for the admin to review.`;
  }

  if (isSmallTalk(bodyLower)) {
    return "Doing well, thanks for asking! Whenever you're ready, let's finish wrapping this job up.";
  }

  const data: Record<string, string> =
    (session.data as Record<string, string> | null) ?? {};
  const step = session.step ?? "notes";

  if (step === "notes") {
    if (SKIP_WORDS.includes(normalized)) {
      await setSession(phone, { step: "photo", data });
      return "No worries. Now send at least one photo of the finished work.";
    }

    await setSession(phone, { step: "photo", data: { ...data, notes: body } });
    return "Got it, noted. Now send at least one photo of the finished work.";
  }

  if (step === "photo") {
    if (imageId) {
      const saved = await saveWhatsappPhoto(taskId, workerId, imageId);
      const photoCount = (
        Number(data.photoCount ?? "0") + (saved ? 1 : 0)
      ).toString();
      await setSession(phone, { step: "photo", data: { ...data, photoCount } });
      return saved
        ? "Got that photo. Send another if you want, or just let me know once you're done."
        : "Hmm, that photo didn't come through — mind sending it again?";
    }

    const photoCount = Number(data.photoCount ?? "0");
    const saidDone =
      PHOTO_DONE_WORDS.some((w) => normalized === w || normalized.includes(w)) ||
      SKIP_WORDS.includes(normalized) ||
      NO_WORDS.includes(normalized);

    if (saidDone) {
      if (photoCount === 0) {
        return "I'll need at least one photo of the finished work before we wrap this up — go ahead and send one.";
      }
      await setSession(phone, { step: "code", data });
      return "Perfect. Now just grab the 4-digit code from the tenant and send it here.";
    }

    return "Send a photo of the finished work when you're ready — that's the last thing I need before the code.";
  }

  // step === "code"
  if (!task.completionCode) {
    await setSession(phone, {
      flow: WhatsappFlow.worker_task,
      step: null,
      data: null,
      taskId,
    });
    return "I don't have a code waiting for this one right now — just ask and we'll see where things stand.";
  }

  const code = body.trim();

  if (code !== task.completionCode) {
    return "That code doesn't match what I've got — worth double-checking with the tenant. Or just let me know if you want to back out of this.";
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
          notes: data.notes
            ? `${data.notes} (verified by tenant code, via WhatsApp)`
            : "Completed and verified by tenant code (via WhatsApp)",
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
