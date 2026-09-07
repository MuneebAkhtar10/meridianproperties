"use server";

import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import {
  notifyAdminsPaymentProof,
  notifyChargeWaived,
  notifyOwnerChargePaid,
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
import { publish } from "@/lib/realtime";
import { requireAnyRole, requireUser } from "@/lib/session";
import { uploadFinancialDocument } from "@/lib/storage";
import { encodedRedirect } from "@/utils/utils";
import {
  ChargeStatus,
  ChargeType,
  EntityDocumentCategory,
  FinancialDocumentKind,
  PaymentMethod,
  PaymentStatus,
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

function dueDateForMonth(period: Date, day: number): Date {
  return new Date(
    Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), Math.min(day, 28)),
  );
}

async function publishFinance(userIds: Array<string | null | undefined> = []) {
  await publish({
    kind: "finance",
    roles: [UserType.admin],
    userIds: userIds.filter((id): id is string => Boolean(id)),
  });
}

/* ── Tenancies ────────────────────────────────────────────────────────────── */

export const startTenancyAction = async (formData: FormData) => {
  const admin = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = admin.userType === UserType.owner;

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
  const contractRegisteredAt = parseDate(
    formData.get("contractRegisteredAt")?.toString(),
  );
  const agreementDocuments = uploadedFiles(
    formData,
    "tenancyAgreementDocuments",
  );
  const municipalityDocuments = uploadedFiles(
    formData,
    "municipalityDocuments",
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
            ownerId: true,
            propertyType: { select: { unitPrefix: true } },
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

  if (
    !unit ||
    !tenant ||
    tenant.userType !== UserType.user ||
    (isOwner && unit.property.ownerId !== admin.id)
  ) {
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
        contractRegisteredAt,
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

  // The tenant has a home now — a rich welcome email with the lease specifics,
  // not just a bare "you were assigned" line. Not worth failing the whole
  // tenancy creation over a notification hiccup.
  try {
    await notifyTenantAssigned({
      tenantId,
      propertyName: unit.property.name,
      unitLabel,
      moveInDate: format(startDate, "d MMMM yyyy"),
      monthlyRent: formatMoney(monthlyRent),
      rentDueDay,
      securityDeposit:
        Number(securityDeposit) > 0 ? formatMoney(securityDeposit) : undefined,
      leaseEndDate: leaseEndDate ? format(leaseEndDate, "d MMMM yyyy") : undefined,
    });
  } catch (error) {
    console.error("Tenant-assigned notification failed:", error);
  }

  // First-move-in charges exist now — send one combined invoice rather than
  // a separate email per charge.
  if (tenancy.createdCharges.length > 0) {
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
    roles: [UserType.admin],
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
  const actor = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = actor.userType === UserType.owner;

  const tenancyId = formData.get("tenancyId")?.toString();
  const startDate = parseDate(formData.get("startDate")?.toString());
  const leaseEndDate = parseDate(formData.get("leaseEndDate")?.toString());
  const monthlyRent = parseNonNegativeMoney(formData.get("monthlyRent"));
  const securityDeposit = parseNonNegativeMoney(
    formData.get("securityDeposit"),
  );
  const rentDueDay = Number(formData.get("rentDueDay"));
  const purpose = formData.get("purpose")?.toString();
  const contractRegisteredAt = parseDate(
    formData.get("contractRegisteredAt")?.toString(),
  );
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

  if (isOwner) {
    const owned = await prisma.tenancy.findFirst({
      where: { id: tenancyId, unit: { property: { ownerId: actor.id } } },
      select: { id: true },
    });
    if (!owned) {
      return encodedRedirect(
        "error",
        "/protected/tenancies",
        "Tenancy not found.",
      );
    }
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
      contractRegisteredAt,
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

export const endTenancyAction = async (formData: FormData) => {
  const actor = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = actor.userType === UserType.owner;

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
    include: { unit: { select: { property: { select: { ownerId: true } } } } },
  });
  if (
    !tenancy ||
    tenancy.endDate ||
    (isOwner && tenancy.unit.property.ownerId !== actor.id)
  ) {
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
    roles: [UserType.admin],
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
  const admin = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = admin.userType === UserType.owner;

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
      "/protected/finances",
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
          property: {
            select: {
              ownerId: true,
              name: true,
              propertyType: { select: { unitPrefix: true } },
            },
          },
        },
      },
    },
  });

  if (
    !tenancy ||
    (isOwner && tenancy.unit.property.ownerId !== admin.id)
  ) {
    return encodedRedirect(
      "error",
      "/protected/finances",
      "Tenancy not found.",
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

  // The charge exists now. A failed notification is not worth an error page that
  // reads as "nothing was saved" and invites a duplicate charge.
  try {
    await notifyTenantInvoice({
      tenantId: tenancy.tenantId,
      tenantName:
        [tenancy.tenant.firstName, tenancy.tenant.lastName]
          .filter(Boolean)
          .join(" ") || tenancy.tenant.email,
      propertyName: tenancy.unit.property.name,
      unitLabel: formatUnitLabel(
        tenancy.unit.property.propertyType,
        tenancy.unit.label,
      ),
      invoiceRef: charge.id,
      dueDate: format(dueDate, "d MMMM yyyy"),
      href: `/protected/finances/${charge.id}`,
      lineItems: [{ label: title, amount: formatMoney(amount) }],
      total: formatMoney(amount),
    });
  } catch (error) {
    console.error("Charge notification failed:", error);
  }

  await publishFinance([tenancy.tenantId]);
  revalidatePath("/protected/finances");

  return encodedRedirect(
    uploadError ? "error" : "success",
    financeBack(charge.id),
    uploadError
      ? `Charge created, but the bill was not attached: ${uploadError}`
      : "Charge created and sent to the tenant ledger.",
  );
};

export const generateRentChargesAction = async (formData: FormData) => {
  const admin = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = admin.userType === UserType.owner;
  const period = monthStart(formData.get("month")?.toString() || "");

  if (!period) {
    return encodedRedirect(
      "error",
      "/protected/finances",
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
      ...(isOwner ? { unit: { property: { ownerId: admin.id } } } : {}),
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
            property: {
              select: {
                name: true,
                propertyType: { select: { unitPrefix: true } },
              },
            },
          },
        },
      },
    });

    // One invoice email per tenant — best-effort, run in parallel; a failed
    // send for one tenant shouldn't stop the others or fail the bulk action.
    await Promise.allSettled(
      created.map((charge) =>
        notifyTenantInvoice({
          tenantId: charge.tenantId,
          tenantName:
            [charge.tenant.firstName, charge.tenant.lastName]
              .filter(Boolean)
              .join(" ") || charge.tenant.email,
          propertyName: charge.unit?.property.name ?? "—",
          unitLabel: charge.unit
            ? formatUnitLabel(charge.unit.property.propertyType, charge.unit.label)
            : "—",
          invoiceRef: charge.id,
          dueDate: format(charge.dueDate, "d MMMM yyyy"),
          href: financeBack(charge.id),
          lineItems: [{ label: charge.title, amount: formatMoney(charge.amount) }],
          total: formatMoney(charge.amount),
        }),
      ),
    );
  }

  await publishFinance(newCharges.map((charge) => charge.tenantId));
  revalidatePath("/protected/finances");

  return encodedRedirect(
    "success",
    "/protected/finances",
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

  if (
    !chargeId ||
    !amount ||
    !paidAt ||
    !method ||
    !PAYMENT_METHODS.includes(method)
  ) {
    return encodedRedirect(
      "error",
      financeBack(chargeId),
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
      unit: { select: { property: { select: { ownerId: true } } } },
    },
  });

  const isOwnPropertyOwner =
    user.userType === UserType.owner &&
    charge?.unit.property.ownerId === user.id;

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
      financeBack(chargeId),
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
      financeBack(chargeId),
      `Only OMR ${Math.max(0, available).toLocaleString("en-OM", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })} remains without a payment or pending proof.`,
    );
  }

  // Admins and an owner recording a payment on their own property can mark it
  // as paid outright, same as before — only a plain tenant needs proof.
  const isAdminStyleActor = user.userType === UserType.admin || isOwnPropertyOwner;

  if (
    user.userType === UserType.user &&
    (!(receipt instanceof File) || receipt.size === 0)
  ) {
    return encodedRedirect(
      "error",
      financeBack(chargeId),
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
        financeBack(chargeId),
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
        ownerId: charge.unit.property.ownerId,
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
      });
    }

    if (chargeFullyPaid) {
      await notifyOwnerChargePaid({
        ownerId: charge.unit.property.ownerId,
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
  revalidatePath(financeBack(chargeId));
  revalidatePath("/protected/finances");

  return encodedRedirect(
    "success",
    financeBack(chargeId),
    status === PaymentStatus.pending
      ? "Payment proof submitted. It will count as paid after admin approval."
      : "Payment account updated.",
  );
};

export const reviewPaymentAction = async (
  decision: "approve" | "reject",
  formData: FormData,
) => {
  const admin = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = admin.userType === UserType.owner;
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
          unit: { select: { property: { select: { ownerId: true } } } },
        },
      },
    },
  });

  if (
    !payment ||
    payment.status !== PaymentStatus.pending ||
    (isOwner && payment.charge.unit.property.ownerId !== admin.id)
  ) {
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
        financeBack(payment.chargeId),
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

  // The review is committed by this point — don't let a notification failure
  // surface as an error over a decision that already went through.
  try {
    await notifyPaymentReviewed({
      tenantId: payment.charge.tenantId,
      chargeId: payment.chargeId,
      title: payment.charge.title,
      approved,
    });

    if (chargeFullyPaid) {
      await notifyOwnerChargePaid({
        ownerId: payment.charge.unit.property.ownerId,
        chargeId: payment.chargeId,
        title: payment.charge.title,
        amount: `OMR ${Number(payment.charge.amount).toFixed(3)}`,
        tenantEmail: payment.charge.tenant.email,
      });
    }
  } catch (error) {
    console.error("Payment review notification failed:", error);
  }

  await publishFinance([payment.charge.tenantId]);
  revalidatePath(financeBack(payment.chargeId));
  revalidatePath("/protected/finances");

  return encodedRedirect(
    "success",
    financeBack(payment.chargeId),
    approved
      ? "Payment updated."
      : "Payment rejected. The tenant can submit new proof.",
  );
};

export const waiveChargeAction = async (formData: FormData) => {
  const actor = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = actor.userType === UserType.owner;
  const chargeId = formData.get("chargeId")?.toString();

  if (!chargeId) {
    return encodedRedirect("error", "/protected/finances", "Invalid charge.");
  }

  const charge = await prisma.charge.findUnique({
    where: { id: chargeId },
    include: {
      payments: { select: { status: true } },
      unit: { select: { property: { select: { ownerId: true } } } },
    },
  });
  if (
    !charge ||
    charge.status !== ChargeStatus.open ||
    (isOwner && charge.unit.property.ownerId !== actor.id)
  ) {
    return encodedRedirect(
      "error",
      financeBack(chargeId),
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
      financeBack(chargeId),
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
      ownerId: charge.unit.property.ownerId,
      chargeId,
      title: charge.title,
    });
  } catch (error) {
    console.error("Charge waived notification failed:", error);
  }

  await publishFinance([charge.tenantId]);
  revalidatePath(financeBack(chargeId));
  revalidatePath("/protected/finances");

  return encodedRedirect("success", financeBack(chargeId), "Charge waived.");
};
