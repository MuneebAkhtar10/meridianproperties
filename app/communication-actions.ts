"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import {
  ABOUT_LABEL,
  COMMUNICATION_ABOUT,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
} from "@/lib/communication-options";
import { ensureCommunicationSchema } from "@/lib/communications";
import { parseDate } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { personDisplayName } from "@/lib/utils";
import { encodedRedirect } from "@/utils/utils";
import { UserType } from "@/lib/generated/prisma/client";

const PATH = "/protected/communications";

function isOneOf<T extends string>(value: string | undefined, allowed: readonly { value: T }[]): value is T {
  return Boolean(value && allowed.some((item) => item.value === value));
}

export async function createCommunicationAction(formData: FormData) {
  const admin = await requireRole(UserType.admin);

  try {
    await ensureCommunicationSchema();

    const channel = formData.get("channel")?.toString();
    const direction = formData.get("direction")?.toString();
    const aboutKind = formData.get("aboutKind")?.toString();
    const partyUserId = formData.get("partyUserId")?.toString() || null;
    const supplierId = formData.get("supplierId")?.toString() || null;
    const otherName = formData.get("otherName")?.toString().trim() || "";
    const subject = formData.get("subject")?.toString().trim() || "";
    const body = formData.get("body")?.toString().trim() || "";
    const when = parseDate(formData.get("occurredAt")?.toString() ?? "") ?? new Date();

    if (!isOneOf(channel, COMMUNICATION_CHANNELS)) {
      return encodedRedirect("error", PATH, "Choose a channel.");
    }
    if (!isOneOf(direction, COMMUNICATION_DIRECTIONS)) {
      return encodedRedirect("error", PATH, "Choose a direction.");
    }
    if (!isOneOf(aboutKind, COMMUNICATION_ABOUT)) {
      return encodedRedirect("error", PATH, "Choose who this was about.");
    }
    if (!subject) {
      return encodedRedirect("error", PATH, "Add a subject.");
    }
    if (!body) {
      return encodedRedirect("error", PATH, "Note what was said.");
    }

    let partyName = otherName;
    let partyPhone: string | null = null;
    let resolvedUserId: string | null = null;
    let resolvedSupplierId: string | null = null;

    if (aboutKind === "supplier") {
      if (!supplierId) {
        return encodedRedirect("error", PATH, "Choose a supplier.");
      }
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, companyName: true, phone: true },
      });
      if (!supplier) {
        return encodedRedirect("error", PATH, "That supplier was not found.");
      }
      resolvedSupplierId = supplier.id;
      partyName = supplier.companyName;
      partyPhone = supplier.phone;
    } else if (aboutKind === "other") {
      if (!partyName) {
        return encodedRedirect("error", PATH, "Enter who you spoke with.");
      }
    } else {
      if (!partyUserId) {
        return encodedRedirect(
          "error",
          PATH,
          `Choose ${ABOUT_LABEL[aboutKind].toLowerCase()}.`,
        );
      }
      const expectedType =
        aboutKind === "owner"
          ? UserType.owner
          : aboutKind === "tenant"
            ? UserType.user
            : UserType.worker;
      const person = await prisma.user.findUnique({
        where: { id: partyUserId },
        select: {
          id: true,
          userType: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      });
      if (!person || person.userType !== expectedType) {
        return encodedRedirect("error", PATH, "That person was not found.");
      }
      resolvedUserId = person.id;
      partyName = personDisplayName(person);
      partyPhone = person.phone;
    }

    await prisma.communicationLog.create({
      data: {
        id: randomUUID(),
        channel,
        direction,
        aboutKind,
        partyUserId: resolvedUserId,
        supplierId: resolvedSupplierId,
        partyName,
        partyPhone,
        subject,
        body,
        occurredAt: when,
        createdById: admin.id,
      },
    });

    revalidatePath(PATH);
    return encodedRedirect("success", PATH, "Conversation logged.");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return encodedRedirect("error", PATH, "Could not save that conversation.");
  }
}

export async function deleteCommunicationAction(formData: FormData) {
  await requireRole(UserType.admin);
  const id = formData.get("id")?.toString();
  if (!id) {
    return encodedRedirect("error", PATH, "Missing conversation.");
  }

  try {
    await ensureCommunicationSchema();
    await prisma.communicationLog.delete({ where: { id } });
    revalidatePath(PATH);
    return encodedRedirect("success", PATH, "Conversation removed.");
  } catch (error) {
    unstable_rethrow(error);
    return encodedRedirect("error", PATH, "Could not remove that conversation.");
  }
}
