"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { addMonths, format } from "date-fns";

import {
  notifyPropertyApproved,
  notifyPropertyAssigned,
  notifyPropertyRejected,
  notifyServiceChargeReceived,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { requireAnyRole, requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  storeEntityDocumentGroups,
  uploadedFiles,
} from "@/lib/entity-document-service";
import { OMAN_GOVERNORATES } from "@/lib/oman";
import { isValidPhone } from "@/lib/phone";
import { deleteAttachment } from "@/lib/storage";
import { encodedRedirect } from "@/utils/utils";
import {
  EntityDocumentCategory,
  UserType,
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
  const actor = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = actor.userType === UserType.owner;

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

  if (isOwner) {
    const owned = await prisma.property.findFirst({
      where: { id, ownerId: actor.id },
      select: { id: true },
    });
    if (!owned) {
      return encodedRedirect(
        "error",
        "/protected/properties",
        "Property not found.",
      );
    }
  }

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

  // Only admins can change ownerId (see the ...(isOwner ? {} : ...) below), so
  // this comparison only matters for them — fetch the prior owner first to
  // tell whether this update is actually a (re)assignment.
  const previousOwnerId = isOwner
    ? null
    : (
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
      ...(isOwner ? {} : { ownerId }),
      serviceChargeAmount: serviceCharge.amount,
      serviceChargeCycleMonths: serviceCharge.cycleMonths,
      serviceChargeDueDate: serviceCharge.dueDate,
      // Editing the charge (amount/cycle/date) starts a fresh reminder cycle.
      serviceChargeLastStage: null,
    },
  });

  if (!isOwner && ownerId && ownerId !== previousOwnerId) {
    await notifyPropertyAssigned({
      ownerId,
      propertyId: id,
      propertyName: name,
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
    select: { name: true, ownerId: true },
  });

  if (property.ownerId) {
    await notifyPropertyApproved({
      ownerId: property.ownerId,
      propertyId: id,
      propertyName: property.name,
    });
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
export const markServiceChargeReceivedAction = async (formData: FormData) => {
  const actor = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = actor.userType === UserType.owner;

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

  if (!property || (isOwner && property.ownerId !== actor.id)) {
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

  await prisma.propertyType.update({
    where: { id },
    data: {
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
  const actor = await requireAnyRole(UserType.admin, UserType.owner);

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
      ownerId: true,
      propertyType: { select: { hasFloors: true, unitNounPlural: true } },
    },
  });

  if (
    actor.userType === UserType.owner &&
    property?.ownerId !== actor.id
  ) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Property not found.",
    );
  }

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
  const actor = await requireAnyRole(UserType.admin, UserType.owner);

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

  if (actor.userType === UserType.owner) {
    const owned = await prisma.property.findFirst({
      where: { id: propertyId, ownerId: actor.id },
      select: { id: true },
    });
    if (!owned) {
      return encodedRedirect("error", "/protected/properties", "Property not found.");
    }
  }

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
  const actor = await requireAnyRole(UserType.admin, UserType.owner);

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
    select: {
      propertyId: true,
      label: true,
      property: { select: { ownerId: true } },
    },
  });

  if (
    !unit ||
    (actor.userType === UserType.owner && unit.property.ownerId !== actor.id)
  ) {
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
  const actor = await requireAnyRole(UserType.admin, UserType.owner);

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
    select: {
      propertyId: true,
      label: true,
      tenantId: true,
      property: { select: { ownerId: true } },
    },
  });

  if (
    !unit ||
    (actor.userType === UserType.owner && unit.property.ownerId !== actor.id)
  ) {
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
  const actor = await requireAnyRole(UserType.admin, UserType.owner);

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
      property: { select: { ownerId: true } },
    },
  });

  if (
    !unit ||
    (actor.userType === UserType.owner && unit.property.ownerId !== actor.id)
  ) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Unit not found",
    );
  }

  const back = `/protected/properties/${unit.propertyId}`;

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

  if (phone && !isValidPhone(phone)) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Phone must contain only digits, with an optional leading +, up to 12 characters.",
    );
  }

  if (emergencyContactPhone && !isValidPhone(emergencyContactPhone)) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Emergency phone must contain only digits, with an optional leading +, up to 12 characters.",
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

  if (await prisma.user.findUnique({ where: { email } })) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "That email is already registered",
    );
  }

  if (civilId && (await prisma.user.findUnique({ where: { civilId } }))) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "That Civil ID / Resident Card number is already recorded.",
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

  await prisma.user.update({
    where: { id: userId },
    data: { userType: userType as UserType },
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

  if (phone && !isValidPhone(phone)) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Phone must contain only digits, with an optional leading +, up to 12 characters.",
    );
  }

  if (emergencyContactPhone && !isValidPhone(emergencyContactPhone)) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Emergency phone must contain only digits, with an optional leading +, up to 12 characters.",
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

  await prisma.user.update({
    where: { id: userId },
    data: {
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
