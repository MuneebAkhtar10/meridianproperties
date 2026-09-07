import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma, WhatsappFlow } from "@/lib/generated/prisma/client";

/**
 * Small shared helpers for reading/writing a WhatsApp conversation's state
 * (see prisma/schema.prisma's WhatsappSession model). Split out from
 * lib/whatsapp-bot.ts so lib/notifications.ts can update a worker's session
 * the moment they're assigned a task without an import cycle (notifications
 * → whatsapp-bot → notifications).
 */

export async function getWhatsappSession(phone: string) {
  return prisma.whatsappSession.findUnique({ where: { phone } });
}

export async function setWhatsappSession(
  phone: string,
  input: {
    userId?: string | null;
    flow?: WhatsappFlow | null;
    step?: string | null;
    data?: Record<string, string> | null;
    taskId?: string | null;
  },
): Promise<void> {
  // Uses the "unchecked" input variant explicitly (scalar userId/taskId
  // rather than nested `user: { connect }` relation objects) — otherwise
  // TS can't tell which of the checked/unchecked create-input halves this
  // plain object is meant to satisfy. The `data` JSON column also needs
  // Prisma's JsonNull sentinel to clear it; a plain `null` there means
  // "set the database column to SQL NULL" only via that sentinel, not the
  // TS value `null`.
  const values: Prisma.WhatsappSessionUncheckedCreateInput = {
    phone,
    userId: input.userId,
    flow: input.flow,
    step: input.step,
    taskId: input.taskId,
    data: input.data === null ? Prisma.JsonNull : input.data,
  };

  await prisma.whatsappSession.upsert({
    where: { phone },
    create: values,
    update: values,
  });
}

export async function clearWhatsappSession(phone: string): Promise<void> {
  await setWhatsappSession(phone, {
    flow: null,
    step: null,
    data: null,
    taskId: null,
  });
}

/** Called whenever a worker becomes (or stays) responsible for a task, so
 * their WhatsApp thread knows which job a bare "1" / "done" refers to. */
export async function syncWorkerWhatsappSession(
  workerId: string,
  taskId: string,
): Promise<void> {
  const worker = await prisma.user.findUnique({
    where: { id: workerId },
    select: { phone: true },
  });

  if (!worker?.phone) return;

  await setWhatsappSession(worker.phone, {
    userId: workerId,
    flow: WhatsappFlow.worker_task,
    step: null,
    data: null,
    taskId,
  });
}
