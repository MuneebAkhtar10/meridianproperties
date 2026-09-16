"use server";

import { revalidatePath } from "next/cache";

import { renderNotificationEmail, sendEmail } from "@/lib/email";
import { formatMoney } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { encodedRedirect } from "@/utils/utils";
import { UserType } from "@/lib/generated/prisma/client";

/**
 * Admin composes one subject/message and sends it, by real email, to every
 * distinct owner among the selected units — grouped so an owner with
 * several selected units gets ONE email listing all of them, not one email
 * per unit. Uses lib/email.ts directly (not the notifications.ts DB/bell/
 * WhatsApp wrapper): this is an admin-authored announcement, not a
 * system-triggered event, so it should go out as exactly the email typed
 * here, with none of the extra channels or side effects system
 * notifications carry.
 */
export const sendBulkServiceChargeEmailAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const unitIds = formData.getAll("unitIds").map(String).filter(Boolean);
  const subject = formData.get("subject")?.toString().trim();
  const message = formData.get("message")?.toString().trim();
  const includeDetails = formData.get("includeDetails") === "on";

  if (unitIds.length === 0) {
    return encodedRedirect(
      "error",
      "/protected/service-charge-ledger",
      "Select at least one unit first.",
    );
  }
  if (!subject || !message) {
    return encodedRedirect(
      "error",
      "/protected/service-charge-ledger",
      "Enter a subject and a message.",
    );
  }

  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds } },
    include: {
      property: {
        select: {
          name: true,
          propertyType: { select: { unitPrefix: true, hasFloors: true } },
        },
      },
      owner: { select: { id: true, email: true } },
    },
  });

  const ownerGroups = new Map<
    string,
    { email: string; units: typeof units }
  >();
  let skipped = 0;

  for (const unit of units) {
    if (!unit.owner) {
      skipped++;
      continue;
    }
    const group = ownerGroups.get(unit.owner.id);
    if (group) {
      group.units.push(unit);
    } else {
      ownerGroups.set(unit.owner.id, {
        email: unit.owner.email,
        units: [unit],
      });
    }
  }

  await Promise.allSettled(
    Array.from(ownerGroups.values()).map((group) => {
      const details = includeDetails
        ? group.units.map((unit) => ({
            label: `${unit.property.name} · ${formatUnitLabel(unit.property.propertyType, unit.label)}`,
            value: unit.serviceChargeAmount
              ? `${formatMoney(unit.serviceChargeAmount as never)} · balance ${formatMoney(unit.serviceChargeBalance as never)}`
              : "No service charge set",
          }))
        : undefined;

      return sendEmail({
        to: group.email,
        subject,
        html: renderNotificationEmail(
          subject,
          message,
          "/protected/properties",
          details,
        ),
      });
    }),
  );

  revalidatePath("/protected/service-charge-ledger");

  const ownerCount = ownerGroups.size;
  return encodedRedirect(
    "success",
    "/protected/service-charge-ledger",
    `Emailed ${ownerCount} owner${ownerCount === 1 ? "" : "s"} across ${units.length - skipped} unit${units.length - skipped === 1 ? "" : "s"}.` +
      (skipped > 0
        ? ` ${skipped} unit${skipped === 1 ? "" : "s"} skipped (no owner assigned).`
        : ""),
  );
};
