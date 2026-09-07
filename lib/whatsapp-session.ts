import "server-only";

import { prisma } from "@/lib/prisma";
import { WhatsappFlow } from "@/lib/generated/prisma/client";

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
  data: {
    userId?: string | null;
    flow?: WhatsappFlow | null;
    step?: string | null;
    data?: Record<string, string> | null;
    taskId?: string | null;
  },
): Promise<void> {
  await prisma.whatsappSession.upsert({
    where: { phone },
    create: { phone, ...data },
    update: data,
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
