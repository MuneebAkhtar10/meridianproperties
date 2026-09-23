"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { format } from "date-fns";

import {
  notifyAdminsPropertySubmitted,
  notifyPropertyApproved,
  notifyPropertyAssigned,
  notifyPropertyRejected,
  notifyPropertyServiceCharge,
  notifyTenantAssigned,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  pushPropertyToDynamics,
  pushUnitToDynamics,
  pushTenantToDynamics,
} from "@/lib/dynamics/entities";
import { formatMoney, parseServiceCharge } from "@/lib/finance";
import {
  defaultUnitPermissions,
  formatUnitLabel,
  collectsServiceCharge,
  isBuildingType,
  isIndependentType,
  PROPERTY_MANAGEMENT_CATEGORY_FLAGS,
  type PropertyManagementCategory,
  type PropertyManagementFlags,
} from "@/lib/property-types";
import { publish } from "@/lib/realtime";
import { requireAnyRole, requireRole, isStaffAdmin } from "@/lib/session";
import { canManagePermissions } from "@/lib/permissions";
import { STAFF_ADMIN_TYPES } from "@/lib/user-roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { OMAN_GOVERNORATES } from "@/lib/oman";
import { isValidPhone } from "@/lib/phone";
import { deleteAttachment, uploadEntityDocument } from "@/lib/storage";
import { encodedRedirect } from "@/utils/utils";
import {
  FamilyRelationship,
  RejectionKind,
  UserType,
  WorkerCategory,
} from "@/lib/generated/prisma/client";

const USER_TYPES = Object.values(UserType) as string[];

/** A coordinate (unlike money) can be negative — south/west of the equator
 * or prime meridian — so this can't reuse parseNonNegativeMoney. Blank is a
 * valid "not set", not an error. */
function parseCoordinate(value: FormDataEntryValue | null): number | null {
  const raw = value?.toString().trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Buildings, apartments and people only ever change from an admin's screen. */
function publishDirectoryChange(userIds: (string | null | undefined)[] = []) {
  return publish({
    kind: "directory",
    roles: [...STAFF_ADMIN_TYPES],
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
  const buildingName =
    formData.get("buildingName")?.toString().trim() || null;
  const buildingNumber =
    formData.get("buildingNumber")?.toString().trim() || null;
  const postalCode = formData.get("postalCode")?.toString().trim() || null;
  const associationRegistrationNumber =
    formData.get("associationRegistrationNumber")?.toString().trim() || null;
  const latitude = parseCoordinate(formData.get("latitude"));
  const longitude = parseCoordinate(formData.get("longitude"));
  const locationMapPosition =
    formData.get("locationMapPosition")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

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

  const independent = isIndependentType(propertyType);
  const oa = isBuildingType(propertyType);
  const unitLabel = formData.get("unitLabel")?.toString().trim();
  const unitFloor = formData.get("unitFloor")?.toString().trim();
  const unitBedrooms = formData.get("unitBedrooms")?.toString().trim();
  const unitEntitlements = formData.get("unitEntitlements")?.toString().trim();

  if (oa && !associationRegistrationNumber) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Enter the OA number for an owners’ association property.",
    );
  }

  if (independent && !unitLabel) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Enter the unit number — independent properties have exactly one unit.",
    );
  }

  const floorValue = unitFloor ? Number(unitFloor) : null;
  const bedroomsValue = unitBedrooms ? Number(unitBedrooms) : null;
  const entitlementsValue = unitEntitlements ? Number(unitEntitlements) : null;
  if (unitFloor && !Number.isInteger(floorValue)) {
    return encodedRedirect("error", "/protected/properties", "Floor must be a whole number.");
  }
  if (unitBedrooms && (!Number.isInteger(bedroomsValue) || (bedroomsValue ?? 0) < 0)) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Beds must be a non-negative whole number.",
    );
  }
  if (
    unitEntitlements &&
    (!Number.isInteger(entitlementsValue) || (entitlementsValue ?? 0) < 0)
  ) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Entitlement must be a non-negative whole number.",
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

  const permissions = defaultUnitPermissions(propertyType);

  const property = await prisma.$transaction(async (tx) => {
    const created = await tx.property.create({
      data: {
        name,
        propertyTypeId: propertyType.id,
        address,
        governorate,
        wilayat,
        area,
        wayNumber,
        buildingName,
        buildingNumber,
        postalCode,
        associationRegistrationNumber: oa ? associationRegistrationNumber : null,
        latitude,
        longitude,
        locationMapPosition,
        notes,
        approved: !isOwner,
      },
    });

    if (independent && unitLabel) {
      await tx.unit.create({
        data: {
          propertyId: created.id,
          label: unitLabel,
          floor: propertyType.hasFloors ? floorValue : null,
          bedrooms: propertyType.hasBedrooms ? bedroomsValue : null,
          entitlements: entitlementsValue,
          ownerId: isOwner ? actor.id : null,
          rentBillsEnabled: permissions.rentBillsEnabled,
          maintenanceEnabled: permissions.maintenanceEnabled,
        },
      });
    }

    return created;
  });

  try {
    await pushPropertyToDynamics({
      name: property.name,
      address: property.address,
      governorate: property.governorate,
      propertyType: propertyType.label,
      status: property.approved ? "Active" : "Pending approval",
    });
  } catch (error) {
    console.error("Dynamics sync failed for property:", property.id, error);
  }

  await publishDirectoryChange();

  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    `/protected/properties/${property.id}`,
    independent
      ? `"${name}" created with its ${propertyType.unitNounSingular.toLowerCase()}.`
      : oa
        ? `"${name}" created. OA number saved — now add its units.`
        : `"${name}" created. Now add its units — agreements and other documents are managed against each one.`,
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
  const buildingName =
    formData.get("buildingName")?.toString().trim() || null;
  const buildingNumber =
    formData.get("buildingNumber")?.toString().trim() || null;
  const postalCode = formData.get("postalCode")?.toString().trim() || null;
  const latitude = parseCoordinate(formData.get("latitude"));
  const longitude = parseCoordinate(formData.get("longitude"));
  const locationMapPosition =
    formData.get("locationMapPosition")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;
  const associationRegistrationNumber =
    formData.get("associationRegistrationNumber")?.toString().trim() || null;
  const associationPhone =
    formData.get("associationPhone")?.toString().trim() || null;
  const bankName = formData.get("bankName")?.toString().trim() || null;
  const bankSwiftCode =
    formData.get("bankSwiftCode")?.toString().trim() || null;
  const bankAccountNumber =
    formData.get("bankAccountNumber")?.toString().trim() || null;
  const paymentReference =
    formData.get("paymentReference")?.toString().trim() || null;
  const chequePayableTo =
    formData.get("chequePayableTo")?.toString().trim() || null;
  const poBox = formData.get("poBox")?.toString().trim() || null;

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
      buildingName,
      buildingNumber,
      postalCode,
      latitude,
      longitude,
      locationMapPosition,
      notes,
      associationRegistrationNumber,
      associationPhone,
      bankName,
      bankSwiftCode,
      bankAccountNumber,
      paymentReference,
      chequePayableTo,
      poBox,
    },
  });

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
 * Owner has finished setting up a property's units and asks an admin to
 * review it — moves it from "draft" (submittedAt null, hidden from the
 * admin's pending queue) into "submitted" (visible there). Requires at
 * least one unit, since there's nothing for an admin to actually check
 * over otherwise.
 */
export const submitPropertyForApprovalAction = async (formData: FormData) => {
  const actor = await requireRole(UserType.owner);

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
    select: {
      name: true,
      approved: true,
      submittedAt: true,
      _count: { select: { units: true } },
    },
  });

  const ownsAUnit = await prisma.unit.count({
    where: { propertyId: id, ownerId: actor.id },
  });

  if (!property || ownsAUnit === 0) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Property not found.",
    );
  }

  if (property.approved) {
    return encodedRedirect(
      "error",
      `/protected/properties/${id}`,
      "This property is already approved.",
    );
  }

  if (property.submittedAt) {
    return encodedRedirect(
      "error",
      `/protected/properties/${id}`,
      "This property has already been submitted — an admin will review it soon.",
    );
  }

  if (property._count.units === 0) {
    return encodedRedirect(
      "error",
      `/protected/properties/${id}`,
      "Add at least one unit before submitting for approval.",
    );
  }

  await prisma.property.update({
    where: { id },
    data: {
      submittedAt: new Date(),
      rejectedAt: null,
      rejectionReason: null,
    },
  });

  await notifyAdminsPropertySubmitted({
    propertyId: id,
    propertyName: property.name,
    ownerEmail: actor.email,
  });

  revalidatePath(`/protected/properties/${id}`);
  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    `/protected/properties/${id}`,
    "Submitted for admin review.",
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
    data: { approved: true, rejectedAt: null, rejectionReason: null },
    select: { name: true },
  });

  const units = await prisma.unit.findMany({
    where: { propertyId: id, ownerId: { not: null } },
    select: {
      label: true,
      ownerId: true,
      serviceChargeAmount: true,
      serviceChargeCycleMonths: true,
      serviceChargeDueDate: true,
    },
  });

  const distinctOwnerIds = Array.from(
    new Set(units.map((unit) => unit.ownerId).filter((v): v is string => Boolean(v))),
  );

  for (const ownerId of distinctOwnerIds) {
    await notifyPropertyApproved({
      ownerId,
      propertyId: id,
      propertyName: property.name,
    });
  }

  for (const unit of units) {
    const hasServiceCharge =
      unit.ownerId &&
      unit.serviceChargeAmount &&
      unit.serviceChargeCycleMonths &&
      unit.serviceChargeDueDate;

    if (hasServiceCharge) {
      await notifyPropertyServiceCharge({
        ownerId: unit.ownerId!,
        propertyId: id,
        propertyName: `${property.name} — Unit ${unit.label}`,
        amount: formatMoney(unit.serviceChargeAmount!),
        cycleMonths: unit.serviceChargeCycleMonths!,
        dueDate: format(unit.serviceChargeDueDate!, "d MMM yyyy"),
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
 * Admin rejects a pending owner-submitted property. Rejection does NOT
 * delete anything — the property, its units and documents all stay put.
 * It's reset back to draft (submittedAt cleared, so it drops out of the
 * review queue) with the reason stamped on it, so the owner can see why on
 * their own property page and fix it up before resubmitting via
 * submitPropertyForApprovalAction. A RejectionLog entry is kept too, as a
 * permanent trail even if the property is later edited or deleted — see
 * /protected/rejections.
 */
export const rejectPropertyAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const id = formData.get("propertyId")?.toString();
  const reason = formData.get("reason")?.toString().trim() || null;
  if (!id) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Invalid property",
    );
  }
  if (!reason) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Please give a reason for rejecting this property.",
    );
  }

  const property = await prisma.property.findUnique({
    where: { id },
    select: { approved: true, submittedAt: true, name: true },
  });

  if (!property || property.approved || !property.submittedAt) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "Only a pending property can be rejected.",
    );
  }

  const owners = await prisma.user.findMany({
    where: { ownedUnits: { some: { propertyId: id } } },
    select: { id: true, email: true },
  });

  const rejectedAt = new Date();
  await prisma.property.update({
    where: { id },
    data: { submittedAt: null, rejectedAt, rejectionReason: reason },
  });

  await prisma.rejectionLog.create({
    data: {
      kind: RejectionKind.property,
      entityLabel: property.name,
      affectedUser: owners.map((owner) => owner.email).join(", ") || null,
      reason,
      rejectedById: admin.id,
      createdAt: rejectedAt,
    },
  });

  for (const owner of owners) {
    await notifyPropertyRejected({
      ownerId: owner.id,
      propertyName: property.name,
      reason,
    });
  }

  revalidatePath("/protected/properties");
  revalidatePath(`/protected/properties/${id}`);

  return encodedRedirect(
    "success",
    "/protected/properties",
    "Property rejected. The owner can review your note and resubmit.",
  );
};

/** Edits just the service charge (amount/cycle/due date) for one unit, from
 * its "Manage charge" modal on the property page. Admin-only — an owner can
 * view the charge but not change it. */
export const updateUnitServiceChargeAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  if (!unitId) {
    return encodedRedirect("error", "/protected/properties", "Invalid unit");
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      propertyId: true,
      property: {
        select: {
          propertyType: {
            select: {
              isOwnerAssociation: true,
              isBuildingManagement: true,
              showRentBills: true,
              showMaintenance: true,
              hasCommonAreas: true,
            },
          },
        },
      },
    },
  });
  if (!unit) {
    return encodedRedirect("error", "/protected/properties", "Unit not found.");
  }
  if (!collectsServiceCharge(unit.property.propertyType)) {
    return encodedRedirect(
      "error",
      `/protected/properties/${unit.propertyId}`,
      "Independent properties do not take a service charge.",
    );
  }

  const serviceCharge = parseServiceCharge(formData);
  if (!serviceCharge.ok) {
    return encodedRedirect(
      "error",
      `/protected/properties/${unit.propertyId}`,
      serviceCharge.error,
    );
  }

  await prisma.unit.update({
    where: { id: unitId },
    data: {
      serviceChargeAmount: serviceCharge.amount,
      serviceChargeCycleMonths: serviceCharge.cycleMonths,
      serviceChargeDueDate: serviceCharge.dueDate,
      // Editing the charge starts a fresh reminder cycle, same as the full
      // unit edit form does.
      serviceChargeLastStage: null,
    },
  });

  revalidatePath(`/protected/properties/${unit.propertyId}`);
  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    `/protected/properties/${unit.propertyId}`,
    "Service charge updated.",
  );
};

/**
 * Assigns the same owner to many units at once — e.g. right after
 * generating a batch of new units. Only ever touches units that don't
 * already have an owner: reassigning an already-owned unit goes through
 * transferUnitOwnershipAction instead, which keeps a proper transfer
 * history, so this silently skips those rather than overwriting them.
 */
export const bulkAssignUnitOwnerAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const propertyId = formData.get("propertyId")?.toString();
  const ownerId = formData.get("ownerId")?.toString().trim();
  const unitIds = formData.getAll("unitIds").map((v) => v.toString());

  if (!propertyId) {
    return encodedRedirect("error", "/protected/properties", "Invalid property.");
  }
  const back = `/protected/properties/${propertyId}`;

  if (!ownerId) {
    return encodedRedirect("error", back, "Select an owner.");
  }
  if (unitIds.length === 0) {
    return encodedRedirect("error", back, "Select at least one unit.");
  }

  const { count } = await prisma.unit.updateMany({
    where: { id: { in: unitIds }, propertyId, ownerId: null },
    data: { ownerId },
  });
  const skipped = unitIds.length - count;

  await publishDirectoryChange([ownerId]);
  revalidatePath(back);
  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    back,
    `Assigned owner to ${count} unit${count === 1 ? "" : "s"}.${
      skipped > 0
        ? ` Skipped ${skipped} already-owned unit${skipped === 1 ? "" : "s"} — use that unit's own Ownership tab to transfer it instead.`
        : ""
    }`,
  );
};

/**
 * Sets the same service charge (amount, cycle, due date) on many units at
 * once, unlike updateUnitServiceChargeAction above which only ever touches
 * one. Reuses the exact same validation so a bulk edit can't save anything
 * a single-unit edit wouldn't accept.
 */
export const bulkSetUnitServiceChargeAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const propertyId = formData.get("propertyId")?.toString();
  const unitIds = formData.getAll("unitIds").map((v) => v.toString());

  if (!propertyId) {
    return encodedRedirect("error", "/protected/properties", "Invalid property.");
  }
  const back = `/protected/properties/${propertyId}`;

  if (unitIds.length === 0) {
    return encodedRedirect("error", back, "Select at least one unit.");
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      propertyType: {
        select: {
          isOwnerAssociation: true,
          isBuildingManagement: true,
          showRentBills: true,
          showMaintenance: true,
          hasCommonAreas: true,
        },
      },
    },
  });
  if (property && !collectsServiceCharge(property.propertyType)) {
    return encodedRedirect(
      "error",
      back,
      "Independent properties do not take a service charge.",
    );
  }

  const serviceCharge = parseServiceCharge(formData);
  if (!serviceCharge.ok) {
    return encodedRedirect("error", back, serviceCharge.error);
  }

  const { count } = await prisma.unit.updateMany({
    where: { id: { in: unitIds }, propertyId },
    data: {
      serviceChargeAmount: serviceCharge.amount,
      serviceChargeCycleMonths: serviceCharge.cycleMonths,
      serviceChargeDueDate: serviceCharge.dueDate,
      serviceChargeLastStage: null,
    },
  });

  revalidatePath(back);
  revalidatePath("/protected/properties");

  return encodedRedirect(
    "success",
    back,
    `Service charge updated for ${count} unit${count === 1 ? "" : "s"}.`,
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

/** Every property type is exactly one of four management categories (OA /
 * BM / Callout / Independent, see lib/property-types.ts), each a fixed
 * preset of the five underlying flags — derived here from the submitted
 * category alone, never from the (now read-only, unnamed) checkboxes the
 * form displays. An unrecognized or missing category falls back to
 * "independent", the least restrictive preset. */
function parsePropertyTypeFlags(formData: FormData): PropertyManagementFlags {
  const raw = formData.get("managementCategory")?.toString();
  const category: PropertyManagementCategory =
    raw && raw in PROPERTY_MANAGEMENT_CATEGORY_FLAGS
      ? (raw as PropertyManagementCategory)
      : "independent";
  return PROPERTY_MANAGEMENT_CATEGORY_FLAGS[category];
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
  const flags = parsePropertyTypeFlags(formData);

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
      ...flags,
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
  const flags = parsePropertyTypeFlags(formData);

  const back = "/protected/admin/property-types";

  if (!id || !label || !unitNounSingular || !unitNounPlural) {
    return encodedRedirect(
      "error",
      back,
      "Label, singular and plural unit names are required.",
    );
  }

  // `name` is a stable machine key set once at creation (see
  // createPropertyTypeAction) and never touched again — isBuildingManagementType
  // in lib/property-types.ts still branches on it, so silently re-deriving
  // it from a relabel would quietly break that logic for every property
  // already using this type.
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
      ...flags,
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
 * Whether this owner may add/generate units on this property: either they
 * already own at least one unit here, or the property has no units at all
 * yet (the "first unit on my own new property" case — before that, nothing
 * on the property points to any owner). Admins always pass.
 */
async function ownerCanManageUnitsOn(
  actor: { id: string; userType: UserType },
  propertyId: string,
): Promise<boolean> {
  if (actor.userType !== UserType.owner) return true;

  const [ownedUnitCount, totalUnitCount] = await Promise.all([
    prisma.unit.count({ where: { propertyId, ownerId: actor.id } }),
    prisma.unit.count({ where: { propertyId } }),
  ]);

  return ownedUnitCount > 0 || totalUnitCount === 0;
}

/**
 * Bulk-creates apartments so nobody has to type fifty of them by hand.
 * Floors 1–10 with 5 per floor gives 101–105, 201–205 … 1001–1005.
 */
export const generateUnitsAction = async (formData: FormData) => {
  // Owners manage units on their own property (to set it up before
  // submitting for approval); admins manage units on any property.
  const actor = await requireAnyRole(UserType.admin, UserType.owner);

  const propertyId = formData.get("propertyId")?.toString();
  const floors = Number(formData.get("floors"));
  const perFloor = Number(formData.get("perFloor"));
  const startFloor = Number(formData.get("startFloor") || 1);
  const bedrooms = formData.get("bedrooms")
    ? Number(formData.get("bedrooms"))
    : null;
  const entitlements = formData.get("entitlements")
    ? Number(formData.get("entitlements"))
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
      propertyType: {
        select: {
          name: true,
          hasFloors: true,
          unitNounPlural: true,
          showRentBills: true,
          showMaintenance: true,
          isOwnerAssociation: true,
          isBuildingManagement: true,
          hasCommonAreas: true,
        },
      },
    },
  });

  if (property && !(await ownerCanManageUnitsOn(actor, propertyId))) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "You can only manage units on your own properties.",
    );
  }

  if (property && isIndependentType(property.propertyType)) {
    return encodedRedirect(
      "error",
      `/protected/properties/${propertyId}`,
      "Independent properties have exactly one unit. It is created with the property.",
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

  const generatedOwnerId = actor.userType === UserType.owner ? actor.id : null;
  const { rentBillsEnabled, maintenanceEnabled } = defaultUnitPermissions(
    property?.propertyType ?? { showRentBills: true, showMaintenance: true },
  );

  for (let floor = startFloor; floor < startFloor + floors; floor++) {
    for (let n = 1; n <= perFloor; n++) {
      units.push({
        propertyId,
        label: `${floor}${String(n).padStart(2, "0")}`,
        floor,
        bedrooms,
        entitlements,
        ownerId: generatedOwnerId,
        rentBillsEnabled,
        maintenanceEnabled,
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
  const isOwner = actor.userType === UserType.owner;

  const propertyId = formData.get("propertyId")?.toString();
  const label = formData.get("label")?.toString().trim();
  const floor = formData.get("floor") ? Number(formData.get("floor")) : null;
  const bedrooms = formData.get("bedrooms")
    ? Number(formData.get("bedrooms"))
    : null;
  const entitlements = formData.get("entitlements")
    ? Number(formData.get("entitlements"))
    : null;
  // Only an admin can hand a unit to an existing owner; an owner adding a
  // unit is always assigned to themselves.
  const ownerId = isOwner
    ? actor.id
    : formData.get("ownerId")?.toString().trim() || null;
  // Checkboxes default to checked in the form, so absence here really does
  // mean "unchecked" rather than "field not rendered yet" — except for a
  // building-type property, where the toggles aren't rendered at all and
  // must stay off no matter what's posted.
  let rentBillsEnabled = formData.get("rentBillsEnabled") === "on";
  let maintenanceEnabled = formData.get("maintenanceEnabled") === "on";

  if (!propertyId || !label) {
    return encodedRedirect(
      "error",
      `/protected/properties/${propertyId ?? ""}`,
      "Unit number is required",
    );
  }

  const back = `/protected/properties/${propertyId}`;

  if (!(await ownerCanManageUnitsOn(actor, propertyId))) {
    return encodedRedirect(
      "error",
      "/protected/properties",
      "You can only manage units on your own properties.",
    );
  }

  const exists = await prisma.unit.findUnique({
    where: { propertyId_label: { propertyId, label } },
  });

  if (exists) {
    return encodedRedirect("error", back, `Unit ${label} already exists.`);
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      propertyType: {
        select: {
          showRentBills: true,
          showMaintenance: true,
          isOwnerAssociation: true,
          isBuildingManagement: true,
          hasCommonAreas: true,
        },
      },
    },
  });
  if (property && isIndependentType(property.propertyType)) {
    const existing = await prisma.unit.count({ where: { propertyId } });
    if (existing >= 1) {
      return encodedRedirect(
        "error",
        back,
        "Independent properties have exactly one unit. Edit the existing unit instead of adding another.",
      );
    }
  }
  if (property && !property.propertyType.showRentBills) {
    rentBillsEnabled = false;
  }
  if (property && !property.propertyType.showMaintenance) {
    maintenanceEnabled = false;
  }

  // A blank charge is fine (no service charge tracked); a partial one isn't.
  // Independent properties never take SC — ignore any charge fields posted.
  const chargeFieldsFilled =
    !(property && isIndependentType(property.propertyType)) &&
    [
      "serviceChargeAmount",
      "serviceChargeCycleMonths",
      "serviceChargeDueDate",
    ].some((field) => formData.get(field)?.toString().trim());

  let serviceCharge: ReturnType<typeof parseServiceCharge> | null = null;
  if (chargeFieldsFilled) {
    serviceCharge = parseServiceCharge(formData);
    if (!serviceCharge.ok) {
      return encodedRedirect("error", back, serviceCharge.error);
    }
  }

  await prisma.unit.create({
    data: {
      propertyId,
      label,
      floor,
      bedrooms,
      entitlements,
      ownerId,
      rentBillsEnabled,
      maintenanceEnabled,
      serviceChargeAmount: serviceCharge?.ok ? serviceCharge.amount : null,
      serviceChargeCycleMonths: serviceCharge?.ok
        ? serviceCharge.cycleMonths
        : null,
      serviceChargeDueDate: serviceCharge?.ok ? serviceCharge.dueDate : null,
    },
  });

  try {
    const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } });
    await pushUnitToDynamics({
      label,
      propertyName: property?.name ?? propertyId,
      bedrooms,
      status: "Vacant",
    });
  } catch (error) {
    console.error("Dynamics sync failed for unit:", propertyId, label, error);
  }

  await publishDirectoryChange();

  revalidatePath(back);

  return encodedRedirect("success", back, `Unit ${label} added.`);
};

/** Edits a unit's number, floor, bedroom count, owner and service charge in
 * place. Owners can only edit units they themselves own; admins can edit any
 * unit and reassign its owner. */
export const updateUnitAction = async (formData: FormData) => {
  const actor = await requireAnyRole(UserType.admin, UserType.owner);
  const isAdmin = isStaffAdmin(actor.userType);

  const unitId = formData.get("unitId")?.toString();
  const label = formData.get("label")?.toString().trim();
  const floor = formData.get("floor")?.toString().trim();
  const bedrooms = formData.get("bedrooms")?.toString().trim();
  const entitlements = formData.get("entitlements")?.toString().trim();

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
      ownerId: true,
      rentBillsEnabled: true,
      maintenanceEnabled: true,
      property: {
        select: {
          name: true,
          propertyType: {
            select: { showRentBills: true, showMaintenance: true },
          },
        },
      },
    },
  });

  if (!unit || (!isAdmin && unit.ownerId !== actor.id)) {
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
  const entitlementsValue = entitlements ? Number(entitlements) : null;

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
  if (
    entitlements &&
    (!Number.isInteger(entitlementsValue) || (entitlementsValue ?? 0) < 0)
  ) {
    return encodedRedirect(
      "error",
      back,
      "Unit entitlement must be a non-negative whole number.",
    );
  }

  const clash = await prisma.unit.findUnique({
    where: { propertyId_label: { propertyId: unit.propertyId, label } },
    select: { id: true },
  });

  if (clash && clash.id !== unitId) {
    return encodedRedirect("error", back, `Unit ${label} already exists.`);
  }

  // Only an admin may assign an owner from this form, and only while the
  // unit is unassigned — once it has one, the field isn't rendered at all
  // (see components/unit-manage-modal.tsx) and reassignment goes through
  // transferUnitOwnershipAction instead, which keeps a proper history.
  // formData.has() distinguishes "field wasn't in this form" from
  // "submitted blank", so saving other details on an already-owned unit
  // never silently clears it.
  const ownerId =
    isAdmin && formData.has("ownerId")
      ? formData.get("ownerId")?.toString().trim() || null
      : unit.ownerId;
  // Only an admin can see (or submit) these checkboxes at all — for anyone
  // else's submission of this form, leave the unit's current values alone
  // rather than reading an absent field as "unchecked".
  // A property type with the feature turned off never renders the
  // matching checkbox at all, so that toggle stays forced off regardless
  // of what a submission carries.
  const rentBillsEnabled = !unit.property.propertyType.showRentBills
    ? false
    : isAdmin
      ? formData.get("rentBillsEnabled") === "on"
      : unit.rentBillsEnabled;
  const maintenanceEnabled = !unit.property.propertyType.showMaintenance
    ? false
    : isAdmin
      ? formData.get("maintenanceEnabled") === "on"
      : unit.maintenanceEnabled;

  await prisma.unit.update({
    where: { id: unitId },
    data: {
      label,
      floor: floorValue,
      bedrooms: bedroomsValue,
      entitlements: entitlementsValue,
      ownerId,
      rentBillsEnabled,
      maintenanceEnabled,
    },
  });

  // Logged purely so a future report can reconstruct, after the fact, which
  // periods this unit was actually billed through the system — "what it's
  // set to right now" alone can't answer that once a cycle has passed.
  const permissionChanges = [];
  if (rentBillsEnabled !== unit.rentBillsEnabled) {
    permissionChanges.push({
      unitId,
      field: "rentBillsEnabled",
      fromValue: unit.rentBillsEnabled,
      toValue: rentBillsEnabled,
      changedById: actor.id,
    });
  }
  if (maintenanceEnabled !== unit.maintenanceEnabled) {
    permissionChanges.push({
      unitId,
      field: "maintenanceEnabled",
      fromValue: unit.maintenanceEnabled,
      toValue: maintenanceEnabled,
      changedById: actor.id,
    });
  }
  if (permissionChanges.length > 0) {
    await prisma.unitPermissionChange.createMany({ data: permissionChanges });
  }

  if (isAdmin && ownerId && ownerId !== unit.ownerId) {
    await notifyPropertyAssigned({
      ownerId,
      propertyId: unit.propertyId,
      propertyName: `${unit.property.name} — Unit ${label}`,
    });
  }

  await publishDirectoryChange();

  revalidatePath(back);

  return encodedRedirect("success", back, `Unit ${label} updated.`);
};

/** Ends the current ownership and starts the new one on the same
 * transferDate, with a recorded OwnershipTransfer row instead of silently
 * overwriting Unit.ownerId. */
export const transferUnitOwnershipAction = async (formData: FormData) => {
  const actor = await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  const newOwnerId = formData.get("newOwnerId")?.toString().trim();
  const transferDate = parseDateInput(formData.get("transferDate"));
  const keepServiceCharge = formData.get("keepServiceCharge") === "on";
  const installmentPlanAction = formData.get("installmentPlanAction")?.toString();
  const keepInstallmentPlan = installmentPlanAction !== "cancel";
  const notes = formData.get("notes")?.toString().trim() || null;

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { id: true, propertyId: true, label: true, ownerId: true },
  });
  const back = unit
    ? `/protected/properties/${unit.propertyId}`
    : "/protected/properties";

  if (!unit || !newOwnerId || !transferDate) {
    return encodedRedirect(
      "error",
      back,
      "Select a new owner and a transfer date.",
    );
  }

  const newOwner = await prisma.user.findUnique({
    where: { id: newOwnerId },
    select: { id: true, userType: true },
  });
  if (!newOwner || newOwner.userType !== UserType.owner) {
    return encodedRedirect("error", back, "Select a valid owner account.");
  }
  if (newOwnerId === unit.ownerId) {
    return encodedRedirect(
      "error",
      back,
      "That owner already holds this unit.",
    );
  }

  const targetUnits = [unit];

  await prisma.$transaction(async (tx) => {
    for (const target of targetUnits) {
      await tx.ownershipTransfer.create({
        data: {
          unitId: target.id,
          fromOwnerId: unit.ownerId,
          toOwnerId: newOwnerId,
          transferDate,
          keptServiceCharge: keepServiceCharge,
          keptInstallmentPlan: keepInstallmentPlan,
          notes,
          createdById: actor.id,
        },
      });
      if (!keepInstallmentPlan) {
        await tx.serviceChargeInstallmentPlan.updateMany({
          where: {
            unitId: target.id,
            cancelledAt: null,
          },
          data: { cancelledAt: new Date() },
        });
      }
      await tx.unit.update({
        where: { id: target.id },
        data: {
          ownerId: newOwnerId,
          ...(keepServiceCharge
            ? {}
            : {
                serviceChargeAmount: null,
                serviceChargeCycleMonths: null,
                serviceChargeDueDate: null,
              }),
        },
      });
      if (keepServiceCharge) {
        const latestInvoice = await tx.serviceChargeInvoice.findFirst({
          where: { unitId: target.id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (latestInvoice) {
          await tx.serviceChargeInvoice.update({
            where: { id: latestInvoice.id },
            data: { billedOwnerId: newOwnerId },
          });
        }
      }
    }
  });

  try {
    await notifyPropertyAssigned({
      ownerId: newOwnerId,
      propertyId: unit.propertyId,
      propertyName: `Unit ${unit.label}`,
    });
  } catch (error) {
    console.error("Ownership transfer notification failed:", error);
  }

  await publishDirectoryChange();
  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect(
    "success",
    back,
    keepServiceCharge
      ? keepInstallmentPlan
        ? `Ownership of unit ${unit.label} transferred. The current invoice and payment plan now sit with the new owner.`
        : `Ownership of unit ${unit.label} transferred. The current invoice is payable by the new owner — set up a new payment plan if needed.`
      : `Ownership of unit ${unit.label} transferred.`,
  );
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
      ownerId: true,
    },
  });

  if (
    !unit ||
    (actor.userType === UserType.owner && unit.ownerId !== actor.id)
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
      ownerId: true,
      rentBillsEnabled: true,
      property: {
        select: {
          name: true,
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
  // which previously sent nothing. Skipped entirely when rent & bills are
  // off for this unit, since the whole notice is about lease/rent terms.
  if (isNewAssignment && tenantId && unit.rentBillsEnabled) {
    try {
      await notifyTenantAssigned({
        tenantId,
        propertyName: unit.property.name,
        unitLabel: formatUnitLabel(unit.property.propertyType, unit.label),
        moveInDate: format(new Date(), "d MMMM yyyy"),
        monthlyRent: formatMoney(0),
        rentDueDay: 5,
        ownerId: unit.ownerId,
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
  const actor = await requireRole(UserType.admin);

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

  if (
    userType === UserType.super_admin &&
    !(await canManagePermissions(actor))
  ) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Only a super admin can create another super admin.",
    );
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

  if (userType === UserType.user) {
    try {
      await pushTenantToDynamics({
        name: [firstName, lastName].filter(Boolean).join(" ") || email,
        email,
        phone,
      });
    } catch (error) {
      console.error("Dynamics sync failed for tenant:", user.id, error);
    }
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

  if (isStaffAdmin(user.userType) || user.userType === UserType.super_admin) {
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

  if (
    userType === UserType.super_admin &&
    !(await canManagePermissions(admin))
  ) {
    return encodedRedirect(
      "error",
      "/protected/users",
      "Only a super admin can assign the super admin role.",
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { userType: true },
  });
  if (!existing) {
    return encodedRedirect("error", "/protected/users", "Person not found.");
  }

  if (
    existing.userType === UserType.super_admin &&
    userType !== UserType.super_admin
  ) {
    const others = await prisma.user.count({
      where: { userType: UserType.super_admin, id: { not: userId } },
    });
    if (others === 0) {
      return encodedRedirect(
        "error",
        "/protected/users",
        "Promote someone else to super admin before changing this role.",
      );
    }
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

  if (existing.userType === UserType.admin && userType !== UserType.admin) {
    await prisma.adminModuleGrant.deleteMany({ where: { userId } });
  }

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
  const mailingAddress =
    formData.get("mailingAddress")?.toString().trim() || null;

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
      mailingAddress,
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

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { userType: true },
  });
  if (target?.userType === UserType.super_admin) {
    if (admin.userType !== UserType.super_admin) {
      return encodedRedirect(
        "error",
        "/protected/users",
        "Only a super admin can delete another super admin.",
      );
    }
    const others = await prisma.user.count({
      where: { userType: UserType.super_admin, id: { not: userId } },
    });
    if (others === 0) {
      return encodedRedirect(
        "error",
        "/protected/users",
        "Promote someone else to super admin before deleting this account.",
      );
    }
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
