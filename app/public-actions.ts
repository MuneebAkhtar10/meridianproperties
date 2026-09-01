"use server";

/**
 * The public, logged-out maintenance report flow: a tenant scans one QR
 * code (see /protected/admin/qr-code), lands on /report-issue with no
 * session at all, and identifies themselves by phone number instead of
 * signing in. Every tenant has exactly one unit (see the `Unit.tenantId`
 * comment in prisma/schema.prisma), so a verified phone number is enough
 * to know who they are and which unit to file the request against —
 * nothing here ever trusts a property/unit choice made in the browser.
 */

import { revalidatePath } from "next/cache";

import { saveAttachments } from "@/app/actions";
import { notifyAdminsNewRequest } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { isValidPhone, sanitizePhoneInput } from "@/lib/phone";
import { Priority, RequestStatus, UserType } from "@/lib/generated/prisma/client";

const PRIORITIES = Object.values(Priority) as string[];

function parsePriority(value: string | undefined): Priority {
  return PRIORITIES.includes(value ?? "") ? (value as Priority) : Priority.medium;
}

/** One message for every failure mode (unknown phone, phone belongs to a
 * non-tenant, tenant has no unit) — never reveals which, so this can't be
 * used to probe which phone numbers are on file. */
const NOT_RECOGNIZED =
  "We couldn't verify this phone number against a tenant account. Please contact the admin.";

/**
 * Matches on digits-and-leading-"+" only, not the raw stored string — some
 * tenants (notably the seed data) have their phone saved with spaces
 * ("+968 9200 0001"), while the sanitized input from the phone field never
 * has any, so an exact `where: { phone }` match silently fails for them.
 */
async function findTenantUnit(rawPhone: string) {
  const phone = sanitizePhoneInput(rawPhone);

  const candidates = await prisma.user.findMany({
    where: { userType: UserType.user, phone: { not: null } },
    select: { id: true, email: true, phone: true },
  });

  const tenant = candidates.find(
    (candidate) => sanitizePhoneInput(candidate.phone ?? "") === phone,
  );

  if (!tenant) {
    return null;
  }

  const unit = await prisma.unit.findUnique({
    where: { tenantId: tenant.id },
    include: { property: { include: { propertyType: true } } },
  });

  if (!unit) {
    return null;
  }

  return { tenant, unit };
}

export type PhoneLookupResult =
  | {
      ok: true;
      propertyName: string;
      unitLabel: string;
      unitNoun: string;
      locationOptions: string[];
    }
  | { ok: false; message: string };

/**
 * Step 1 of the public form: confirms the phone number resolves to a real
 * tenant with a unit, and hands back just enough to render step 2 (which
 * location options and unit label to show) — never the tenant's identity.
 */
export async function lookupTenantUnitAction(
  formData: FormData,
): Promise<PhoneLookupResult> {
  const phone = formData.get("phone")?.toString().trim() ?? "";

  if (!phone || !isValidPhone(phone)) {
    return { ok: false, message: "Enter a valid phone number." };
  }

  const found = await findTenantUnit(phone);

  if (!found) {
    return { ok: false, message: NOT_RECOGNIZED };
  }

  const { unit } = found;
  const locationOptions =
    unit.property.propertyType.locationOptions.length > 0
      ? unit.property.propertyType.locationOptions
      : ["Other"];

  return {
    ok: true,
    propertyName: unit.property.name,
    unitLabel: unit.label,
    unitNoun: unit.property.propertyType.unitNounSingular.toLowerCase(),
    locationOptions,
  };
}

export type PublicReportResult = { ok: boolean; message: string };

/**
 * Step 2: re-verifies the phone number from scratch (the client can't be
 * trusted to have kept step 1's result honest) and files the request
 * against that tenant's own unit, exactly like the signed-in report flow.
 */
export async function reportIssuePublicAction(
  formData: FormData,
): Promise<PublicReportResult> {
  const phone = formData.get("phone")?.toString().trim() ?? "";
  const title = formData.get("title")?.toString().trim() ?? "";
  const location = formData.get("location")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  const priority = parsePriority(formData.get("priority")?.toString());
  const attachments = formData.getAll("attachments");

  if (!phone || !isValidPhone(phone)) {
    return { ok: false, message: "Enter a valid phone number." };
  }

  if (!title || !location || !description) {
    return { ok: false, message: "Please fill in all required fields." };
  }

  const found = await findTenantUnit(phone);

  if (!found) {
    return { ok: false, message: NOT_RECOGNIZED };
  }

  const { tenant, unit } = found;

  const request = await prisma.maintenanceRequest.create({
    data: {
      userId: tenant.id,
      unitId: unit.id,
      title,
      location,
      description,
      priority,
      status: RequestStatus.pending,
      taskLogs: {
        create: {
          status: RequestStatus.pending,
          changedById: tenant.id,
          notes: "Request created (submitted via QR code, logged out)",
        },
      },
    },
  });

  const uploadFailed = await saveAttachments(attachments, request.id, tenant.id);

  await notifyAdminsNewRequest({
    id: request.id,
    title: request.title,
    location: request.location,
    reportedBy: tenant.email,
  });

  await publish({
    kind: "request",
    roles: [UserType.admin],
    userIds: [tenant.id],
  });

  revalidatePath("/protected/requests");
  revalidatePath("/protected/maintenance");

  return {
    ok: true,
    message: uploadFailed
      ? "Your maintenance request has been submitted, but some photos failed to upload."
      : "Your maintenance request has been submitted. The admin will assign someone shortly.",
  };
}
