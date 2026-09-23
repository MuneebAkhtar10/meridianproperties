import "server-only";

import { prisma } from "@/lib/prisma";
import { formatUnitLabel } from "@/lib/property-types";
import { moneyValue } from "@/lib/finance";
import { personDisplayName } from "@/lib/utils";
import {
  type InvoiceBucket,
  type InvoiceDisplayStatus,
  type InvoiceKind,
  type InvoiceStatus,
  isInvoiceKind,
  isInvoiceStatus,
} from "@/lib/invoice-options";

let schemaReady = false;

export async function ensureInvoiceColumns() {
  if (schemaReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE service_charge_invoices
      ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'service_charge'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE service_charge_invoices
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'issued'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE service_charge_invoices
      ADD COLUMN IF NOT EXISTS notes TEXT
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE service_charge_invoices
      ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP(3)
  `);
  schemaReady = true;
}

export type InvoiceListRow = {
  id: string;
  invoiceNumber: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  graceDays: number;
  periodStart: Date;
  periodEnd: Date;
  currentAmount: number;
  outstanding: number;
  displayStatus: InvoiceDisplayStatus;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
  ownerName: string;
  fundLabel: string;
  sentAt: Date | null;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function displayStatus(input: {
  status: InvoiceStatus;
  outstanding: number;
  currentAmount: number;
  dueDate: Date;
  graceDays: number;
  sentAt: Date | null;
  today: Date;
}): InvoiceListRow["displayStatus"] {
  if (input.status === "draft") return "draft";
  if (input.status === "void") return "void";
  if (input.outstanding <= 0.0005) return "paid";
  const overdueFrom = addDays(input.dueDate, input.graceDays);
  if (overdueFrom < input.today) return "overdue";
  if (input.outstanding + 0.0005 < input.currentAmount) return "partial";
  return input.sentAt ? "sent" : "issued";
}

export function allocateOutstanding(input: {
  invoices: {
    id: string;
    unitId: string;
    issueDate: Date;
    createdAt: Date;
    currentAmount: number;
    status: string;
  }[];
  payments: { unitId: string; paidAt: Date; amount: number }[];
}): Map<string, number> {
  const remaining = new Map<string, number>();
  const invoicesByUnit = new Map<string, typeof input.invoices>();
  for (const invoice of input.invoices) {
    const list = invoicesByUnit.get(invoice.unitId) ?? [];
    list.push(invoice);
    invoicesByUnit.set(invoice.unitId, list);
  }

  const paymentsByUnit = new Map<string, number>();
  for (const payment of input.payments) {
    paymentsByUnit.set(
      payment.unitId,
      (paymentsByUnit.get(payment.unitId) ?? 0) + payment.amount,
    );
  }

  for (const [unitId, invoices] of invoicesByUnit) {
    const ordered = [...invoices].sort((a, b) => {
      const byDate = a.issueDate.getTime() - b.issueDate.getTime();
      if (byDate !== 0) return byDate;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    let pool = paymentsByUnit.get(unitId) ?? 0;
    for (const invoice of ordered) {
      if (invoice.status !== "issued") {
        remaining.set(invoice.id, invoice.status === "draft" ? invoice.currentAmount : 0);
        continue;
      }
      const applied = Math.min(pool, invoice.currentAmount);
      pool = Math.max(0, pool - applied);
      remaining.set(invoice.id, Math.max(0, invoice.currentAmount - applied));
    }
  }

  return remaining;
}

export async function listOwnerInvoices(filters: {
  bucket?: InvoiceBucket;
  propertyId?: string;
  ownerId?: string;
  unitId?: string;
  kind?: InvoiceKind | "all";
  search?: string;
}): Promise<{
  rows: InvoiceListRow[];
  totals: {
    outstanding: number;
    overdueCount: number;
    draftCount: number;
    collectedThisYear: number;
    billedCount: number;
    billedAmount: number;
  };
}> {
  await ensureInvoiceColumns();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  const invoices = await prisma.serviceChargeInvoice.findMany({
    where: {
      ...(filters.propertyId ? { unit: { propertyId: filters.propertyId } } : {}),
      ...(filters.ownerId ? { billedOwnerId: filters.ownerId } : {}),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.kind && filters.kind !== "all" ? { kind: filters.kind } : {}),
    },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    include: {
      billedOwner: {
        select: { email: true, firstName: true, lastName: true },
      },
      fund: { select: { label: true } },
      unit: {
        select: {
          id: true,
          label: true,
          propertyId: true,
          owner: { select: { email: true, firstName: true, lastName: true } },
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

  const payments = await prisma.serviceChargePayment.findMany({
    select: { unitId: true, paidAt: true, amount: true },
  });

  const outstandingById = allocateOutstanding({
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      unitId: invoice.unitId,
      issueDate: invoice.issueDate,
      createdAt: invoice.createdAt,
      currentAmount: moneyValue(invoice.currentAmount),
      status: invoice.status,
    })),
    payments: payments.map((payment) => ({
      unitId: payment.unitId,
      paidAt: payment.paidAt,
      amount: moneyValue(payment.amount),
    })),
  });

  const unitIds = new Set(invoices.map((invoice) => invoice.unitId));
  const collectedThisYear = payments
    .filter(
      (payment) => payment.paidAt >= yearStart && unitIds.has(payment.unitId),
    )
    .reduce((sum, payment) => sum + moneyValue(payment.amount), 0);

  const search = filters.search?.trim().toLowerCase() ?? "";

  const rows: InvoiceListRow[] = invoices.map((invoice) => {
    const kind: InvoiceKind = isInvoiceKind(invoice.kind)
      ? invoice.kind
      : "service_charge";
    const status: InvoiceStatus = isInvoiceStatus(invoice.status)
      ? invoice.status
      : "issued";
    const currentAmount = moneyValue(invoice.currentAmount);
    const outstanding = outstandingById.get(invoice.id) ?? currentAmount;
    const owner =
      invoice.billedOwner ??
      invoice.unit.owner ??
      null;
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      kind,
      status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      graceDays: invoice.graceDays,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      currentAmount,
      outstanding: status === "issued" ? outstanding : status === "draft" ? currentAmount : 0,
      displayStatus: displayStatus({
        status,
        outstanding: status === "issued" ? outstanding : 0,
        currentAmount,
        dueDate: invoice.dueDate,
        graceDays: invoice.graceDays,
        sentAt: invoice.sentAt,
        today,
      }),
      propertyId: invoice.unit.propertyId,
      propertyName: invoice.unit.property.name,
      unitId: invoice.unit.id,
      unitLabel: formatUnitLabel(invoice.unit.property.propertyType, invoice.unit.label),
      ownerName: owner ? personDisplayName(owner) : "Unassigned owner",
      fundLabel: invoice.fund.label,
      sentAt: invoice.sentAt,
    };
  });

  const searched = search
    ? rows.filter((row) => {
        const haystack = [
          row.invoiceNumber,
          row.ownerName,
          row.propertyName,
          row.unitLabel,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
    : rows;

  const billed = searched.filter((row) => row.status === "issued");
  const totals = {
    outstanding: billed.reduce((sum, row) => sum + row.outstanding, 0),
    overdueCount: billed.filter((row) => row.displayStatus === "overdue").length,
    draftCount: searched.filter((row) => row.status === "draft").length,
    collectedThisYear,
    billedCount: billed.length,
    billedAmount: billed.reduce((sum, row) => sum + row.currentAmount, 0),
  };

  const bucket = filters.bucket ?? "open";
  const filtered = searched.filter((row) => {
    if (bucket === "all") return true;
    if (bucket === "drafts") return row.status === "draft";
    if (bucket === "billed") return row.status === "issued";
    if (bucket === "open" || bucket === "unpaid") {
      return row.status === "issued" && row.outstanding > 0.0005;
    }
    if (bucket === "overdue") return row.displayStatus === "overdue";
    if (bucket === "paid") return row.status === "issued" && row.outstanding <= 0.0005;
    return true;
  });

  return { rows: filtered, totals };
}

export async function nextInvoiceNumber(): Promise<string> {
  const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('service_charge_invoice_seq')
  `;
  return nextval.toString().padStart(7, "0");
}
