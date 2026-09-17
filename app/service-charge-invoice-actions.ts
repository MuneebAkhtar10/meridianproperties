"use server";

import { revalidatePath } from "next/cache";

import { formatMoney, parseDate, parsePositiveMoney } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { notifyOwnerCustom } from "@/lib/notifications";
import { formatUnitLabel } from "@/lib/property-types";
import { encodedRedirect } from "@/utils/utils";
import { PaymentMethod, UserType } from "@/lib/generated/prisma/client";

/** Zero-padded to 7 digits, matching the reference invoice's numbering
 * ("0000804"). Backed by a real Postgres sequence so numbers never repeat
 * or collide, even with concurrent admins. */
async function nextInvoiceNumber(): Promise<string> {
  const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('service_charge_invoice_seq')
  `;
  return nextval.toString().padStart(7, "0");
}

/**
 * Generates one invoice against ONE fund's running balance (see
 * UnitFundBalance) — billing two funds in the same period means
 * generating two invoices, same as two real invoice numbers. Reads/writes
 * that fund's own balance row (creating it at 0 first if the unit has
 * never been billed against this fund before), and keeps
 * Unit.serviceChargeBalance (the maintained grand total across every
 * fund) moving by the exact same delta in the same transaction.
 */
export const generateServiceChargeInvoiceAction = async (
  formData: FormData,
) => {
  const admin = await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  const fundId = formData.get("fundId")?.toString();
  const periodStart = parseDate(formData.get("periodStart")?.toString());
  const periodEnd = parseDate(formData.get("periodEnd")?.toString());
  const issueDate = parseDate(formData.get("issueDate")?.toString());
  const dueDate = parseDate(formData.get("dueDate")?.toString());
  const graceDaysRaw = formData.get("graceDays")?.toString();
  const graceDays = graceDaysRaw ? Number(graceDaysRaw) : 0;
  const currentAmount = parsePositiveMoney(formData.get("currentAmount"));

  if (!unitId) {
    return encodedRedirect("error", "/protected/properties", "Invalid unit.");
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      propertyId: true,
      fundBalances: { select: { fundId: true, balance: true } },
    },
  });
  if (!unit) {
    return encodedRedirect("error", "/protected/properties", "Unit not found.");
  }

  const back = `/protected/properties/${unit.propertyId}`;

  if (!fundId) {
    return encodedRedirect("error", back, "Select which fund this invoice bills.");
  }
  if (!periodStart || !periodEnd || !issueDate || !dueDate) {
    return encodedRedirect("error", back, "Enter valid dates.");
  }
  if (periodEnd < periodStart) {
    return encodedRedirect(
      "error",
      back,
      "The period end can't be before its start.",
    );
  }
  if (!Number.isInteger(graceDays) || graceDays < 0) {
    return encodedRedirect("error", back, "Enter a valid grace period.");
  }
  if (!currentAmount) {
    return encodedRedirect("error", back, "Enter a valid invoice amount.");
  }

  // One invoice per fund per billed period — generating a second one for a
  // period that already overlaps an existing invoice would double-bill the
  // owner for the same stretch of time.
  const overlapping = await prisma.serviceChargeInvoice.findFirst({
    where: {
      unitId,
      fundId,
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart },
    },
    select: { invoiceNumber: true, periodStart: true, periodEnd: true },
  });
  if (overlapping) {
    return encodedRedirect(
      "error",
      back,
      `An invoice already covers this period — #${overlapping.invoiceNumber} (${overlapping.periodStart.toLocaleDateString("en-GB")}–${overlapping.periodEnd.toLocaleDateString("en-GB")}).`,
    );
  }

  const existingFundBalance = unit.fundBalances.find((b) => b.fundId === fundId);
  const previousBalance = existingFundBalance?.balance ?? 0;
  const closingBalance = Number(previousBalance) + Number(currentAmount);
  const amountPayable = Math.max(0, closingBalance);
  const totalDelta = Number(currentAmount);

  await prisma.$transaction([
    prisma.serviceChargeInvoice.create({
      data: {
        unitId,
        fundId,
        invoiceNumber: await nextInvoiceNumber(),
        issueDate,
        dueDate,
        graceDays,
        periodStart,
        periodEnd,
        previousBalance,
        currentAmount,
        amountPayable,
        closingBalance,
        createdById: admin.id,
        lines: {
          create: {
            fundId,
            description: "Service Charge",
            unitRate: currentAmount,
            qty: 1,
            total: currentAmount,
          },
        },
      },
    }),
    prisma.unitFundBalance.upsert({
      where: { unitId_fundId: { unitId, fundId } },
      create: { unitId, fundId, balance: closingBalance },
      update: { balance: closingBalance },
    }),
    // Generating the invoice is now the single "this cycle was billed"
    // event — it both updates the ledger and rolls the reminder schedule
    // forward to this invoice's own due date, replacing the old separate
    // "mark received" toggle.
    prisma.unit.update({
      where: { id: unitId },
      data: {
        serviceChargeBalance: { increment: totalDelta },
        serviceChargeDueDate: dueDate,
        serviceChargeLastStage: null,
        serviceChargeLastReceivedAt: issueDate,
      },
    }),
  ]);

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect("success", back, "Invoice generated.");
};

export type BulkServiceChargePreviewRow = {
  unitId: string;
  propertyName: string;
  unitLabel: string;
  ownerLabel: string;
  /** Defaults to the unit's own configured serviceChargeAmount — different
   * property types (and even different units of the same type) routinely
   * bill different amounts, so this is per-unit, not one flat figure for
   * the whole batch. Still editable before confirming. */
  amount: string;
  /** An invoice already exists for this fund with a period overlapping the
   * requested year — surfaced so an admin doesn't accidentally double-bill,
   * without silently hiding the unit from the batch either. */
  alreadyInvoiced: boolean;
};

/**
 * Builds the review list for a bulk "bill this whole year" run — every
 * eligible unit (has its own service charge amount set) matching the
 * chosen property/owner scope, with the exact amount that would be
 * charged. Called directly from the bulk-generate modal (not a form
 * action) so the admin can review and edit every line before anything is
 * actually created — see bulkGenerateServiceChargeInvoicesAction below.
 */
export async function previewBulkServiceChargeInvoicesAction(input: {
  year: number;
  fundId: string;
  propertyId: string;
  ownerId: string;
}): Promise<BulkServiceChargePreviewRow[]> {
  await requireRole(UserType.admin);

  const yearStart = new Date(Date.UTC(input.year, 0, 1));
  const yearEnd = new Date(Date.UTC(input.year, 11, 31));

  const units = await prisma.unit.findMany({
    where: {
      serviceChargeAmount: { gt: 0 },
      ...(input.propertyId !== "all" ? { propertyId: input.propertyId } : {}),
      ...(input.ownerId !== "all" ? { ownerId: input.ownerId } : {}),
    },
    orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
    select: {
      id: true,
      label: true,
      serviceChargeAmount: true,
      property: {
        select: {
          name: true,
          propertyType: { select: { unitPrefix: true, hasFloors: true } },
        },
      },
      owner: { select: { email: true, firstName: true, lastName: true } },
      serviceChargeInvoices: {
        where: {
          fundId: input.fundId,
          periodStart: { lte: yearEnd },
          periodEnd: { gte: yearStart },
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  return units.map((unit) => {
    const ownerName = unit.owner
      ? [unit.owner.firstName, unit.owner.lastName].filter(Boolean).join(" ")
      : "";
    return {
      unitId: unit.id,
      propertyName: unit.property.name,
      unitLabel: formatUnitLabel(unit.property.propertyType, unit.label),
      ownerLabel: unit.owner
        ? ownerName
          ? `${ownerName} (${unit.owner.email})`
          : unit.owner.email
        : "Unassigned",
      amount: String(unit.serviceChargeAmount),
      alreadyInvoiced: unit.serviceChargeInvoices.length > 0,
    };
  });
}

/**
 * Generates one invoice per reviewed row — same per-unit math as
 * generateServiceChargeInvoiceAction (previousBalance from that fund's own
 * running balance, so carry-forward still applies to every unit in the
 * batch), just repeated across the whole list the admin confirmed in the
 * bulk-generate modal. Runs each unit as its own transaction rather than
 * one giant one, so a single bad row can't roll back an otherwise-good
 * batch of a hundred units.
 */
export const bulkGenerateServiceChargeInvoicesAction = async (
  formData: FormData,
) => {
  const admin = await requireRole(UserType.admin);

  const back = "/protected/service-charge-ledger";

  const fundId = formData.get("fundId")?.toString();
  const year = Number(formData.get("year"));
  const dueDate = parseDate(formData.get("dueDate")?.toString());
  const graceDaysRaw = formData.get("graceDays")?.toString();
  const graceDays = graceDaysRaw ? Number(graceDaysRaw) : 0;
  const rowsRaw = formData.get("rows")?.toString();

  if (!fundId || !Number.isInteger(year) || !dueDate) {
    return encodedRedirect("error", back, "Missing bulk invoice details.");
  }
  if (!Number.isInteger(graceDays) || graceDays < 0) {
    return encodedRedirect("error", back, "Enter a valid grace period.");
  }

  let rows: { unitId: string; amount: string }[];
  try {
    rows = rowsRaw ? JSON.parse(rowsRaw) : [];
  } catch {
    return encodedRedirect("error", back, "Invalid selection.");
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return encodedRedirect("error", back, "Select at least one unit to invoice.");
  }

  const periodStart = new Date(Date.UTC(year, 0, 1));
  const periodEnd = new Date(Date.UTC(year, 11, 31));
  const issueDate = new Date();

  const existingBalances = await prisma.unitFundBalance.findMany({
    where: { unitId: { in: rows.map((r) => r.unitId) }, fundId },
    select: { unitId: true, balance: true },
  });
  const balanceByUnit = new Map(
    existingBalances.map((b) => [b.unitId, Number(b.balance)]),
  );

  // One invoice per fund per billed period — a row the admin left checked
  // despite the preview's "Already invoiced" badge still shouldn't
  // double-bill; skip it rather than fail the whole batch over it.
  const overlappingInvoices = await prisma.serviceChargeInvoice.findMany({
    where: {
      unitId: { in: rows.map((r) => r.unitId) },
      fundId,
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart },
    },
    select: { unitId: true },
  });
  const unitsAlreadyInvoiced = new Set(overlappingInvoices.map((i) => i.unitId));

  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    if (unitsAlreadyInvoiced.has(row.unitId)) {
      skipped++;
      continue;
    }

    const currentAmount = parsePositiveMoney(row.amount);
    if (!currentAmount) continue;

    const previousBalance = balanceByUnit.get(row.unitId) ?? 0;
    const closingBalance = previousBalance + Number(currentAmount);
    const amountPayable = Math.max(0, closingBalance);

    await prisma.$transaction([
      prisma.serviceChargeInvoice.create({
        data: {
          unitId: row.unitId,
          fundId,
          invoiceNumber: await nextInvoiceNumber(),
          issueDate,
          dueDate,
          graceDays,
          periodStart,
          periodEnd,
          previousBalance,
          currentAmount,
          amountPayable,
          closingBalance,
          createdById: admin.id,
          lines: {
            create: {
              fundId,
              description: "Service Charge",
              unitRate: currentAmount,
              qty: 1,
              total: currentAmount,
            },
          },
        },
      }),
      prisma.unitFundBalance.upsert({
        where: { unitId_fundId: { unitId: row.unitId, fundId } },
        create: { unitId: row.unitId, fundId, balance: closingBalance },
        update: { balance: closingBalance },
      }),
      prisma.unit.update({
        where: { id: row.unitId },
        data: {
          serviceChargeBalance: { increment: Number(currentAmount) },
          serviceChargeDueDate: dueDate,
          serviceChargeLastStage: null,
          serviceChargeLastReceivedAt: issueDate,
        },
      }),
    ]);

    balanceByUnit.set(row.unitId, closingBalance);
    created++;
  }

  revalidatePath(back);
  revalidatePath("/protected/properties");

  const skippedNote =
    skipped > 0
      ? ` Skipped ${skipped} unit${skipped === 1 ? "" : "s"} already invoiced for this period.`
      : "";

  return encodedRedirect(
    "success",
    back,
    `Generated ${created} invoice${created === 1 ? "" : "s"} for ${year}.${skippedNote}`,
  );
};

/**
 * Generates one invoice, using each unit's own configured service charge
 * amount, across a set of units an admin checked directly on the property
 * page — the same period/issue/due/grace applied to all of them, unlike
 * the portfolio-wide bulk generator above where the admin reviews/edits
 * each amount first. Skips (without failing the batch) any unit that has
 * no owner yet, has no service charge amount configured, or already has
 * an invoice covering an overlapping period.
 */
export const bulkGenerateUnitInvoicesAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const propertyId = formData.get("propertyId")?.toString();
  if (!propertyId) {
    return encodedRedirect("error", "/protected/properties", "Invalid property.");
  }
  const back = `/protected/properties/${propertyId}`;

  const unitIds = formData.getAll("unitIds").map((v) => v.toString());
  const periodStart = parseDate(formData.get("periodStart")?.toString());
  const periodEnd = parseDate(formData.get("periodEnd")?.toString());
  const issueDate = parseDate(formData.get("issueDate")?.toString());
  const dueDate = parseDate(formData.get("dueDate")?.toString());
  const graceDaysRaw = formData.get("graceDays")?.toString();
  const graceDays = graceDaysRaw ? Number(graceDaysRaw) : 0;

  if (unitIds.length === 0) {
    return encodedRedirect("error", back, "Select at least one unit to invoice.");
  }
  if (!periodStart || !periodEnd || !issueDate || !dueDate) {
    return encodedRedirect("error", back, "Enter valid dates.");
  }
  if (periodEnd < periodStart) {
    return encodedRedirect("error", back, "The period end can't be before its start.");
  }
  if (!Number.isInteger(graceDays) || graceDays < 0) {
    return encodedRedirect("error", back, "Enter a valid grace period.");
  }

  const fund = await prisma.fund.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!fund) {
    return encodedRedirect("error", back, "No fund is configured to bill against.");
  }
  const fundId = fund.id;

  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds }, propertyId },
    select: {
      id: true,
      ownerId: true,
      serviceChargeAmount: true,
      fundBalances: {
        where: { fundId },
        select: { balance: true },
      },
      serviceChargeInvoices: {
        where: {
          fundId,
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  let created = 0;
  let skippedNoOwner = 0;
  let skippedNoCharge = 0;
  let skippedOverlap = 0;

  for (const unit of units) {
    if (!unit.ownerId) {
      skippedNoOwner++;
      continue;
    }
    if (!unit.serviceChargeAmount || Number(unit.serviceChargeAmount) <= 0) {
      skippedNoCharge++;
      continue;
    }
    if (unit.serviceChargeInvoices.length > 0) {
      skippedOverlap++;
      continue;
    }

    const currentAmount = unit.serviceChargeAmount;
    const previousBalance = unit.fundBalances[0]?.balance ?? 0;
    const closingBalance = Number(previousBalance) + Number(currentAmount);
    const amountPayable = Math.max(0, closingBalance);

    await prisma.$transaction([
      prisma.serviceChargeInvoice.create({
        data: {
          unitId: unit.id,
          fundId,
          invoiceNumber: await nextInvoiceNumber(),
          issueDate,
          dueDate,
          graceDays,
          periodStart,
          periodEnd,
          previousBalance,
          currentAmount,
          amountPayable,
          closingBalance,
          createdById: admin.id,
          lines: {
            create: {
              fundId,
              description: "Service Charge",
              unitRate: currentAmount,
              qty: 1,
              total: currentAmount,
            },
          },
        },
      }),
      prisma.unitFundBalance.upsert({
        where: { unitId_fundId: { unitId: unit.id, fundId } },
        create: { unitId: unit.id, fundId, balance: closingBalance },
        update: { balance: closingBalance },
      }),
      prisma.unit.update({
        where: { id: unit.id },
        data: {
          serviceChargeBalance: { increment: Number(currentAmount) },
          serviceChargeDueDate: dueDate,
          serviceChargeLastStage: null,
          serviceChargeLastReceivedAt: issueDate,
        },
      }),
    ]);

    created++;
  }

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  const notes = [
    skippedNoOwner > 0
      ? `${skippedNoOwner} skipped (no owner assigned)`
      : null,
    skippedNoCharge > 0
      ? `${skippedNoCharge} skipped (no service charge set)`
      : null,
    skippedOverlap > 0
      ? `${skippedOverlap} skipped (already invoiced for this period)`
      : null,
  ].filter(Boolean);

  return encodedRedirect(
    "success",
    back,
    `Generated ${created} invoice${created === 1 ? "" : "s"}.${
      notes.length > 0 ? ` ${notes.join(", ")}.` : ""
    }`,
  );
};

/**
 * Records a payment/credit. When a fund is picked, that fund's own
 * UnitFundBalance row moves (created at 0 first if needed) alongside the
 * unit's total; left as "General balance" (no fund), only the total
 * moves — the same behavior installment-plan payments
 * (app/service-charge-installment-actions.ts) already rely on.
 */
export const recordServiceChargePaymentAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const unitId = formData.get("unitId")?.toString();
  const fundId = formData.get("fundId")?.toString() || null;
  const amount = parsePositiveMoney(formData.get("amount"));
  const paidAt = parseDate(formData.get("paidAt")?.toString());
  const note = formData.get("note")?.toString().trim() || null;
  const transactionNumber =
    formData.get("transactionNumber")?.toString().trim() || null;
  const paymentMethodRaw = formData.get("paymentMethod")?.toString();
  const paymentMethod = (
    Object.values(PaymentMethod) as string[]
  ).includes(paymentMethodRaw ?? "")
    ? (paymentMethodRaw as PaymentMethod)
    : null;
  const chequeNumber = formData.get("chequeNumber")?.toString().trim() || null;
  const chequeDate = parseDate(formData.get("chequeDate")?.toString());
  const bank = formData.get("bank")?.toString().trim() || null;
  const clearanceStatus =
    formData.get("clearanceStatus")?.toString().trim() || null;

  if (!unitId) {
    return encodedRedirect("error", "/protected/properties", "Invalid unit.");
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { propertyId: true },
  });
  if (!unit) {
    return encodedRedirect("error", "/protected/properties", "Unit not found.");
  }

  const back = `/protected/properties/${unit.propertyId}`;

  if (!amount || !paidAt) {
    return encodedRedirect(
      "error",
      back,
      "Enter a valid amount and date.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceChargePayment.create({
      data: {
        unitId,
        fundId,
        amount,
        paidAt,
        note,
        transactionNumber,
        paymentMethod,
        chequeNumber,
        chequeDate,
        bank,
        clearanceStatus,
        createdById: admin.id,
      },
    });
    await tx.unit.update({
      where: { id: unitId },
      data: { serviceChargeBalance: { decrement: Number(amount) } },
    });
    if (fundId) {
      await tx.unitFundBalance.upsert({
        where: { unitId_fundId: { unitId, fundId } },
        create: { unitId, fundId, balance: -Number(amount) },
        update: { balance: { decrement: Number(amount) } },
      });
    }
  });

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect("success", back, "Payment recorded.");
};

/**
 * Sends a previously-generated invoice to its unit's owner — the message
 * text is composed automatically from the invoice itself (amount, due
 * date), and the PDF is attached the same way every other owner-facing
 * document in this app is (a download link embedded in the notification;
 * see notifyOwnerCustom — this app's email sender has no real attachment
 * API). Replaces the old free-text "Notify Owner" button, which required
 * an admin to write the message and attach a file by hand every time.
 */
export const sendServiceChargeInvoiceAction = async (formData: FormData) => {
  const admin = await requireRole(UserType.admin);

  const invoiceId = formData.get("invoiceId")?.toString();
  if (!invoiceId) {
    return encodedRedirect("error", "/protected/properties", "Invalid invoice.");
  }

  const invoice = await prisma.serviceChargeInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      invoiceNumber: true,
      dueDate: true,
      amountPayable: true,
      unit: {
        select: {
          id: true,
          propertyId: true,
          label: true,
          ownerId: true,
          property: {
            select: { name: true, propertyType: { select: { unitPrefix: true, hasFloors: true } } },
          },
        },
      },
    },
  });
  if (!invoice) {
    return encodedRedirect("error", "/protected/properties", "Invoice not found.");
  }

  const { unit } = invoice;
  const back = `/protected/properties/${unit.propertyId}`;

  if (!unit.ownerId) {
    return encodedRedirect("error", back, "This unit has no owner to send to.");
  }

  const unitLabel = formatUnitLabel(unit.property.propertyType, unit.label);
  const admins = await prisma.user.findMany({
    where: { userType: UserType.admin, id: { not: admin.id } },
    select: { id: true },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const message = `Your service charge invoice ${invoice.invoiceNumber} for ${unitLabel} is ready — amount payable ${formatMoney(invoice.amountPayable)}, due ${invoice.dueDate.toLocaleDateString("en-GB")}.`;

  await notifyOwnerCustom({
    propertyId: unit.propertyId,
    propertyName: unit.property.name,
    unitLabel,
    message,
    attachmentUrl: `${appUrl}/api/service-charge-invoices/${invoiceId}/pdf`,
    recipientIds: [unit.ownerId, ...admins.map((a) => a.id)],
    title: "Service Charge Invoice",
  });

  await prisma.unit.update({
    where: { id: unit.id },
    data: { serviceChargeLastReminderAt: new Date() },
  });

  revalidatePath(back);
  revalidatePath("/protected/service-charge-ledger");

  return encodedRedirect("success", back, "Invoice sent to the owner.");
};
