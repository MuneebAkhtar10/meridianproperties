"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { addMonths, differenceInCalendarDays, format } from "date-fns";

import {
  notifyPropertyApproved,
  notifyPropertyAssigned,
  notifyPropertyRejected,
  notifyPropertyServiceCharge,
  notifyServiceChargeDue,
  notifyServiceChargeOverdue,
  notifyServiceChargeReceived,
  notifyServiceChargeUpcoming,
  notifyTenantAssigned,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { publish } from "@/lib/realtime";
import { requireAnyRole, requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  storeEntityDocumentGroups,
  uploadedFiles,
} from "@/lib/entity-document-service";
import { OMAN_GOVERNORATES } from "@/lib/oman";
import { isValidPhone } from "@/lib/phone";
import { deleteAttachment, uploadEntityDocument } from "@/lib/storage";
import { encodedRedirect } from "@/utils/utils";
import {
  EntityDocumentCategory,
  FamilyRelationship,
  UserType,
  WorkerCategory,
} from "@/lib/generated/prisma/client";

const USER_TYPES = Object.values(UserType) as string[];

/** Allowed service-charge recurrence cycles, in months. */
const SERVICE_CHARGE_CYCLE_MONTHS = [1, 3, 6, 12] as const;

/** Parses & validates the three service-charge form fields together — either
 * all three are present or none are (a partial charge makes no sense). */
function parseServiceCharge(formData: FormData):
  | { ok: true; amount: number; cycleMonths: number; dueDate: Date }
  | { ok: false; error: string } {
  const amountRaw = formData.get("serviceChargeAmount")?.toString().trim();
  const cycleRaw = formData.get("serviceChargeCycleMonths")?.toString().trim();
  const dueDateRaw = formData.get("serviceChargeDueDate")?.toString().trim();

  if (!amountRaw || !cycleRaw || !dueDateRaw) {
    return {
      ok: false,
      error:
        "Service charge amount, cycle, and due date are required.",
    };
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Service charge amount must be a positive number." };
  }

  const cycleMonths = Number(cycleRaw);
  if (!SERVICE_CHARGE_CYCLE_MONTHS.includes(cycleMonths as (typeof SERVICE_CHARGE_CYCLE_MONTHS)[number])) {
    return { ok: false, error: "Select a valid service charge cycle." };
  }

  const dueDate = new Date(`${dueDateRaw}T00:00:00.000Z`);
  if (Number.isNaN(dueDate.getTime())) {
    return { ok: false, error: "Select a valid service charge due date." };
  }

  return { ok: true, amount, cycleMonths, dueDate };
}

/** Buildings, apartments and people only ever change from an admin's screen. */
function publishDirectoryChange(userIds: (string | null | undefined)[] = []) {
  return publish({
    kind: "directory",
    roles: [UserType.admin],
    userIds: userIds.filter((id): id is string => Boolean(id)),
  });
}

/* ── Properties (buildings) ────────────────────────────────────────────────── */

export const createPropertyAction = async (formData: FormData) => {
  const actor = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = actor.userType === UserType.owner;

  const name = formData.get("name")?.toString().trim();
  const propertyTypeId = formData.get("propertyTypeId")?.toString().trim();
  const address = formData.get("address")?.toString().trim();
  const governorate = formData.get("governorate")?.toString().trim() || null;
  const wilayat = formData.get("wilayat")?.toString().trim() || null;
  const area = formData.get("area")?.toString().trim() || null;
  const wayNumber = formData.get("wayNumber")?.toString().trim() || null;
  const buildingNumber =
    formData.get("buildingNumber")?.toString().trim() || null;
  const postalCode = formData.get("postalCode")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;
  // Only an admin can hand a property to an existing owner; an owner creating
  // their own property is always assigned to themselves.
  const ownerId = isOwner
    ? actor.id
    : formData.get("ownerId")?.toString().trim() || null;
  const titleDeedDocuments = uploadedFiles(formData, "titleDeedDocuments");
  const approvalDocuments = uploadedFiles(formData, "approvalDocuments");
  const otherDocuments = uploadedFiles(formData, "otherPropertyDocuments");

  if (!name || !address) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Name and address are required",
    );
  }

  if (!isOwner && !ownerId) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Select an owner for this property.",
    );
  }

  const propertyType = propertyTypeId
    ? await prisma.propertyType.findUnique({ where: { id: propertyTypeId } })
    : null;
  if (!propertyType) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Select a property type.",
    );
  }

  if (
    governorate &&
    !OMAN_GOVERNORATES.includes(
      governorate as (typeof OMAN_GOVERNORATES)[number],
    )
  ) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Select a valid Oman governorate.",
    );
  }

  const serviceCharge = parseServiceCharge(formData);
  if (!serviceCharge.ok) {
    return encodedRedirect("error", "/protected/properties", serviceCharge.error);
  }

  const property = await prisma.property.create({
    data: {
      name,
      propertyTypeId: propertyType.id,
      address,
      governorate,
      wilayat,
      area,
      wayNumber,
      buildingNumber,
      postalCode,
      notes,
      ownerId,
      // Admin-created properties are live immediately; an owner's submission
      // waits for an admin to approve it — see the "Pending properties"
      // section on the properties page.
      approved: !isOwner,
      serviceChargeAmount: serviceCharge.amount,
      serviceChargeCycleMonths: serviceCharge.cycleMonths,
      serviceChargeDueDate: serviceCharge.dueDate,
    },
  });

  // Admin picked an existing owner for this new property from the dropdown —
  // an owner assigning it to themselves already knows, so no alert needed.
  if (!isOwner && ownerId) {
    await notifyPropertyAssigned({
      ownerId,
      propertyId: property.id,
      propertyName: property.name,
    });
    await notifyPropertyServiceCharge({
      ownerId,
      propertyId: property.id,
      propertyName: property.name,
      amount: formatMoney(serviceCharge.amount),
      cycleMonths: serviceCharge.cycleMonths,
      dueDate: format(serviceCharge.dueDate, "d MMM yyyy"),
    });
  }

  let documentUploadError: string | null = null;
  try {
    await storeEntityDocumentGroups({
      target: { type: "property", id: property.id },
      uploadedById: actor.id,
      groups: [
        {
          category: EntityDocumentCategory.title_deed,
          files: titleDeedDocuments,
        },
        {
          category: EntityDocumentCategory.building_permit,
          files: approvalDocuments,
        },
        {
          category: EntityDocumentCategory.other,
          files: otherDocuments,
        },
      ],
    });
  } catch (error) {
    // `redirect()` reports itself by throwing. Without this, a redirect thrown
    // anywhere under here would be caught and shown to the admin as the error
    // "NEXT_REDIRECT" instead of navigating.
    unstable_rethrow(error);
    documentUploadError =
      error instanceof Error ? error.message : "Document upload failed.";
  }

  await publishDirectoryChange();

  revalidatePath("/protected/properties");

  return encodedRedirect(
    documentUploadError ? "error" : "success",
    `/protected/properties/${property.id}`,
    documentUploadError
      ? `"${name}" was created, but its documents could not be uploaded: ${documentUploadError}`
      : `"${name}" created with its property documents. Now add its units.`,
  );
};

export const updatePropertyAction = async (formData: FormData) => {
  // Admin-only — property owners have read-only access to everything
  // except creating a new property (see createPropertyAction above).
  await requireRole(UserType.admin);

  const id = formData.get("propertyId")?.toString();
  const name = formData.get("name")?.toString().trim();
  const propertyTypeId = formData.get("propertyTypeId")?.toString().trim();
  const address = formData.get("address")?.toString().trim();
  const governorate = formData.get("governorate")?.toString().trim() || null;
  const wilayat = formData.get("wilayat")?.toString().trim() || null;
  const area = formData.get("area")?.toString().trim() || null;
  const wayNumber = formData.get("wayNumber")?.toString().trim() || null;
  const buildingNumber =
    formData.get("buildingNumber")?.toString().trim() || null;
  const postalCode = formData.get("postalCode")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;
  // Only an admin may reassign a property's owner from this form.
  const ownerId = formData.get("ownerId")?.toString().trim() || null;

  if (!id || !name || !address) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Name and address are required",
    );
  }

  const propertyType = propertyTypeId
    ? await prisma.propertyType.findUnique({ where: { id: propertyTypeId } })
    : null;
  if (!propertyType) {
    return encodedRedirect(
      "error",
      `/protected/properties/${id}`,
      "Select a property type.",
    );
  }

  if (
    governorate &&
    !OMAN_GOVERNORATES.includes(
      governorate as (typeof OMAN_GOVERNORATES)[number],
    )
  ) {
    return encodedRedirect(
      "error",
      `/protected/properties/${id}`,
      "Select a valid Oman governorate.",
    );
  }

  const serviceCharge = parseServiceCharge(formData);
  if (!serviceCharge.ok) {
    return encodedRedirect("error", `/protected/properties/${id}`, serviceCharge.error);
  }

  // Fetch the prior owner first to tell whether this update is actually a
  // (re)assignment worth notifying about.
  const previousOwnerId =
    (
      await prisma.property.findUnique({
        where: { id },
        select: { ownerId: true },
      })
    )?.ownerId ?? null;

  await prisma.property.update({
    where: { id },
    data: {
      name,
      propertyTypeId: propertyType.id,
      address,
      governorate,
      wilayat,
      area,
      wayNumber,
      buildingNumber,
      postalCode,
      notes,
      ownerId,
      serviceChargeAmount: serviceCharge.amount,
      serviceChargeCycleMonths: serviceCharge.cycleMonths,
      serviceChargeDueDate: serviceCharge.dueDate,
      // Editing the charge (amount/cycle/date) starts a fresh reminder cycle.
      serviceChargeLastStage: null,
    },
  });

  if (ownerId && ownerId !== previousOwnerId) {
    await notifyPropertyAssigned({
      ownerId,
      propertyId: id,
      propertyName: name,
    });
    await notifyPropertyServiceCharge({
      ownerId,
      propertyId: id,
      propertyName: name,
      amount: formatMoney(serviceCharge.amount),
      cycleMonths: serviceCharge.cycleMonths,
      dueDate: format(serviceCharge.dueDate, "d MMM yyyy"),
    });
  }

  await publishDirectoryChange();

  revalidatePath(`/protected/properties/${id}`);
  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    `/protected/properties/${id}`,
    "Property updated.",
  );
};

export const deletePropertyAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const id = formData.get("propertyId")?.toString();

  if (!id) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Invalid property",
    );
  }

  // Deleting a building takes its apartments with it, so refuse while anyone still
  // lives there rather than silently detaching tenants.
  const occupied = await prisma.unit.count({
    where: { propertyId: id, tenantId: { not: null } },
  });

  if (occupied > 0) {
    return encodedRedirect(
      "error",
      `/protected/properties/${id}`,
      `Cannot delete: ${occupied} unit(s) still have tenants. Unassign them first.`,
    );
  }

  const tenancyHistory = await prisma.tenancy.count({
    where: { unit: { propertyId: id } },
  });

  if (tenancyHistory > 0) {
    return encodedRedirect(
      "error",
      `/protected/properties/${id}`,
      "Cannot delete a property with tenancy or financial history.",
    );
  }

  const documents = await prisma.entityDocument.findMany({
    where: { propertyId: id },
    select: { filePath: true },
  });
  await prisma.property.delete({ where: { id } });
  await Promise.allSettled(
    documents.map((document) => deleteAttachment(document.filePath)),
  );

  await publishDirectoryChange();

  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    "/protected/properties",
    "Property deleted.",
  );
};

/**
 * Admin approves an owner-submitted property, making it live everywhere.
 */
export const approvePropertyAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const id = formData.get("propertyId")?.toString();
  if (!id) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Invalid property",
    );
  }

  const property = await prisma.property.update({
    where: { id },
    data: { approved: true },
    select: {
      name: true,
      ownerId: true,
      serviceChargeAmount: true,
      serviceChargeCycleMonths: true,
      serviceChargeDueDate: true,
    },
  });

  if (property.ownerId) {
    const hasServiceCharge =
      property.serviceChargeAmount &&
      property.serviceChargeCycleMonths &&
      property.serviceChargeDueDate;

    await notifyPropertyApproved({
      ownerId: property.ownerId,
      propertyId: id,
      propertyName: property.name,
    });

    if (hasServiceCharge) {
      await notifyPropertyServiceCharge({
        ownerId: property.ownerId,
        propertyId: id,
        propertyName: property.name,
        amount: formatMoney(property.serviceChargeAmount!),
        cycleMonths: property.serviceChargeCycleMonths!,
        dueDate: format(property.serviceChargeDueDate!, "d MMM yyyy"),
      });
    }
  }

  await publishDirectoryChange();

  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    "/protected/properties",
    "Property approved.",
  );
};

/**
 * Admin rejects a pending owner-submitted property. Rejection deletes the row
 * outright (documented choice — a rejected property has no units, tenants or
 * financial history yet, so there is nothing worth keeping an "unapproved,
 * rejected" record of; the owner can just resubmit it).
 */
export const rejectPropertyAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const id = formData.get("propertyId")?.toString();
  if (!id) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Invalid property",
    );
  }

  const property = await prisma.property.findUnique({
    where: { id },
    select: { approved: true, name: true, ownerId: true },
  });

  if (!property || property.approved) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Only a pending property can be rejected.",
    );
  }

  const documents = await prisma.entityDocument.findMany({
    where: { propertyId: id },
    select: { filePath: true },
  });
  await prisma.property.delete({ where: { id } });
  await Promise.allSettled(
    documents.map((document) => deleteAttachment(document.filePath)),
  );

  if (property.ownerId) {
    await notifyPropertyRejected({
      ownerId: property.ownerId,
      propertyName: property.name,
    });
  }

  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    "/protected/properties",
    "Property rejected and removed.",
  );
};

/**
 * Owner or admin confirms this cycle's service charge came in. There's no
 * ledger for it (reminder-only feature) — this just rolls the due date
 * forward by the property's cycle and notifies the owner + admins.
 */
/** Edits just the service charge (amount/cycle/due date) from its own card
 * on the property page, without needing the full property edit form below
 * it. Admin-only — an owner can view the charge but not change it. */
export const updateServiceChargeAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const id = formData.get("propertyId")?.toString();
  if (!id) {
    return encodedRedirect("error", "/protected/properties", "Invalid property");
  }

  const property = await prisma.property.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!property) {
    return encodedRedirect("error", "/protected/properties", "Property not found.");
  }

  const serviceCharge = parseServiceCharge(formData);
  if (!serviceCharge.ok) {
    return encodedRedirect(
      "error",
      `/protected/properties/${id}`,
      serviceCharge.error,
    );
  }

  await prisma.property.update({
    where: { id },
    data: {
      serviceChargeAmount: serviceCharge.amount,
      serviceChargeCycleMonths: serviceCharge.cycleMonths,
      serviceChargeDueDate: serviceCharge.dueDate,
      // Editing the charge starts a fresh reminder cycle, same as the full
      // property edit form does.
      serviceChargeLastStage: null,
    },
  });

  revalidatePath(`/protected/properties/${id}`);
  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    `/protected/properties/${id}`,
    "Service charge updated.",
  );
};

export const markServiceChargeReceivedAction = async (formData: FormData) => {
  // Admin-only — an owner can see the service charge on their property but
  // can't mark it received or resend its reminder themselves (see the
  // matching UI gate in app/protected/properties/[id]/page.tsx).
  const actor = await requireRole(UserType.admin);

  const id = formData.get("propertyId")?.toString();
  if (!id) {
    return encodedRedirect("error", "/protected/properties", "Invalid property");
  }

  const property = await prisma.property.findUnique({
    where: { id },
    select: {
      name: true,
      ownerId: true,
      serviceChargeAmount: true,
      serviceChargeCycleMonths: true,
      serviceChargeDueDate: true,
    },
  });

  if (!property) {
    return encodedRedirect("error", "/protected/properties", "Property not found.");
  }

  if (
    !property.serviceChargeAmount ||
    !property.serviceChargeCycleMonths ||
    !property.serviceChargeDueDate
  ) {
    return encodedRedirect(
      "error",
      `/protected/properties/${id}`,
      "This property has no service charge set up.",
    );
  }

  // Roll forward from the due date (not from today) so a cycle paid early or
  // late still lands on the intended recurring schedule.
  const nextDueDate = addMonths(
    property.serviceChargeDueDate,
    property.serviceChargeCycleMonths,
  );

  await prisma.property.update({
    where: { id },
    data: {
      serviceChargeDueDate: nextDueDate,
      serviceChargeLastStage: null,
      serviceChargeLastReceivedAt: new Date(),
    },
  });

  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin, id: { not: actor.id } },
    select: { id: true },
  });
  const recipientIds = Array.from(
    new Set(
      [property.ownerId, ...admins.map((admin) => admin.id)].filter(
        (recipientId): recipientId is string => Boolean(recipientId),
      ),
    ),
  );

  await notifyServiceChargeReceived({
    propertyId: id,
    propertyName: property.name,
    amount: `OMR ${Number(property.serviceChargeAmount).toFixed(3)}`,
    nextDueDate: format(nextDueDate, "d MMM yyyy"),
    recipientIds,
  });

  revalidatePath(`/protected/properties/${id}`);
  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    `/protected/properties/${id}`,
    "Service charge marked as received. Next due date updated.",
  );
};

/** Re-sends the service charge reminder for whatever stage it's actually
 * in right now (upcoming/due/overdue) — mirrors the daily cron's own logic
 * in lib/service-charge-reminders.ts rather than always sending the same
 * one, so the wording matches what the owner would already be expecting. */
export const resendServiceChargeReminderAction = async (formData: FormData) => {
  // Admin-only, same as markServiceChargeReceivedAction above.
  const actor = await requireRole(UserType.admin);

  const id = formData.get("propertyId")?.toString();
  if (!id) {
    return encodedRedirect("error", "/protected/properties", "Invalid property");
  }

  const property = await prisma.property.findUnique({
    where: { id },
    select: {
      name: true,
      ownerId: true,
      serviceChargeAmount: true,
      serviceChargeDueDate: true,
    },
  });

  if (!property) {
    return encodedRedirect("error", "/protected/properties", "Property not found.");
  }

  if (!property.serviceChargeAmount || !property.serviceChargeDueDate) {
    return encodedRedirect(
      "error",
      `/protected/properties/${id}`,
      "This property has no service charge set up.",
    );
  }

  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin, id: { not: actor.id } },
    select: { id: true },
  });
  const recipientIds = Array.from(
    new Set(
      [property.ownerId, ...admins.map((admin) => admin.id)].filter(
        (recipientId): recipientId is string => Boolean(recipientId),
      ),
    ),
  );

  const amount = `OMR ${Number(property.serviceChargeAmount).toFixed(3)}`;
  const daysUntilDue = differenceInCalendarDays(
    property.serviceChargeDueDate,
    new Date(),
  );

  if (daysUntilDue < 0) {
    await notifyServiceChargeOverdue({
      propertyId: id,
      propertyName: property.name,
      amount,
      daysOverdue: Math.abs(daysUntilDue),
      recipientIds,
    });
  } else if (daysUntilDue === 0) {
    await notifyServiceChargeDue({
      propertyId: id,
      propertyName: property.name,
      amount,
      recipientIds,
    });
  } else {
    await notifyServiceChargeUpcoming({
      propertyId: id,
      propertyName: property.name,
      amount,
      dueDate: format(property.serviceChargeDueDate, "d MMM yyyy"),
      recipientIds,
    });
  }

  return encodedRedirect(
    "success",
    `/protected/properties/${id}`,
    "Service charge reminder resent.",
  );
};

/* ── Property types (fully admin-configurable) ─────────────────────────────── */

function slugifyTypeName(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Parses the "one per line" location-options textarea into a clean list,
 * always ending with "Other" so there is a fallback in the report form. */
function parseLocationOptions(raw: string | undefined): string[] {
  const lines = (raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const withoutOther = lines.filter(
    (line) => line.toLowerCase() !== "other",
  );
  return [...withoutOther, "Other"];
}

export const createPropertyTypeAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const label = formData.get("label")?.toString().trim();
  const unitNounSingular = formData
    .get("unitNounSingular")
    ?.toString()
    .trim();
  const unitNounPlural = formData.get("unitNounPlural")?.toString().trim();
  const unitPrefix = formData.get("unitPrefix")?.toString().trim() || null;
  const hasFloors = formData.get("hasFloors") === "on";
  const hasBedrooms = formData.get("hasBedrooms") === "on";
  const locationOptions = parseLocationOptions(
    formData.get("locationOptions")?.toString(),
  );

  const back = "/protected/admin/property-types";

  if (!label || !unitNounSingular || !unitNounPlural) {
    return encodedRedirect(
      "error",
      back,
      "Label, singular and plural unit names are required.",
    );
  }

  const name = slugifyTypeName(label);
  if (!name) {
    return encodedRedirect("error", back, "Enter a valid label.");
  }

  const existing = await prisma.propertyType.findUnique({ where: { name } });
  if (existing) {
    return encodedRedirect(
      "error",
      back,
      `A property type named "${label}" already exists.`,
    );
  }

  await prisma.propertyType.create({
    data: {
      name,
      label,
      unitNounSingular,
      unitNounPlural,
      unitPrefix,
      hasFloors,
      hasBedrooms,
      locationOptions,
    },
  });

  revalidatePath(back);
  revalidatePath("/protected/properties");

  return encodedRedirect("success", back, `Property type "${label}" added.`);
};

export const updatePropertyTypeAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const id = formData.get("propertyTypeId")?.toString();
  const label = formData.get("label")?.toString().trim();
  const unitNounSingular = formData
    .get("unitNounSingular")
    ?.toString()
    .trim();
  const unitNounPlural = formData.get("unitNounPlural")?.toString().trim();
  const unitPrefix = formData.get("unitPrefix")?.toString().trim() || null;
  const hasFloors = formData.get("hasFloors") === "on";
  const hasBedrooms = formData.get("hasBedrooms") === "on";
  const locationOptions = parseLocationOptions(
    formData.get("locationOptions")?.toString(),
  );

  const back = "/protected/admin/property-types";

  if (!id || !label || !unitNounSingular || !unitNounPlural) {
    return encodedRedirect(
      "error",
      back,
      "Label, singular and plural unit names are required.",
    );
  }

  // `name` is a stable machine key derived from the label at creation time
  // (see createPropertyTypeAction) — it has to be re-derived on rename too,
  // or the old key stays permanently reserved and blocks anyone from later
  // creating a new type with the label this one used to have.
  const name = slugifyTypeName(label);
  if (!name) {
    return encodedRedirect("error", back, "Enter a valid label.");
  }

  const nameTaken = await prisma.propertyType.findFirst({
    where: { name, id: { not: id } },
  });
  if (nameTaken) {
    return encodedRedirect(
      "error",
      back,
      `A property type named "${label}" already exists.`,
    );
  }

  await prisma.propertyType.update({
    where: { id },
    data: {
      name,
      label,
      unitNounSingular,
      unitNounPlural,
      unitPrefix,
      hasFloors,
      hasBedrooms,
      locationOptions,
    },
  });

  revalidatePath(back);
  revalidatePath("/protected/properties");

  return encodedRedirect("success", back, `Property type "${label}" updated.`);
};

export const deletePropertyTypeAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const id = formData.get("propertyTypeId")?.toString();
  const back = "/protected/admin/property-types";

  if (!id) {
    return encodedRedirect("error", back, "Invalid property type.");
  }

  const inUse = await prisma.property.count({ where: { propertyTypeId: id } });
  if (inUse > 0) {
    return encodedRedirect(
      "error",
      back,
      `Cannot delete: ${inUse} propert${inUse === 1 ? "y" : "ies"} still use this type.`,
    );
  }

  await prisma.propertyType.delete({ where: { id } });

  revalidatePath(back);

  return encodedRedirect("success", back, "Property type deleted.");
};

/* ── Units (apartments) ────────────────────────────────────────────────────── */

/**
 * Bulk-creates apartments so nobody has to type fifty of them by hand.
 * Floors 1–10 with 5 per floor gives 101–105, 201–205 … 1001–1005.
 */
export const generateUnitsAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const propertyId = formData.get("propertyId")?.toString();
  const floors = Number(formData.get("floors"));
  const perFloor = Number(formData.get("perFloor"));
  const startFloor = Number(formData.get("startFloor") || 1);
  const bedrooms = formData.get("bedrooms")
    ? Number(formData.get("bedrooms"))
    : null;

  if (!propertyId) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Invalid property",
    );
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      propertyType: { select: { hasFloors: true, unitNounPlural: true } },
    },
  });

  if (property && !property.propertyType.hasFloors) {
    return encodedRedirect(
      "error",
      `/protected/properties/${propertyId}`,
      `${property.propertyType.unitNounPlural} don't have floors — add units one at a time instead.`,
    );
  }

  const unitNounPlural = property?.propertyType.unitNounPlural ?? "Units";
  const back = `/protected/properties/${propertyId}`;

  if (
    !Number.isInteger(floors) ||
    !Number.isInteger(perFloor) ||
    floors < 1 ||
    perFloor < 1 ||
    floors * perFloor > 500
  ) {
    return encodedRedirect(
      "error",
      back,
      `Enter valid floors and ${unitNounPlural.toLowerCase()} per floor (max 500 in total).`,
    );
  }

  const units = [];

  for (let floor = startFloor; floor < startFloor + floors; floor++) {
    for (let n = 1; n <= perFloor; n++) {
      units.push({
        propertyId,
        label: `${floor}${String(n).padStart(2, "0")}`,
        floor,
        bedrooms,
      });
    }
  }

  // Re-running with a bigger range just tops up the missing ones.
  const { count } = await prisma.unit.createMany({
    data: units,
    skipDuplicates: true,
  });

  await publishDirectoryChange();

  revalidatePath(back);

  return encodedRedirect(
    "success",
    back,
    count === 0
      ? `Those ${unitNounPlural.toLowerCase()} already exist.`
      : `${count} ${unitNounPlural.toLowerCase()}(s) added.`,
  );
};

export const createUnitAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const propertyId = formData.get("propertyId")?.toString();
  const label = formData.get("label")?.toString().trim();
  const floor = formData.get("floor") ? Number(formData.get("floor")) : null;
  const bedrooms = formData.get("bedrooms")
    ? Number(formData.get("bedrooms"))
    : null;

  if (!propertyId || !label) {
    return encodedRedirect(
      "error",
      `/protected/properties/${propertyId ?? ""}`,
      "Unit number is required",
    );
  }

  const back = `/protected/properties/${propertyId}`;

  const exists = await prisma.unit.findUnique({
    where: { propertyId_label: { propertyId, label } },
  });

  if (exists) {
    return encodedRedirect("error", back, `Unit ${label} already exists.`);
  }

  await prisma.unit.create({
    data: { propertyId, label, floor, bedrooms },
  });

  await publishDirectoryChange();

  revalidatePath(back);

  return encodedRedirect("success", back, `Unit ${label} added.`);
};

/** Edits a unit's number, floor and bedroom count in place. */
export const updateUnitAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  const label = formData.get("label")?.toString().trim();
  const floor = formData.get("floor")?.toString().trim();
  const bedrooms = formData.get("bedrooms")?.toString().trim();

  if (!unitId) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Invalid unit",
    );
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { propertyId: true, label: true },
  });

  if (!unit) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Unit not found",
    );
  }

  const back = `/protected/properties/${unit.propertyId}`;

  if (!label) {
    return encodedRedirect("error", back, "Unit number is required.");
  }

  const floorValue = floor ? Number(floor) : null;
  const bedroomsValue = bedrooms ? Number(bedrooms) : null;

  if (floor && (!Number.isInteger(floorValue) || floorValue === null)) {
    return encodedRedirect("error", back, "Floor must be a whole number.");
  }
  if (
    bedrooms &&
    (!Number.isInteger(bedroomsValue) || (bedroomsValue ?? 0) < 0)
  ) {
    return encodedRedirect(
      "error",
      back,
      "Bedrooms must be a non-negative whole number.",
    );
  }

  const clash = await prisma.unit.findUnique({
    where: { propertyId_label: { propertyId: unit.propertyId, label } },
    select: { id: true },
  });

  if (clash && clash.id !== unitId) {
    return encodedRedirect("error", back, `Unit ${label} already exists.`);
  }

  await prisma.unit.update({
    where: { id: unitId },
    data: { label, floor: floorValue, bedrooms: bedroomsValue },
  });

  await publishDirectoryChange();

  revalidatePath(back);

  return encodedRedirect("success", back, `Unit ${label} updated.`);
};

export const deleteUnitAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();

  if (!unitId) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Invalid unit",
    );
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { propertyId: true, label: true, tenantId: true },
  });

  if (!unit) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Unit not found",
    );
  }

  const back = `/protected/properties/${unit.propertyId}`;

  if (unit.tenantId) {
    return encodedRedirect(
      "error",
      back,
      `Unit ${unit.label} still has a tenant. Unassign them first.`,
    );
  }

  const tenancyHistory = await prisma.tenancy.count({ where: { unitId } });
  if (tenancyHistory > 0) {
    return encodedRedirect(
      "error",
      back,
      `Unit ${unit.label} has tenancy or financial history and cannot be deleted.`,
    );
  }

  await prisma.unit.delete({ where: { id: unitId } });

  await publishDirectoryChange();

  revalidatePath(back);

  return encodedRedirect("success", back, `Unit ${unit.label} deleted.`);
};

/** Assigns a tenant to a unit, or clears it when no tenant is picked. */
export const assignTenantAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  const tenantId = formData.get("tenantId")?.toString() || null;

  if (!unitId) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Invalid unit",
    );
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      propertyId: true,
      label: true,
      tenantId: true,
      property: {
        select: {
          name: true,
          ownerId: true,
          propertyType: { select: { unitPrefix: true, hasFloors: true } },
        },
      },
    },
  });

  if (!unit) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Unit not found",
    );
  }

  const back = `/protected/properties/${unit.propertyId}`;
  const isNewAssignment = Boolean(tenantId) && tenantId !== unit.tenantId;

  if (tenantId !== unit.tenantId) {
    const today = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );

    await prisma.$transaction(async (tx) => {
      // Close both sides of any move before changing the fast current-occupant
      // pointer. Historical charges remain attached to the old tenancy.
      if (unit.tenantId) {
        await tx.tenancy.updateMany({
          where: { unitId, tenantId: unit.tenantId, endDate: null },
          data: { endDate: today },
        });
      }

      if (tenantId) {
        await tx.tenancy.updateMany({
          where: { tenantId, endDate: null },
          data: { endDate: today },
        });
        await tx.unit.updateMany({
          where: { tenantId },
          data: { tenantId: null },
        });
      }

      await tx.unit.update({ where: { id: unitId }, data: { tenantId } });

      // The compact property table cannot collect commercial terms. Create a
      // zero-rent record so the assignment is still auditable, then surface it
      // on Tenancies for the admin to complete.
      if (tenantId) {
        await tx.tenancy.create({
          data: {
            unitId,
            tenantId,
            startDate: today,
            monthlyRent: 0,
            rentDueDay: 5,
            securityDeposit: 0,
            notes:
              "Created from the quick unit assignment; complete the terms in Tenancies.",
          },
        });
      }
    });
  }

  // Not a rich lease-terms email like startTenancyAction's — this quick
  // assignment has none yet (zero-rent placeholder, see above) — but the
  // tenant and owner still deserve to know a move-in happened at all,
  // which previously sent nothing.
  if (isNewAssignment && tenantId) {
    try {
      await notifyTenantAssigned({
        tenantId,
        propertyName: unit.property.name,
        unitLabel: formatUnitLabel(unit.property.propertyType, unit.label),
        moveInDate: format(new Date(), "d MMMM yyyy"),
        monthlyRent: formatMoney(0),
        rentDueDay: 5,
        ownerId: unit.property.ownerId,
      });
    } catch (error) {
      console.error("Tenant-assigned notification failed:", error);
    }
  }

  // Whoever just moved in, and whoever just lost the apartment, both have a
  // dashboard built around it.
  await publishDirectoryChange([tenantId, unit.tenantId]);

  revalidatePath(back);
  revalidatePath("/protected/users");
  revalidatePath("/protected/tenancies");
  revalidatePath("/protected/finances");

  return encodedRedirect(
    "success",
    back,
    tenantId
      ? `Tenant assigned to unit ${unit.label}.`
      : `Unit ${unit.label} is now empty.`,
  );
};

/* ── People ────────────────────────────────────────────────────────────────── */

export const createUserAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();
  const userType = formData.get("userType")?.toString();
  const workerCategoryRaw = formData.get("workerCategory")?.toString();
  const workerCategory =
    userType === UserType.worker
      ? workerCategoryRaw === "third_party"
        ? "third_party"
        : "in_house"
      : null;
  const companyName =
    userType === UserType.worker && workerCategory === "third_party"
      ? formData.get("companyName")?.toString().trim() || null
      : null;
  const firstName = formData.get("firstName")?.toString().trim() || null;
  const lastName = formData.get("lastName")?.toString().trim() || null;
  const phone = formData.get("phone")?.toString().trim() || null;
  const civilId = formData.get("civilId")?.toString().trim() || null;
  const nationality = formData.get("nationality")?.toString().trim() || null;
  const employer = formData.get("employer")?.toString().trim() || null;
  const emergencyContactName =
    formData.get("emergencyContactName")?.toString().trim() || null;
  const emergencyContactPhone =
    formData.get("emergencyContactPhone")?.toString().trim() || null;
  const unitId = formData.get("unitId")?.toString() || null;

  if (!email || !password || !userType) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Email, password and role are required",
    );
  }

  if (!phone) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Phone number is required.",
    );
  }

  if (phone && !isValidPhone(phone)) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Phone must contain only digits, with an optional leading +, up to 13 characters.",
    );
  }

  if (emergencyContactPhone && !isValidPhone(emergencyContactPhone)) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Emergency phone must contain only digits, with an optional leading +, up to 13 characters.",
    );
  }

  if (password.length < 6) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Password must be at least 6 characters",
    );
  }

  if (!USER_TYPES.includes(userType)) {
    return encodedRedirect("error", "/protected/users", "Invalid role");
  }

  // Email only has to be unique per role — a tenant and a worker (etc.) can
  // share an email, but two accounts of the same role can't.
  if (
    await prisma.user.findUnique({
      where: { email_userType: { email, userType: userType as UserType } },
    })
  ) {
    return encodedRedirect(
      "error",
      "/protected/users",
      `That email is already registered as a ${userType}.`,
    );
  }

  if (civilId && (await prisma.user.findUnique({ where: { civilId } }))) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "That Civil ID / Resident Card number is already recorded.",
    );
  }

  if (phone && (await prisma.user.findUnique({ where: { phone } }))) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "That phone number is already registered to another account.",
    );
  }

  const { data: authUser, error: authError } =
    await createAdminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !authUser.user) {
    return encodedRedirect(
      "error",
      "/protected/users",
      authError?.message ?? "Could not create the account",
    );
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        id: authUser.user.id,
        email,
        userType: userType as UserType,
        workerCategory: workerCategory as WorkerCategory | null,
        companyName,
        firstName,
        lastName,
        phone,
        civilId,
        nationality,
        employer,
        emergencyContactName,
        emergencyContactPhone,
        ...(userType === UserType.worker && workerCategory === "in_house"
          ? parseHrFields(formData)
          : {}),
      },
    });
  } catch (error) {
    // The profile row failed after the auth account was created — remove it
    // rather than leave a login with no profile behind it.
    await createAdminClient().auth.admin.deleteUser(authUser.user.id);
    throw error;
  }

  // Only tenants live in an apartment.
  if (unitId && userType === UserType.user) {
    const today = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    await prisma.$transaction([
      prisma.unit.update({
        where: { id: unitId },
        data: { tenantId: user.id },
      }),
      prisma.tenancy.create({
        data: {
          unitId,
          tenantId: user.id,
          startDate: today,
          monthlyRent: 0,
          rentDueDay: 5,
          securityDeposit: 0,
          notes:
            "Created with the tenant account; complete the terms in Tenancies.",
        },
      }),
    ]);
  }

  await publishDirectoryChange([user.id]);

  revalidatePath("/protected/users");
  revalidatePath("/protected/properties");
  revalidatePath("/protected/tenancies");

  return encodedRedirect(
    "success",
    "/protected/users",
    `${email} created as ${userType}.`,
  );
};

export const resetUserPasswordAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const userId = formData.get("userId")?.toString();
  const password = formData.get("password")?.toString();

  if (!userId || !password) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Person and temporary password are required.",
    );
  }

  if (password.length < 6) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Temporary password must be at least 6 characters.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, userType: true },
  });

  if (!user) {
    return encodedRedirect("error", "/protected/users", "Person not found.");
  }

  if (user.userType === UserType.admin) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Admin passwords must be changed from their own account.",
    );
  }

  const { error } = await createAdminClient().auth.admin.updateUserById(
    userId,
    { password },
  );

  if (error) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Could not set the temporary password.",
    );
  }

  revalidatePath("/protected/users");

  return encodedRedirect(
    "success",
    "/protected/users",
    `Temporary password set for ${user.email}. Share it securely with them.`,
  );
};

export const updateUserTypeAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const userId = formData.get("userId")?.toString();
  const userType = formData.get("userType")?.toString();
  const workerCategoryRaw = formData.get("workerCategory")?.toString();
  const companyNameRaw = formData.get("companyName")?.toString().trim();

  if (!userId || !userType) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Missing required information",
    );
  }

  if (userId === admin.id) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "You cannot change your own role",
    );
  }

  if (!USER_TYPES.includes(userType)) {
    return encodedRedirect("error", "/protected/users", "Invalid role");
  }

  const workerCategory =
    userType === UserType.worker
      ? workerCategoryRaw === "third_party"
        ? "third_party"
        : "in_house"
      : null;
  const companyName =
    userType === UserType.worker && workerCategory === "third_party"
      ? companyNameRaw || null
      : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      userType: userType as UserType,
      workerCategory: workerCategory as WorkerCategory | null,
      companyName,
    },
  });

  // Someone who is no longer a tenant should not still hold an apartment.
  if (userType !== UserType.user) {
    const today = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    await prisma.$transaction([
      prisma.unit.updateMany({
        where: { tenantId: userId },
        data: { tenantId: null },
      }),
      prisma.tenancy.updateMany({
        where: { tenantId: userId, endDate: null },
        data: { endDate: today },
      }),
    ]);
  }

  // Their role decides which dashboard they get, so they need to hear this too.
  await publishDirectoryChange([userId]);

  revalidatePath("/protected/users");
  revalidatePath("/protected/properties");
  revalidatePath("/protected/tenancies");
  revalidatePath("/protected/finances");

  return encodedRedirect(
    "success",
    "/protected/users",
    `Role updated to ${userType}.`,
  );
};

export const updateUserProfileAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const userId = formData.get("userId")?.toString();
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const firstName = formData.get("firstName")?.toString().trim() || null;
  const lastName = formData.get("lastName")?.toString().trim() || null;
  const phone = formData.get("phone")?.toString().trim() || null;
  const civilId = formData.get("civilId")?.toString().trim() || null;
  const nationality = formData.get("nationality")?.toString().trim() || null;
  const employer = formData.get("employer")?.toString().trim() || null;
  const emergencyContactName =
    formData.get("emergencyContactName")?.toString().trim() || null;
  const emergencyContactPhone =
    formData.get("emergencyContactPhone")?.toString().trim() || null;

  if (!userId) {
    return encodedRedirect("error", "/protected/users", "Invalid person.");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { userType: true, email: true },
  });
  if (!target) {
    return encodedRedirect("error", "/protected/users", "Invalid person.");
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Enter a valid email address.",
    );
  }

  // Email is unique per role (@@unique([email, userType])) — a tenant and a
  // worker can share an email, but not two of the same role.
  if (
    await prisma.user.findFirst({
      where: { email, userType: target.userType, id: { not: userId } },
      select: { id: true },
    })
  ) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "That email is already used by another account with the same role.",
    );
  }

  if (!phone) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Phone number is required.",
    );
  }

  if (phone && !isValidPhone(phone)) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Phone must contain only digits, with an optional leading +, up to 13 characters.",
    );
  }

  if (emergencyContactPhone && !isValidPhone(emergencyContactPhone)) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Emergency phone must contain only digits, with an optional leading +, up to 13 characters.",
    );
  }

  if (
    civilId &&
    (await prisma.user.findFirst({
      where: { civilId, id: { not: userId } },
      select: { id: true },
    }))
  ) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "That Civil ID / Resident Card number is already recorded.",
    );
  }

  if (
    phone &&
    (await prisma.user.findFirst({
      where: { phone, id: { not: userId } },
      select: { id: true },
    }))
  ) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "That phone number is already registered to another account.",
    );
  }

  // Login is via Supabase Auth, keyed by email — changing the profile's
  // email without updating the auth record too would let this person keep
  // signing in with the old address while the app shows a different one
  // everywhere, or lock them out entirely. Sync auth first: if it fails
  // (e.g. another Supabase Auth user already has this email), the profile
  // update below never runs, so the two can't drift apart.
  if (email !== target.email) {
    const { error: authError } =
      await createAdminClient().auth.admin.updateUserById(userId, { email });

    if (authError) {
      return encodedRedirect(
        "error",
        "/protected/users",
        "Could not update the login email — it may already be in use.",
      );
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      email,
      firstName,
      lastName,
      phone,
      civilId,
      nationality,
      employer,
      emergencyContactName,
      emergencyContactPhone,
    },
  });

  await publishDirectoryChange([userId]);
  revalidatePath("/protected/users");
  revalidatePath("/protected/tenancies");

  return encodedRedirect(
    "success",
    "/protected/users",
    "Oman identity and contact record updated.",
  );
};

/** Parses a <input type="date"> value ("yyyy-MM-dd") into a Date, or null
 * if left blank. Doesn't validate the format — the browser's date input
 * already only ever submits that shape or an empty string. */
function parseDateInput(value: FormDataEntryValue | null): Date | null {
  const str = value?.toString().trim();
  return str ? new Date(`${str}T00:00:00.000Z`) : null;
}

/** Same as parseDateInput, but for an issuance date, which can never be in
 * the future — a document can't be issued before today. The date input's
 * `max` attribute already stops this in a normal browser, but that's only
 * a UI hint, so it's enforced again here rather than trusted from the
 * client. Anything past today is simply dropped (saved as unset) rather
 * than erroring the whole save over one bad field. */
function parseIssuanceDateInput(value: FormDataEntryValue | null): Date | null {
  const date = parseDateInput(value);
  if (date && date.getTime() > Date.now()) return null;
  return date;
}

/** Every HR document field, read off a FormData — shared between account
 * creation and the standalone HR-record edit, since both submit the same
 * shape (see components/worker-hr-modal.tsx). Vehicle documents are only
 * kept if "hasVehicle" is checked, so unchecking it later clears them
 * rather than leaving stale Mulkiya/insurance dates behind. */
function parseHrFields(formData: FormData) {
  const hasVehicle = formData.get("hasVehicle") === "on";
  const employeeTypeRaw = formData.get("employeeType")?.toString();
  const employeeType = employeeTypeRaw === "family" ? "family" : "individual";

  return {
    employeeType,
    passportNumber: formData.get("passportNumber")?.toString().trim() || null,
    passportIssuance: parseIssuanceDateInput(
      formData.get("passportIssuance"),
    ),
    passportExpiry: parseDateInput(formData.get("passportExpiry")),
    drivingLicenseNumber:
      formData.get("drivingLicenseNumber")?.toString().trim() || null,
    drivingLicenseIssuance: parseIssuanceDateInput(
      formData.get("drivingLicenseIssuance"),
    ),
    drivingLicenseExpiry: parseDateInput(formData.get("drivingLicenseExpiry")),
    visaNumber: formData.get("visaNumber")?.toString().trim() || null,
    visaIssuance: parseIssuanceDateInput(formData.get("visaIssuance")),
    visaExpiry: parseDateInput(formData.get("visaExpiry")),
    civilIdIssuance: parseIssuanceDateInput(formData.get("civilIdIssuance")),
    civilIdExpiry: parseDateInput(formData.get("civilIdExpiry")),
    hasVehicle,
    vehicleRegistrationNumber: hasVehicle
      ? formData.get("vehicleRegistrationNumber")?.toString().trim() || null
      : null,
    vehicleRegistrationIssuance: hasVehicle
      ? parseIssuanceDateInput(formData.get("vehicleRegistrationIssuance"))
      : null,
    vehicleRegistrationExpiry: hasVehicle
      ? parseDateInput(formData.get("vehicleRegistrationExpiry"))
      : null,
    carInsuranceNumber: hasVehicle
      ? formData.get("carInsuranceNumber")?.toString().trim() || null
      : null,
    carInsuranceIssuance: hasVehicle
      ? parseIssuanceDateInput(formData.get("carInsuranceIssuance"))
      : null,
    carInsuranceExpiry: hasVehicle
      ? parseDateInput(formData.get("carInsuranceExpiry"))
      : null,
  };
}

/** HR paperwork for an in-house worker: passport, work visa, Civil ID
 * expiry, and (optionally) car insurance. Separate from
 * updateUserProfileAction since it's a different concern edited from its
 * own modal, not the identity & contact form. */
export const updateWorkerHrAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const userId = formData.get("userId")?.toString();

  if (!userId) {
    return encodedRedirect("error", "/protected/users", "Invalid person.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: parseHrFields(formData),
  });

  await publishDirectoryChange([userId]);
  revalidatePath("/protected/users");

  return encodedRedirect(
    "success",
    "/protected/users",
    "HR document record updated.",
  );
};

/** Per-relationship dependent limits — a worker can list up to 4 spouses
 * (common under some Gulf employment/visa arrangements), one father, one
 * mother, and up to 10 children. Enforced here rather than in the schema
 * since it's a business rule, not a data-integrity one. */
const FAMILY_MEMBER_LIMITS: Record<FamilyRelationship, number> = {
  spouse: 4,
  father: 1,
  mother: 1,
  child: 10,
};

function parseRelationship(value: FormDataEntryValue | null): FamilyRelationship | null {
  const str = value?.toString();
  return str && (Object.values(FamilyRelationship) as string[]).includes(str)
    ? (str as FamilyRelationship)
    : null;
}

export type FamilyMemberActionResult = { ok: boolean; message: string };

/** These three intentionally return a plain result instead of using
 * encodedRedirect — a redirect means a full page navigation, which would
 * close the HR modal the family member list lives in. The client component
 * (components/family-members-manager.tsx) calls these directly, shows the
 * button's own pending state, and refreshes the route on success instead —
 * so adding/editing/removing a dependent never knocks the admin out of the
 * modal they were just working in. */
export const addFamilyMemberAction = async (
  formData: FormData,
): Promise<FamilyMemberActionResult> => {
  await requireRole(UserType.admin);

  const workerId = formData.get("workerId")?.toString();
  const name = formData.get("name")?.toString().trim();
  const relationship = parseRelationship(formData.get("relationship"));
  const civilIdIssuance = parseIssuanceDateInput(
    formData.get("civilIdIssuance"),
  );
  const civilIdExpiry = parseDateInput(formData.get("civilIdExpiry"));
  const document = formData.get("document");

  if (!workerId || !name || !relationship) {
    return { ok: false, message: "Name and relationship are required." };
  }

  const existingCount = await prisma.workerFamilyMember.count({
    where: { workerId, relationship },
  });
  if (existingCount >= FAMILY_MEMBER_LIMITS[relationship]) {
    return {
      ok: false,
      message: `You can only add up to ${FAMILY_MEMBER_LIMITS[relationship]} ${relationship}${
        FAMILY_MEMBER_LIMITS[relationship] > 1 ? "s" : ""
      }.`,
    };
  }

  const member = await prisma.workerFamilyMember.create({
    data: { workerId, name, relationship, civilIdIssuance, civilIdExpiry },
  });

  if (document instanceof File && document.size > 0) {
    try {
      const uploaded = await uploadEntityDocument(
        document,
        "family_member",
        member.id,
      );
      await prisma.workerFamilyMember.update({
        where: { id: member.id },
        data: {
          documentFileName: uploaded.fileName,
          documentFilePath: uploaded.objectKey,
          documentFileType: uploaded.fileType,
          documentFileSize: uploaded.fileSize,
        },
      });
    } catch (error) {
      unstable_rethrow(error);
      console.error("Family member document upload failed:", error);
    }
  }

  await publishDirectoryChange([workerId]);
  revalidatePath("/protected/users");

  return { ok: true, message: "Family member added." };
};

export const updateFamilyMemberAction = async (
  formData: FormData,
): Promise<FamilyMemberActionResult> => {
  await requireRole(UserType.admin);

  const memberId = formData.get("memberId")?.toString();
  const name = formData.get("name")?.toString().trim();
  const relationship = parseRelationship(formData.get("relationship"));
  const civilIdIssuance = parseIssuanceDateInput(
    formData.get("civilIdIssuance"),
  );
  const civilIdExpiry = parseDateInput(formData.get("civilIdExpiry"));
  const document = formData.get("document");

  if (!memberId || !name || !relationship) {
    return { ok: false, message: "Name and relationship are required." };
  }

  const existing = await prisma.workerFamilyMember.findUnique({
    where: { id: memberId },
    select: { workerId: true, relationship: true, documentFilePath: true },
  });
  if (!existing) {
    return { ok: false, message: "Family member not found." };
  }

  if (relationship !== existing.relationship) {
    const existingCount = await prisma.workerFamilyMember.count({
      where: { workerId: existing.workerId, relationship, id: { not: memberId } },
    });
    if (existingCount >= FAMILY_MEMBER_LIMITS[relationship]) {
      return {
        ok: false,
        message: `You can only add up to ${FAMILY_MEMBER_LIMITS[relationship]} ${relationship}${
          FAMILY_MEMBER_LIMITS[relationship] > 1 ? "s" : ""
        }.`,
      };
    }
  }

  let documentFields: {
    documentFileName?: string;
    documentFilePath?: string;
    documentFileType?: string;
    documentFileSize?: number;
  } = {};

  if (document instanceof File && document.size > 0) {
    try {
      const uploaded = await uploadEntityDocument(
        document,
        "family_member",
        memberId,
      );
      documentFields = {
        documentFileName: uploaded.fileName,
        documentFilePath: uploaded.objectKey,
        documentFileType: uploaded.fileType,
        documentFileSize: uploaded.fileSize,
      };
      if (existing.documentFilePath) {
        await deleteAttachment(existing.documentFilePath);
      }
    } catch (error) {
      unstable_rethrow(error);
      console.error("Family member document upload failed:", error);
    }
  }

  await prisma.workerFamilyMember.update({
    where: { id: memberId },
    data: { name, relationship, civilIdIssuance, civilIdExpiry, ...documentFields },
  });

  await publishDirectoryChange([existing.workerId]);
  revalidatePath("/protected/users");

  return { ok: true, message: "Family member updated." };
};

export const deleteFamilyMemberAction = async (
  formData: FormData,
): Promise<FamilyMemberActionResult> => {
  await requireRole(UserType.admin);

  const memberId = formData.get("memberId")?.toString();
  if (!memberId) {
    return { ok: false, message: "Family member not found." };
  }

  const existing = await prisma.workerFamilyMember.findUnique({
    where: { id: memberId },
    select: { workerId: true, documentFilePath: true },
  });
  if (!existing) {
    return { ok: false, message: "Family member not found." };
  }

  await prisma.workerFamilyMember.delete({ where: { id: memberId } });

  if (existing.documentFilePath) {
    await deleteAttachment(existing.documentFilePath);
  }

  await publishDirectoryChange([existing.workerId]);
  revalidatePath("/protected/users");

  return { ok: true, message: "Family member removed." };
};

export const deleteUserAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const userId = formData.get("userId")?.toString();

  if (!userId) {
    return encodedRedirect("error", "/protected/users", "Invalid user");
  }

  if (userId === admin.id) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "You cannot delete your own account",
    );
  }

  const [financialHistory, submittedPayments] = await Promise.all([
    prisma.tenancy.count({ where: { tenantId: userId } }),
    prisma.payment.count({ where: { submittedById: userId } }),
  ]);
  if (financialHistory > 0 || submittedPayments > 0) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "This person has tenancy or financial history. Change access or end the tenancy instead of deleting the audit record.",
    );
  }

  const documents = await prisma.entityDocument.findMany({
    where: { userId },
    select: { filePath: true },
  });

  // Deleting the Supabase Auth account cascades to the `users` profile row
  // (see the `_supabase_auth` migration's foreign key), so there is only one
  // place to delete from.
  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Could not delete this account.",
    );
  }

  await Promise.allSettled(
    documents.map((document) => deleteAttachment(document.filePath)),
  );

  await publishDirectoryChange();

  revalidatePath("/protected/users");
  revalidatePath("/protected/properties");

  return encodedRedirect("success", "/protected/users", "User deleted.");
};
