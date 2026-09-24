"use server";

import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import {
  notifyAdminsPaymentProof,
  notifyChargeWaived,
  notifyOwnerChargeIssued,
  notifyOwnerChargePaid,
  notifyOwnerChequeUpdate,
  notifyOwnerPaymentProof,
  notifyPaymentReviewed,
  notifyTenantAssigned,
  notifyTenantInvoice,
} from "@/lib/notifications";
import {
  storeEntityDocumentGroups,
  uploadedFiles,
} from "@/lib/entity-document-service";
import { formatUnitLabel } from "@/lib/property-types";
import {
  formatMoney,
  monthStart,
  parseDate,
  parseNonNegativeMoney,
  parsePositiveMoney,
} from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { pushPaymentToDynamics } from "@/lib/dynamics/sync";
import { pushTenancyToDynamics, pushChargeToDynamics } from "@/lib/dynamics/entities";
import { publish } from "@/lib/realtime";
import { requireRole, requireUser, isStaffAdmin } from "@/lib/session";
import { STAFF_ADMIN_TYPES } from "@/lib/user-roles";
import { uploadFinancialDocument } from "@/lib/storage";
import { encodedRedirect } from "@/utils/utils";
import {
  ChargeStatus,
  ChargeType,
  EntityDocumentCategory,
  FinancialDocumentKind,
  PaymentCollector,
  PaymentMethod,
  PaymentStatus,
  RejectionKind,
  TenancyPurpose,
  UserType,
} from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";

const CHARGE_TYPES = Object.values(ChargeType) as string[];
const PAYMENT_METHODS = Object.values(PaymentMethod) as string[];
const TENANCY_PURPOSES = Object.values(TenancyPurpose) as string[];

function financeBack(id?: string): string {
  return id ? `/protected/finances/${id}` : "/protected/finances";
}

/** Only `/protected/finances…` paths — so a tampered `back` field cannot
 * send the admin elsewhere after a charge edit. */
function financesReturn(formData: FormData, fallback: string): string {
  const back = formData.get("back")?.toString() ?? "";
  if (
    back.startsWith("/protected/finances") &&
    !back.startsWith("//") &&
    !back.includes("://")
  ) {
    return back;
  }
  return fallback;
}

/** Stay on the charge after a payment/review, but keep the ledger filters
 * on `back` so "Rent & bills" still opens the same filtered list. */
function chargeReturn(
  formData: FormData,
  chargeId: string | undefined,
): string {
  if (!chargeId) return "/protected/finances";
  const detail = `/protected/finances/${chargeId}`;
  const list = formData.get("back")?.toString() ?? "";
  if (
    list.startsWith("/protected/finances") &&
    !list.startsWith("/protected/finances/") &&
    !list.startsWith("//") &&
    !list.includes("://")
  ) {
    return `${detail}?back=${encodeURIComponent(list)}`;
  }
  return detail;
}

function dueDateForMonth(period: Date, day: number): Date {
  return new Date(
    Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), Math.min(day, 28)),
  );
}

async function publishFinance(userIds: Array<string | null | undefined> = []) {
  await publish({
    kind: "finance",
    roles: [...STAFF_ADMIN_TYPES],
    userIds: userIds.filter((id): id is string => Boolean(id)),
  });
}

/* ── Tenancies ────────────────────────────────────────────────────────────── */

export const startTenancyAction = async (formData: FormData) => {
  // Admin-only — property owners have read-only access to everything
  // except creating a new property (see admin-actions.ts's
  // createPropertyAction).
  const admin = await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  const tenantId = formData.get("tenantId")?.toString();
  const startDate = parseDate(formData.get("startDate")?.toString());
  const leaseEndDate = parseDate(formData.get("leaseEndDate")?.toString());
  const monthlyRent = parseNonNegativeMoney(formData.get("monthlyRent"));
  const securityDeposit = parseNonNegativeMoney(
    formData.get("securityDeposit"),
  );
  const rentDueDay = Number(formData.get("rentDueDay"));
  const purpose = formData.get("purpose")?.toString();
  const agreementRef = formData.get("agreementRef")?.toString().trim() || null;
  const agreementStartDate = parseDate(
    formData.get("agreementStartDate")?.toString(),
  );
  const paidBy = formData.get("paidBy")?.toString().trim() || null;
  const contractRegisteredAt = parseDate(
    formData.get("contractRegisteredAt")?.toString(),
  );
  const parkingSlotNumber =
    formData.get("parkingSlotNumber")?.toString().trim() || null;
  const vehiclePlateNumber =
    formData.get("vehiclePlateNumber")?.toString().trim() || null;
  const vehicleDetails =
    formData.get("vehicleDetails")?.toString().trim() || null;
  const agreementDocuments = uploadedFiles(
    formData,
    "tenancyAgreementDocuments",
  );
  const municipalityDocuments = uploadedFiles(
    formData,
    "municipalityDocuments",
  );
  const parkingAgreementDocuments = uploadedFiles(
    formData,
    "parkingAgreementDocuments",
  );
  const otherDocuments = uploadedFiles(formData, "otherTenancyDocuments");
  const notes = formData.get("notes")?.toString().trim() || null;
  const createFirstRent = formData.get("createFirstRent") === "on";
  const createDepositCharge = formData.get("createDepositCharge") === "on";

  if (
    !unitId ||
    !tenantId ||
    !startDate ||
    monthlyRent === null ||
    securityDeposit === null ||
    !purpose ||
    !TENANCY_PURPOSES.includes(purpose) ||
    !Number.isInteger(rentDueDay) ||
    rentDueDay < 1 ||
    rentDueDay > 28
  ) {
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "Complete the tenancy details with valid amounts and a due day from 1 to 28.",
    );
  }

  if (leaseEndDate && leaseEndDate < startDate) {
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "Lease end date cannot be before the move-in date.",
    );
  }

  const [unit, tenant] = await Promise.all([
    prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        property: {
          select: {
            name: true,
            propertyType: { select: { unitPrefix: true, hasFloors: true } },
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userType: true,
        unit: { select: { id: true } },
      },
    }),
  ]);

  if (!unit || !tenant || tenant.userType !== UserType.user) {
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "Apartment or tenant is invalid.",
    );
  }

  if (unit.tenantId || tenant.unit) {
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "That apartment or tenant already has an active tenancy.",
    );
  }

  const tenancy = await prisma.$transaction(async (tx) => {
    const created = await tx.tenancy.create({
      data: {
        unitId,
        tenantId,
        startDate,
        leaseEndDate,
        monthlyRent,
        rentDueDay,
        securityDeposit,
        purpose: purpose as TenancyPurpose,
        agreementRef,
        agreementStartDate,
        paidBy,
        contractRegisteredAt,
        parkingSlotNumber,
        vehiclePlateNumber,
        vehicleDetails,
        notes,
      },
    });

    await tx.unit.update({ where: { id: unitId }, data: { tenantId } });

    const charges = [];

    if (createFirstRent && Number(monthlyRent) > 0) {
      const period = new Date(
        Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1),
      );
      const scheduledDue = dueDateForMonth(period, rentDueDay);
      charges.push({
        tenancyId: created.id,
        unitId,
        tenantId,
        type: ChargeType.rent,
        title: `Rent · ${format(period, "MMMM yyyy")}`,
        amount: monthlyRent,
        dueDate: scheduledDue < startDate ? startDate : scheduledDue,
        periodStart: period,
        rentKey: `${created.id}:${period.toISOString().slice(0, 7)}`,
        createdById: admin.id,
      });
    }

    if (createDepositCharge && Number(securityDeposit) > 0) {
      charges.push({
        tenancyId: created.id,
        unitId,
        tenantId,
        type: ChargeType.deposit,
        title: "Security deposit",
        amount: securityDeposit,
        dueDate: startDate,
        periodStart: null,
        rentKey: null,
        createdById: admin.id,
      });
    }

    let createdCharges: { id: string; title: string; amount: Prisma.Decimal; dueDate: Date }[] = [];
    if (charges.length > 0) {
      await tx.charge.createMany({ data: charges });
      createdCharges = await tx.charge.findMany({
        where: { tenancyId: created.id },
        select: { id: true, title: true, amount: true, dueDate: true },
      });
    }

    return { ...created, createdCharges };
  });

  const unitLabel = formatUnitLabel(unit.property.propertyType, unit.label);
  const tenantName = [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") || tenant.email;

  try {
    await pushTenancyToDynamics({
      label: `Tenancy - ${unitLabel} - ${tenantName}`,
      tenantName,
      unitLabel,
      propertyName: unit.property.name,
      monthlyRent: formatMoney(monthlyRent),
      startDate: format(startDate, "yyyy-MM-dd"),
      status: "Active",
    });
    for (const charge of tenancy.createdCharges) {
      await pushChargeToDynamics({
        label: charge.title,
        tenantName,
        unitLabel,
        chargeType: charge.title.startsWith("Rent") ? "Rent" : "Deposit",
        amount: formatMoney(charge.amount),
        dueDate: format(charge.dueDate, "yyyy-MM-dd"),
        status: "Open",
      });
    }
  } catch (error) {
    console.error("Dynamics sync failed for tenancy:", tenancy.id, error);
  }

  // The tenant has a home now — a rich welcome email with the lease specifics,
  // not just a bare "you were assigned" line. Not worth failing the whole
  // tenancy creation over a notification hiccup. Skipped entirely when rent
  // & bills are off for this unit, since the whole notice is lease/rent terms.
  if (unit.rentBillsEnabled) {
    try {
      await notifyTenantAssigned({
        tenantId,
        propertyName: unit.property.name,
        unitLabel,
        moveInDate: format(startDate, "d MMMM yyyy"),
        monthlyRent: formatMoney(monthlyRent),
        rentDueDay,
        securityDeposit:
          Number(securityDeposit) > 0
            ? formatMoney(securityDeposit)
            : undefined,
        leaseEndDate: leaseEndDate
          ? format(leaseEndDate, "d MMMM yyyy")
          : undefined,
        ownerId: unit.ownerId,
      });
    } catch (error) {
      console.error("Tenant-assigned notification failed:", error);
    }
  }

  // First-move-in charges exist now — send one combined invoice rather than
  // a separate email per charge.
  if (unit.rentBillsEnabled && tenancy.createdCharges.length > 0) {
    try {
      const total = tenancy.createdCharges.reduce(
        (sum, charge) => sum + Number(charge.amount),
        0,
      );
      const earliestDue = tenancy.createdCharges.reduce((earliest, charge) =>
        charge.dueDate < earliest.dueDate ? charge : earliest,
      );

      await notifyTenantInvoice({
        tenantId,
        tenantName:
          [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") ||
          tenant.email,
        propertyName: unit.property.name,
        unitLabel,
        invoiceRef: tenancy.id,
        dueDate: format(earliestDue.dueDate, "d MMMM yyyy"),
        href: `/protected/finances/${earliestDue.id}`,
        lineItems: tenancy.createdCharges.map((charge) => ({
          label: charge.title,
          amount: formatMoney(charge.amount),
        })),
        total: formatMoney(total),
      });

      const tenantName =
        [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") ||
        tenant.email;
      await Promise.all(
        tenancy.createdCharges.map((charge) =>
          notifyOwnerChargeIssued({
            ownerId: unit.ownerId,
            chargeId: charge.id,
            kind: charge.title.startsWith("Rent") ? "rent" : "bill",
            propertyName: unit.property.name,
            unitLabel,
            tenantName,
            amount: formatMoney(charge.amount),
            dueDate: format(charge.dueDate, "d MMMM yyyy"),
            title: charge.title,
          }),
        ),
      );
    } catch (error) {
      console.error("Tenancy invoice notification failed:", error);
    }
  }

  let documentUploadError: string | null = null;
  try {
    await storeEntityDocumentGroups({
      target: { type: "tenancy", id: tenancy.id },
      uploadedById: admin.id,
      groups: [
        {
          category: EntityDocumentCategory.tenancy_agreement,
          files: agreementDocuments,
        },
        {
          category: EntityDocumentCategory.municipality_registration,
          files: municipalityDocuments,
        },
        {
          category: EntityDocumentCategory.parking_agreement,
          files: parkingAgreementDocuments,
        },
        {
          category: EntityDocumentCategory.other,
          files: otherDocuments,
        },
      ],
    });
  } catch (error) {
    // `redirect()` reports itself by throwing. Without this, a redirect thrown
    // anywhere under here would be caught and shown as the error "NEXT_REDIRECT"
    // instead of navigating.
    unstable_rethrow(error);
    documentUploadError =
      error instanceof Error ? error.message : "Document upload failed.";
  }

  await publishFinance([tenantId]);
  await publish({
    kind: "directory",
    roles: [...STAFF_ADMIN_TYPES],
    userIds: [tenantId],
  });
  revalidatePath("/protected/tenancies");
  revalidatePath("/protected/properties");
  revalidatePath("/protected/users");
  revalidatePath("/protected/finances");

  return encodedRedirect(
    documentUploadError ? "error" : "success",
    "/protected/tenancies",
    documentUploadError
      ? `Tenancy was created, but its documents could not be uploaded: ${documentUploadError}`
      : `${tenant.email} moved into ${unit.property.name} · Apt ${unit.label}. Tenancy terms and documents are now being tracked.`,
  );
};

export const updateTenancyAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const tenancyId = formData.get("tenancyId")?.toString();
  const startDate = parseDate(formData.get("startDate")?.toString());
  const leaseEndDate = parseDate(formData.get("leaseEndDate")?.toString());
  const monthlyRent = parseNonNegativeMoney(formData.get("monthlyRent"));
  const securityDeposit = parseNonNegativeMoney(
    formData.get("securityDeposit"),
  );
  const rentDueDay = Number(formData.get("rentDueDay"));
  const purpose = formData.get("purpose")?.toString();
  const agreementRef = formData.get("agreementRef")?.toString().trim() || null;
  const agreementStartDate = parseDate(
    formData.get("agreementStartDate")?.toString(),
  );
  const paidBy = formData.get("paidBy")?.toString().trim() || null;
  const contractRegisteredAt = parseDate(
    formData.get("contractRegisteredAt")?.toString(),
  );
  const parkingSlotNumber =
    formData.get("parkingSlotNumber")?.toString().trim() || null;
  const vehiclePlateNumber =
    formData.get("vehiclePlateNumber")?.toString().trim() || null;
  const vehicleDetails =
    formData.get("vehicleDetails")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (
    !tenancyId ||
    !startDate ||
    monthlyRent === null ||
    securityDeposit === null ||
    !purpose ||
    !TENANCY_PURPOSES.includes(purpose) ||
    !Number.isInteger(rentDueDay) ||
    rentDueDay < 1 ||
    rentDueDay > 28
  ) {
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "Invalid tenancy terms.",
    );
  }

  if (leaseEndDate && leaseEndDate < startDate) {
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "Lease end date cannot be before the move-in date.",
    );
  }

  const tenancy = await prisma.tenancy.update({
    where: { id: tenancyId },
    data: {
      startDate,
      leaseEndDate,
      monthlyRent,
      rentDueDay,
      securityDeposit,
      purpose: purpose as TenancyPurpose,
      agreementRef,
      agreementStartDate,
      paidBy,
      contractRegisteredAt,
      parkingSlotNumber,
      vehiclePlateNumber,
      vehicleDetails,
      notes,
    },
    select: { tenantId: true },
  });

  await publishFinance([tenancy.tenantId]);
  revalidatePath("/protected/tenancies");

  return encodedRedirect(
    "success",
    "/protected/tenancies",
    "Tenancy terms updated. Existing charges were left unchanged for a clean audit trail.",
  );
};

/** Re-sends the move-in welcome email, rebuilt from the tenancy's current
 * terms — same use case as resendChargeInvoiceEmailAction: a bounced email,
 * a fixed address, or a tenant who says they never got it. */
export const resendTenancyWelcomeEmailAction = async (formData: FormData) => {
  await requireRole(UserType.admin);
  const tenancyId = formData.get("tenancyId")?.toString();

  if (!tenancyId) {
    return encodedRedirect("error", "/protected/tenancies", "Tenancy not found.");
  }

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: {
      tenant: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      unit: { include: { property: { include: { propertyType: true } } } },
    },
  });

  if (!tenancy) {
    return encodedRedirect("error", "/protected/tenancies", "Tenancy not found.");
  }

  if (!tenancy.unit.rentBillsEnabled) {
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "Rent & bills are turned off for this unit — there's no welcome email to resend.",
    );
  }

  try {
    await notifyTenantAssigned({
      tenantId: tenancy.tenantId,
      propertyName: tenancy.unit.property.name,
      unitLabel: formatUnitLabel(
        tenancy.unit.property.propertyType,
        tenancy.unit.label,
      ),
      moveInDate: format(tenancy.startDate, "d MMMM yyyy"),
      monthlyRent: formatMoney(tenancy.monthlyRent),
      rentDueDay: tenancy.rentDueDay,
      securityDeposit:
        Number(tenancy.securityDeposit) > 0
          ? formatMoney(tenancy.securityDeposit)
          : undefined,
      leaseEndDate: tenancy.leaseEndDate
        ? format(tenancy.leaseEndDate, "d MMMM yyyy")
        : undefined,
      ownerId: tenancy.unit.ownerId,
    });
  } catch (error) {
    console.error("Resend welcome email failed:", error);
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "Could not resend the email. Try again.",
    );
  }

  return encodedRedirect(
    "success",
    "/protected/tenancies",
    "Welcome email resent to the tenant.",
  );
};

export const endTenancyAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const tenancyId = formData.get("tenancyId")?.toString();
  const endDate = parseDate(formData.get("endDate")?.toString());

  if (!tenancyId || !endDate) {
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "Select a valid move-out date.",
    );
  }

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
  });
  if (!tenancy || tenancy.endDate) {
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "Active tenancy not found.",
    );
  }

  if (endDate < tenancy.startDate) {
    return encodedRedirect(
      "error",
      "/protected/tenancies",
      "Move-out date cannot be before the move-in date.",
    );
  }

  await prisma.$transaction([
    prisma.tenancy.update({ where: { id: tenancyId }, data: { endDate } }),
    prisma.unit.updateMany({
      where: { id: tenancy.unitId, tenantId: tenancy.tenantId },
      data: { tenantId: null },
    }),
  ]);

  await publishFinance([tenancy.tenantId]);
  await publish({
    kind: "directory",
    roles: [...STAFF_ADMIN_TYPES],
    userIds: [tenancy.tenantId],
  });
  revalidatePath("/protected/tenancies");
  revalidatePath("/protected/properties");
  revalidatePath("/protected/users");

  return encodedRedirect(
    "success",
    "/protected/tenancies",
    "Tenancy ended. Its charges and payment history have been preserved.",
  );
};

/* ── Charges and rent generation ──────────────────────────────────────────── */

export const createChargeAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const tenancyId = formData.get("tenancyId")?.toString();
  const type = formData.get("type")?.toString();
  const title = formData.get("title")?.toString().trim();
  const amount = parsePositiveMoney(formData.get("amount"));
  const dueDate = parseDate(formData.get("dueDate")?.toString());
  const periodRaw = formData.get("period")?.toString() || "";
  const periodStartDate = periodRaw ? monthStart(periodRaw) : null;
  const notes = formData.get("notes")?.toString().trim() || null;
  const bill = formData.get("bill");

  if (
    !tenancyId ||
    !type ||
    !CHARGE_TYPES.includes(type) ||
    !title ||
    !amount ||
    !dueDate ||
    (periodRaw && !periodStartDate)
  ) {
    return encodedRedirect(
      "error",
      financesReturn(formData, "/protected/finances"),
      "Complete the charge details correctly.",
    );
  }

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: {
      tenant: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      unit: {
        select: {
          label: true,
          rentBillsEnabled: true,
          ownerId: true,
          property: {
            select: {
              name: true,
              propertyType: { select: { unitPrefix: true, hasFloors: true } },
            },
          },
        },
      },
    },
  });

  if (!tenancy) {
    return encodedRedirect(
      "error",
      financesReturn(formData, "/protected/finances"),
      "Tenancy not found.",
    );
  }

  if (!tenancy.unit.rentBillsEnabled) {
    return encodedRedirect(
      "error",
      financesReturn(formData, "/protected/finances"),
      "Rent & bills are turned off for this unit — enable it from the unit's settings first.",
    );
  }

  const charge = await prisma.charge.create({
    data: {
      tenancyId,
      unitId: tenancy.unitId,
      tenantId: tenancy.tenantId,
      type: type as ChargeType,
      title,
      amount,
      dueDate,
      periodStart: periodStartDate,
      notes,
      createdById: admin.id,
    },
  });

  const unitLabel = formatUnitLabel(
    tenancy.unit.property.propertyType,
    tenancy.unit.label,
  );
  const tenantName =
    [tenancy.tenant.firstName, tenancy.tenant.lastName]
      .filter(Boolean)
      .join(" ") || tenancy.tenant.email;

  after(() =>
    Promise.allSettled([
      pushChargeToDynamics({
        label: title,
        tenantName,
        unitLabel,
        chargeType: type,
        amount: formatMoney(amount),
        dueDate: format(dueDate, "yyyy-MM-dd"),
        status: "Open",
      }),
      notifyTenantInvoice({
        tenantId: tenancy.tenantId,
        tenantName,
        propertyName: tenancy.unit.property.name,
        unitLabel,
        invoiceRef: charge.id,
        dueDate: format(dueDate, "d MMMM yyyy"),
        href: `/protected/finances/${charge.id}`,
        lineItems: [{ label: title, amount: formatMoney(amount) }],
        total: formatMoney(amount),
      }),
      notifyOwnerChargeIssued({
        ownerId: tenancy.unit.ownerId,
        chargeId: charge.id,
        kind: type === ChargeType.rent ? "rent" : "bill",
        propertyName: tenancy.unit.property.name,
        unitLabel,
        tenantName,
        amount: formatMoney(amount),
        dueDate: format(dueDate, "d MMMM yyyy"),
        title,
      }),
      publishFinance([tenancy.tenantId]),
    ]).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("Charge post-create side effect failed:", result.reason);
        }
      }
    }),
  );

  let uploadError: string | null = null;
  if (bill instanceof File && bill.size > 0) {
    try {
      const uploaded = await uploadFinancialDocument(bill, charge.id);
      await prisma.financialAttachment.create({
        data: {
          chargeId: charge.id,
          kind: FinancialDocumentKind.bill,
          fileName: uploaded.fileName,
          filePath: uploaded.objectKey,
          fileType: uploaded.fileType,
          fileSize: uploaded.fileSize,
          uploadedById: admin.id,
        },
      });
    } catch (error) {
      unstable_rethrow(error);
      console.error("Bill upload failed:", error);
      uploadError =
        error instanceof Error ? error.message : "The file was not accepted.";
    }
  }

  revalidatePath("/protected/finances");

  return encodedRedirect(
    uploadError ? "error" : "success",
    financesReturn(formData, financeBack(charge.id)),
    uploadError
      ? `Charge created, but the bill was not attached: ${uploadError}`
      : "Charge created and sent to the tenant ledger.",
  );
};

export const generateRentChargesAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);
  const period = monthStart(formData.get("month")?.toString() || "");

  if (!period) {
    return encodedRedirect(
      "error",
      financesReturn(formData, "/protected/finances"),
      "Select a valid rent month.",
    );
  }

  const periodEnd = new Date(
    Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 0),
  );
  const tenancies = await prisma.tenancy.findMany({
    where: {
      monthlyRent: { gt: 0 },
      startDate: { lte: periodEnd },
      OR: [{ endDate: null }, { endDate: { gte: period } }],
      unit: { rentBillsEnabled: true },
    },
    select: {
      id: true,
      unitId: true,
      tenantId: true,
      startDate: true,
      monthlyRent: true,
      rentDueDay: true,
    },
  });

  const candidates = tenancies.map((tenancy) => {
    const scheduledDue = dueDateForMonth(period, tenancy.rentDueDay);
    return {
      tenancyId: tenancy.id,
      unitId: tenancy.unitId,
      tenantId: tenancy.tenantId,
      type: ChargeType.rent,
      title: `Rent · ${format(period, "MMMM yyyy")}`,
      amount: tenancy.monthlyRent,
      dueDate:
        tenancy.startDate > scheduledDue &&
        tenancy.startDate.getUTCMonth() === period.getUTCMonth() &&
        tenancy.startDate.getUTCFullYear() === period.getUTCFullYear()
          ? tenancy.startDate
          : scheduledDue,
      periodStart: period,
      rentKey: `${tenancy.id}:${period.toISOString().slice(0, 7)}`,
      createdById: admin.id,
    };
  });

  const existing = candidates.length
    ? await prisma.charge.findMany({
        where: { rentKey: { in: candidates.map((item) => item.rentKey) } },
        select: { rentKey: true },
      })
    : [];
  const existingKeys = new Set(existing.map((item) => item.rentKey));
  const newCharges = candidates.filter(
    (item) => !existingKeys.has(item.rentKey),
  );

  if (newCharges.length > 0) {
    await prisma.charge.createMany({ data: newCharges, skipDuplicates: true });

    const created = await prisma.charge.findMany({
      where: { rentKey: { in: newCharges.map((item) => item.rentKey) } },
      select: {
        id: true,
        tenantId: true,
        title: true,
        amount: true,
        dueDate: true,
        tenant: { select: { email: true, firstName: true, lastName: true } },
        unit: {
          select: {
            label: true,
            ownerId: true,
            property: {
              select: {
                name: true,
                propertyType: { select: { unitPrefix: true, hasFloors: true } },
              },
            },
          },
        },
      },
    });

    after(() => {
      const tenantIds = created.map((charge) => charge.tenantId);
      return Promise.allSettled([
        ...created.map((charge) =>
          pushChargeToDynamics({
            label: charge.title,
            tenantName:
              [charge.tenant.firstName, charge.tenant.lastName]
                .filter(Boolean)
                .join(" ") || charge.tenant.email,
            unitLabel: charge.unit
              ? formatUnitLabel(
                  charge.unit.property.propertyType,
                  charge.unit.label,
                )
              : "—",
            chargeType: "Rent",
            amount: formatMoney(charge.amount),
            dueDate: format(charge.dueDate, "yyyy-MM-dd"),
            status: "Open",
          }),
        ),
        ...created.map((charge) =>
          notifyTenantInvoice({
            tenantId: charge.tenantId,
            tenantName:
              [charge.tenant.firstName, charge.tenant.lastName]
                .filter(Boolean)
                .join(" ") || charge.tenant.email,
            propertyName: charge.unit?.property.name ?? "—",
            unitLabel: charge.unit
              ? formatUnitLabel(
                  charge.unit.property.propertyType,
                  charge.unit.label,
                )
              : "—",
            invoiceRef: charge.id,
            dueDate: format(charge.dueDate, "d MMMM yyyy"),
            href: financeBack(charge.id),
            lineItems: [
              { label: charge.title, amount: formatMoney(charge.amount) },
            ],
            total: formatMoney(charge.amount),
          }),
        ),
        ...created.map((charge) =>
          notifyOwnerChargeIssued({
            ownerId: charge.unit?.ownerId,
            chargeId: charge.id,
            kind: "rent",
            propertyName: charge.unit?.property.name ?? "—",
            unitLabel: charge.unit
              ? formatUnitLabel(
                  charge.unit.property.propertyType,
                  charge.unit.label,
                )
              : "—",
            tenantName:
              [charge.tenant.firstName, charge.tenant.lastName]
                .filter(Boolean)
                .join(" ") || charge.tenant.email,
            amount: formatMoney(charge.amount),
            dueDate: format(charge.dueDate, "d MMMM yyyy"),
            title: charge.title,
          }),
        ),
        publishFinance(tenantIds),
      ]).then((results) => {
        for (const result of results) {
          if (result.status === "rejected") {
            console.error(
              "Rent generation side effect failed:",
              result.reason,
            );
          }
        }
      });
    });
  }

  revalidatePath("/protected/finances");

  return encodedRedirect(
    "success",
    financesReturn(formData, "/protected/finances"),
    newCharges.length === 0
      ? "No rent was added. It was already generated or no tenancy has rent configured for that month."
      : `${newCharges.length} monthly rent charge${newCharges.length === 1 ? "" : "s"} generated.`,
  );
};

/* ── Payments and proof review ────────────────────────────────────────────── */

export const submitPaymentAction = async (formData: FormData) => {
  const user = await requireUser();
  const chargeId = formData.get("chargeId")?.toString();
  const amount = parsePositiveMoney(formData.get("amount"));
  const paidAt = parseDate(formData.get("paidAt")?.toString());
  const method = formData.get("method")?.toString();
  const reference = formData.get("reference")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;
  const receipt = formData.get("receipt");
  const collectedByRaw = formData.get("collectedBy")?.toString();
  const collectedBy = (
    Object.values(PaymentCollector) as string[]
  ).includes(collectedByRaw ?? "")
    ? (collectedByRaw as PaymentCollector)
    : PaymentCollector.management;
  const receivedByName =
    formData.get("receivedByName")?.toString().trim() || null;
  const transactionNumber =
    formData.get("transactionNumber")?.toString().trim() || null;
  const chequeNumber = formData.get("chequeNumber")?.toString().trim() || null;
  const chequeDate = parseDate(formData.get("chequeDate")?.toString());
  const bank = formData.get("bank")?.toString().trim() || null;
  const clearanceStatus =
    formData.get("clearanceStatus")?.toString().trim() || null;

  if (
    !chargeId ||
    !amount ||
    !paidAt ||
    !method ||
    !PAYMENT_METHODS.includes(method)
  ) {
    return encodedRedirect(
      "error",
      chargeReturn(formData, chargeId),
      "Complete the payment details correctly.",
    );
  }

  if (user.userType === UserType.worker) {
    return encodedRedirect(
      "error",
      "/protected",
      "Workers cannot access tenant finances.",
    );
  }

  const charge = await prisma.charge.findUnique({
    where: { id: chargeId },
    include: {
      tenant: { select: { email: true } },
      payments: { select: { amount: true, status: true } },
      unit: { select: { ownerId: true } },
    },
  });

  const isOwnPropertyOwner =
    user.userType === UserType.owner &&
    charge?.unit.ownerId === user.id;

  if (
    !charge ||
    (user.userType === UserType.user && charge.tenantId !== user.id) ||
    (user.userType === UserType.owner && !isOwnPropertyOwner)
  ) {
    return encodedRedirect("error", "/protected/finances", "Charge not found.");
  }

  if (charge.status !== ChargeStatus.open) {
    return encodedRedirect(
      "error",
      chargeReturn(formData, chargeId),
      "This charge is already closed.",
    );
  }

  const committed = charge.payments.reduce(
    (total, payment) =>
      payment.status === PaymentStatus.approved ||
      payment.status === PaymentStatus.pending
        ? total + Number(payment.amount)
        : total,
    0,
  );
  const available = Number(charge.amount) - committed;
  if (Number(amount) > available + 0.001) {
    return encodedRedirect(
      "error",
      chargeReturn(formData, chargeId),
      `Only OMR ${Math.max(0, available).toLocaleString("en-OM", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })} remains without a payment or pending proof.`,
    );
  }

  // Admins and an owner recording a payment on their own property can mark it
  // as paid outright, same as before — only a plain tenant needs proof.
  const isAdminStyleActor = isStaffAdmin(user.userType) || isOwnPropertyOwner;

  if (
    user.userType === UserType.user &&
    (!(receipt instanceof File) || receipt.size === 0)
  ) {
    return encodedRedirect(
      "error",
      chargeReturn(formData, chargeId),
      "Upload a receipt or payment screenshot for admin verification.",
    );
  }

  const paymentId = randomUUID();
  let uploaded: Awaited<ReturnType<typeof uploadFinancialDocument>> | null =
    null;

  if (receipt instanceof File && receipt.size > 0) {
    try {
      uploaded = await uploadFinancialDocument(receipt, paymentId);
    } catch (error) {
      unstable_rethrow(error);
      console.error("Receipt upload failed:", error);
      // The proof is the point of the submission, so nothing is recorded without it.
      return encodedRedirect(
        "error",
        chargeReturn(formData, chargeId),
        error instanceof Error ? error.message : "Receipt upload failed.",
      );
    }
  }

  const status = isAdminStyleActor
    ? PaymentStatus.approved
    : PaymentStatus.pending;

  const chargeFullyPaid = await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        id: paymentId,
        chargeId,
        amount,
        paidAt,
        method: method as PaymentMethod,
        reference,
        notes,
        status,
        collectedBy,
        receivedByName,
        transactionNumber,
        chequeNumber,
        chequeDate,
        bank,
        clearanceStatus,
        submittedById: user.id,
        reviewedById: isAdminStyleActor ? user.id : null,
        reviewedAt: isAdminStyleActor ? new Date() : null,
        attachments: uploaded
          ? {
              create: {
                kind: FinancialDocumentKind.receipt,
                fileName: uploaded.fileName,
                filePath: uploaded.objectKey,
                fileType: uploaded.fileType,
                fileSize: uploaded.fileSize,
                uploadedById: user.id,
              },
            }
          : undefined,
      },
    });

    if (status === PaymentStatus.approved) {
      const approved = await tx.payment.aggregate({
        where: { chargeId, status: PaymentStatus.approved },
        _sum: { amount: true },
      });
      if (Number(approved._sum.amount ?? 0) >= Number(charge.amount)) {
        await tx.charge.update({
          where: { id: chargeId },
          data: { status: ChargeStatus.paid },
        });
        return true;
      }
    }
    return false;
  });

  // The payment is committed by this point. Letting a failed notification throw
  // would show the tenant a server error over a payment that did in fact go
  // through, and they would submit the proof a second time.
  try {
    if (status === PaymentStatus.pending) {
      await notifyAdminsPaymentProof({
        chargeId,
        tenantEmail: charge.tenant.email,
        title: charge.title,
      });
      await notifyOwnerPaymentProof({
        ownerId: charge.unit.ownerId,
        chargeId,
        title: charge.title,
        tenantEmail: charge.tenant.email,
      });
    } else {
      // A tenant is never the one recording an admin-style payment, so this
      // is always an admin or the property's own owner acting — tell the
      // tenant either way.
      await notifyPaymentReviewed({
        tenantId: charge.tenantId,
        chargeId,
        title: charge.title,
        approved: true,
        ownerId: charge.unit.ownerId,
      });
    }

    if (chargeFullyPaid) {
      await notifyOwnerChargePaid({
        ownerId: charge.unit.ownerId,
        chargeId,
        title: charge.title,
        amount: `OMR ${Number(charge.amount).toFixed(3)}`,
        tenantEmail: charge.tenant.email,
      });
    }
  } catch (error) {
    console.error("Payment notification failed:", error);
  }

  await publishFinance([charge.tenantId]);
  revalidatePath(chargeReturn(formData, chargeId));
  revalidatePath("/protected/finances");

  return encodedRedirect(
    "success",
    chargeReturn(formData, chargeId),
    status === PaymentStatus.pending
      ? "Payment proof submitted. It will count as paid after admin approval."
      : "Payment account updated.",
  );
};

export const reviewPaymentAction = async (
  decision: "approve" | "reject",
  formData: FormData,
) => {
  const admin = await requireRole(UserType.admin);
  const paymentId = formData.get("paymentId")?.toString();
  const reviewNotes = formData.get("reviewNotes")?.toString().trim() || null;

  if (!paymentId || (decision !== "approve" && decision !== "reject")) {
    return encodedRedirect(
      "error",
      "/protected/finances",
      "Invalid review decision.",
    );
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      charge: {
        include: {
          payments: { select: { id: true, amount: true, status: true } },
          tenant: { select: { email: true } },
          unit: { select: { ownerId: true } },
        },
      },
    },
  });

  if (!payment || payment.status !== PaymentStatus.pending) {
    return encodedRedirect(
      "error",
      "/protected/finances",
      "Pending payment not found.",
    );
  }

  const approved = decision === "approve";
  if (approved) {
    const alreadyApproved = payment.charge.payments.reduce(
      (total, item) =>
        item.status === PaymentStatus.approved
          ? total + Number(item.amount)
          : total,
      0,
    );
    if (
      alreadyApproved + Number(payment.amount) >
      Number(payment.charge.amount) + 0.001
    ) {
      return encodedRedirect(
        "error",
        chargeReturn(formData, payment.chargeId),
        "This proof exceeds the remaining balance because another payment was approved first.",
      );
    }
  }

  const chargeFullyPaid = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: approved ? PaymentStatus.approved : PaymentStatus.rejected,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        reviewNotes,
      },
    });

    if (approved) {
      const total = await tx.payment.aggregate({
        where: { chargeId: payment.chargeId, status: PaymentStatus.approved },
        _sum: { amount: true },
      });
      if (Number(total._sum.amount ?? 0) >= Number(payment.charge.amount)) {
        await tx.charge.update({
          where: { id: payment.chargeId },
          data: { status: ChargeStatus.paid },
        });
        return true;
      }
    }
    return false;
  });

  if (!approved) {
    await prisma.rejectionLog.create({
      data: {
        kind: RejectionKind.payment,
        entityLabel: payment.charge.title,
        affectedUser: payment.charge.tenant.email,
        amount: payment.amount,
        reason: reviewNotes,
        rejectedById: admin.id,
      },
    });
  }

  // The review is committed by this point — don't let a notification failure
  // surface as an error over a decision that already went through.
  try {
    await notifyPaymentReviewed({
      tenantId: payment.charge.tenantId,
      chargeId: payment.chargeId,
      title: payment.charge.title,
      approved,
      reason: approved ? undefined : reviewNotes,
      ownerId: payment.charge.unit.ownerId,
    });

    if (chargeFullyPaid) {
      await notifyOwnerChargePaid({
        ownerId: payment.charge.unit.ownerId,
        chargeId: payment.chargeId,
        title: payment.charge.title,
        amount: `OMR ${Number(payment.charge.amount).toFixed(3)}`,
        tenantEmail: payment.charge.tenant.email,
      });
    }
  } catch (error) {
    console.error("Payment review notification failed:", error);
  }

  // Same rule as the notification above: the review already went through, so a Dynamics
  // outage or a bad credential must not surface as an error on the admin's approval.
  if (approved) {
    try {
      await pushPaymentToDynamics(paymentId);
    } catch (error) {
      console.error("Dynamics sync failed for payment:", paymentId, error);
    }
  }

  await publishFinance([payment.charge.tenantId]);
  revalidatePath(chargeReturn(formData, payment.chargeId));
  revalidatePath("/protected/finances");

  return encodedRedirect(
    "success",
    chargeReturn(formData, payment.chargeId),
    approved
      ? "Payment updated."
      : "Payment rejected. The tenant can submit new proof.",
  );
};

export const waiveChargeAction = async (formData: FormData) => {
  await requireRole(UserType.admin);
  const chargeId = formData.get("chargeId")?.toString();

  if (!chargeId) {
    return encodedRedirect("error", "/protected/finances", "Invalid charge.");
  }

  const charge = await prisma.charge.findUnique({
    where: { id: chargeId },
    include: {
      payments: { select: { status: true } },
      unit: { select: { ownerId: true } },
    },
  });
  if (!charge || charge.status !== ChargeStatus.open) {
    return encodedRedirect(
      "error",
      chargeReturn(formData, chargeId),
      "Open charge not found.",
    );
  }

  if (
    charge.payments.some(
      (payment) =>
        payment.status === PaymentStatus.approved ||
        payment.status === PaymentStatus.pending,
    )
  ) {
    return encodedRedirect(
      "error",
      chargeReturn(formData, chargeId),
      "A charge with approved or pending payments cannot be waived.",
    );
  }

  await prisma.charge.update({
    where: { id: chargeId },
    data: { status: ChargeStatus.waived },
  });

  try {
    await notifyChargeWaived({
      tenantId: charge.tenantId,
      ownerId: charge.unit.ownerId,
      chargeId,
      title: charge.title,
    });
  } catch (error) {
    console.error("Charge waived notification failed:", error);
  }

  await publishFinance([charge.tenantId]);
  revalidatePath(chargeReturn(formData, chargeId));
  revalidatePath("/protected/finances");

  return encodedRedirect("success", chargeReturn(formData, chargeId), "Charge waived.");
};

/** Re-sends the invoice email for a single charge, rebuilt fresh from the
 * charge's current data (so a corrected amount/due date is reflected) —
 * not a replay of the original email. Useful when a tenant says they never
 * got it, or their email address was wrong and has since been fixed. */
export const resendChargeInvoiceEmailAction = async (formData: FormData) => {
  await requireRole(UserType.admin);
  const chargeId = formData.get("chargeId")?.toString();

  if (!chargeId) {
    return encodedRedirect("error", "/protected/finances", "Charge not found.");
  }

  const charge = await prisma.charge.findUnique({
    where: { id: chargeId },
    include: {
      tenant: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      unit: { include: { property: { include: { propertyType: true } } } },
    },
  });

  if (!charge) {
    return encodedRedirect("error", "/protected/finances", "Charge not found.");
  }

  if (!charge.unit.rentBillsEnabled) {
    return encodedRedirect(
      "error",
      "/protected/finances",
      "Rent & bills are turned off for this unit — there's no invoice to resend.",
    );
  }

  try {
    await notifyTenantInvoice({
      tenantId: charge.tenantId,
      tenantName:
        [charge.tenant.firstName, charge.tenant.lastName]
          .filter(Boolean)
          .join(" ") || charge.tenant.email,
      propertyName: charge.unit.property.name,
      unitLabel: formatUnitLabel(
        charge.unit.property.propertyType,
        charge.unit.label,
      ),
      invoiceRef: charge.id,
      dueDate: format(charge.dueDate, "d MMMM yyyy"),
      href: financeBack(charge.id),
      lineItems: [{ label: charge.title, amount: formatMoney(charge.amount) }],
      total: formatMoney(charge.amount),
    });
  } catch (error) {
    console.error("Resend invoice email failed:", error);
    return encodedRedirect(
      "error",
      chargeReturn(formData, chargeId),
      "Could not resend the email. Try again.",
    );
  }

  return encodedRedirect(
    "success",
    chargeReturn(formData, chargeId),
    "Invoice email resent to the tenant.",
  );
};

/**
 * Spec #31 "Cheque Reminders" — a cheque stays in the action queue until
 * its outcome is recorded. This is the one action that records that
 * outcome, callable directly from the Cheque Reminders dashboard.
 */
export const updatePaymentClearanceAction = async (formData: FormData) => {
  await requireRole(UserType.admin);

  const paymentId = formData.get("paymentId")?.toString();
  const clearanceStatus = formData.get("clearanceStatus")?.toString();

  if (
    !paymentId ||
    !clearanceStatus ||
    !["pending", "cleared", "bounced"].includes(clearanceStatus)
  ) {
    return encodedRedirect(
      "error",
      "/protected/finances/cheque-reminders",
      "Invalid clearance status.",
    );
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      amount: true,
      chequeNumber: true,
      chargeId: true,
      charge: {
        select: {
          title: true,
          tenant: {
            select: { firstName: true, lastName: true, email: true },
          },
          unit: {
            select: {
              ownerId: true,
              label: true,
              property: {
                select: {
                  name: true,
                  propertyType: { select: { unitPrefix: true, hasFloors: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!payment) {
    return encodedRedirect(
      "error",
      "/protected/finances/cheque-reminders",
      "Payment not found.",
    );
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: { clearanceStatus },
  });

  if (clearanceStatus === "cleared" || clearanceStatus === "bounced") {
    const tenant = payment.charge.tenant;
    const tenantName =
      [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") ||
      tenant.email;
    try {
      await notifyOwnerChequeUpdate({
        ownerId: payment.charge.unit.ownerId,
        chargeId: payment.chargeId,
        propertyName: payment.charge.unit.property.name,
        unitLabel: formatUnitLabel(
          payment.charge.unit.property.propertyType,
          payment.charge.unit.label,
        ),
        tenantName,
        amount: formatMoney(payment.amount),
        chequeNumber: payment.chequeNumber,
        clearanceStatus,
      });
    } catch (error) {
      console.error("Owner cheque alert failed:", error);
    }
  }

  revalidatePath("/protected/finances/cheque-reminders");

  return encodedRedirect(
    "success",
    "/protected/finances/cheque-reminders",
    "Cheque status updated.",
  );
};
