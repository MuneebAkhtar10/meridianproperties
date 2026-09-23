import "server-only";

import { format } from "date-fns";
import { randomUUID } from "crypto";

import { moneyValue } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { ChargeType, PaymentStatus } from "@/lib/generated/prisma/client";

export type ServicesInvoiceLineDraft = {
  qty: number;
  item: string;
  description: string;
  unitPrice: number;
};

export type ServicesInvoiceDraft = {
  propertyId: string;
  unitId: string;
  tenancyId: string | null;
  billedName: string;
  billedAddress: string;
  periodStart: Date;
  periodEnd: Date;
  lines: ServicesInvoiceLineDraft[];
  total: number;
};

function itemLabelForExpense(categoryName: string, categoryLabel: string): string {
  const haystack = `${categoryName} ${categoryLabel}`.toLowerCase();
  if (haystack.includes("maintenance")) return "Maintenance";
  return categoryLabel;
}

function billToAddress(parts: {
  area: string | null;
  wilayat: string | null;
  wayNumber: string | null;
  buildingNumber: string | null;
  unitLabel: string;
}): string {
  const locality = [parts.area, parts.wilayat].filter(Boolean).join("/");
  const way = parts.wayNumber ? `way #${parts.wayNumber}` : null;
  const line2 = [locality ? `${locality}` : null, way].filter(Boolean).join(", ");
  const line3 = [
    parts.buildingNumber ? `BLDG #${parts.buildingNumber}` : null,
    parts.unitLabel,
  ]
    .filter(Boolean)
    .join(", ");
  return [line2, line3].filter(Boolean).join("\n");
}

export async function assembleServicesInvoiceDraft(
  unitId: string,
  period: { from: Date; to: Date },
): Promise<ServicesInvoiceDraft | null> {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: {
      property: {
        select: {
          id: true,
          name: true,
          area: true,
          wilayat: true,
          wayNumber: true,
          buildingNumber: true,
          propertyType: {
            select: { unitPrefix: true, hasFloors: true },
          },
        },
      },
      owner: {
        select: { firstName: true, lastName: true, email: true },
      },
      tenant: {
        select: { firstName: true, lastName: true, email: true, companyName: true },
      },
      tenancies: {
        where: { OR: [{ endDate: null }, { endDate: { gte: period.from } }] },
        orderBy: { startDate: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!unit) return null;

  const unitLabel = formatUnitLabel(unit.property.propertyType, unit.label);
  const ownerName = unit.owner
    ? [unit.owner.firstName, unit.owner.lastName].filter(Boolean).join(" ").trim()
    : "";
  const tenantName = unit.tenant
    ? [unit.tenant.firstName, unit.tenant.lastName].filter(Boolean).join(" ").trim()
    : "";
  const tenantCompany = unit.tenant?.companyName?.trim() || "";
  const billedName = ownerName
    ? tenantCompany
      ? `${ownerName} (${tenantCompany})`
      : tenantName && tenantName !== ownerName
        ? `${ownerName} (${tenantName})`
        : ownerName
    : tenantName || tenantCompany || unit.property.name;

  const billedAddress = billToAddress({
    area: unit.property.area,
    wilayat: unit.property.wilayat,
    wayNumber: unit.property.wayNumber,
    buildingNumber: unit.property.buildingNumber,
    unitLabel,
  });

  const unitCount = await prisma.unit.count({
    where: { propertyId: unit.propertyId },
  });

  const expenseWhere =
    unitCount === 1
      ? {
          OR: [
            { units: { some: { unitId } } },
            { propertyId: unit.propertyId, units: { none: {} } },
          ],
        }
      : { units: { some: { unitId } } };

  const [expenses, rentPayments] = await Promise.all([
    prisma.expense.findMany({
      where: {
        ...expenseWhere,
        date: { gte: period.from, lte: period.to },
        ownerChargeMethod: "extra_charge",
        paidBy: { not: "owner" },
      },
      orderBy: { date: "asc" },
      select: {
        description: true,
        amount: true,
        vatAmount: true,
        category: { select: { name: true, label: true } },
      },
    }),
    prisma.payment.findMany({
      where: {
        status: PaymentStatus.approved,
        collectedBy: "management",
        paidAt: { gte: period.from, lte: period.to },
        charge: {
          unitId,
          type: ChargeType.rent,
        },
      },
      orderBy: { paidAt: "asc" },
      select: {
        amount: true,
        paidAt: true,
        charge: { select: { periodStart: true, title: true } },
      },
    }),
  ]);

  const lines: ServicesInvoiceLineDraft[] = [];

  for (const expense of expenses) {
    const amount = moneyValue(expense.amount) + moneyValue(expense.vatAmount);
    lines.push({
      qty: 1,
      item: itemLabelForExpense(expense.category.name, expense.category.label),
      description: expense.description.trim() || expense.category.label,
      unitPrice: amount,
    });
  }

  const rentByMonth = new Map<string, { amount: number; month: Date }>();
  for (const payment of rentPayments) {
    const monthDate = payment.charge.periodStart ?? payment.paidAt;
    const key = format(monthDate, "yyyy-MM");
    const existing = rentByMonth.get(key);
    const amount = moneyValue(payment.amount);
    if (existing) existing.amount += amount;
    else rentByMonth.set(key, { amount, month: monthDate });
  }
  for (const row of rentByMonth.values()) {
    lines.push({
      qty: 1,
      item: "Rent received",
      description: `For the month of ${format(row.month, "MMMM yyyy")}`,
      unitPrice: -row.amount,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);

  return {
    propertyId: unit.propertyId,
    unitId,
    tenancyId: unit.tenancies[0]?.id ?? null,
    billedName,
    billedAddress,
    periodStart: period.from,
    periodEnd: period.to,
    lines,
    total,
  };
}

async function ensureServicesInvoiceSchema() {
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS services_invoice_seq START 1`,
  );
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS services_invoices (
      id UUID NOT NULL,
      invoice_number INTEGER NOT NULL,
      property_id UUID NOT NULL,
      unit_id UUID NOT NULL,
      tenancy_id UUID,
      issue_date DATE NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      billed_name TEXT NOT NULL,
      billed_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'issued',
      total DECIMAL(14,3) NOT NULL,
      created_by UUID,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT services_invoices_pkey PRIMARY KEY (id)
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS services_invoices_invoice_number_key ON services_invoices (invoice_number)`,
  );
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS services_invoice_lines (
      id UUID NOT NULL,
      invoice_id UUID NOT NULL,
      sequence INTEGER NOT NULL,
      qty DECIMAL(10,2) NOT NULL DEFAULT 1,
      item TEXT NOT NULL,
      description TEXT NOT NULL,
      unit_price DECIMAL(14,3) NOT NULL,
      CONSTRAINT services_invoice_lines_pkey PRIMARY KEY (id)
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS services_invoice_lines_invoice_id_idx ON services_invoice_lines (invoice_id)`,
  );
}

async function nextInvoiceNumber(): Promise<number> {
  await ensureServicesInvoiceSchema();
  const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('services_invoice_seq')
  `;
  return Number(nextval);
}

export async function createServicesInvoice(
  unitId: string,
  period: { from: Date; to: Date },
  createdById: string | null,
) {
  const draft = await assembleServicesInvoiceDraft(unitId, period);
  if (!draft) return null;

  await ensureServicesInvoiceSchema();
  const invoiceNumber = await nextInvoiceNumber();

  return prisma.servicesInvoice.create({
    data: {
      id: randomUUID(),
      invoiceNumber,
      propertyId: draft.propertyId,
      unitId: draft.unitId,
      tenancyId: draft.tenancyId,
      issueDate: new Date(),
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      billedName: draft.billedName,
      billedAddress: draft.billedAddress,
      status: "issued",
      total: draft.total,
      createdById,
      lines: {
        create: draft.lines.map((line, index) => ({
          id: randomUUID(),
          sequence: index,
          qty: line.qty,
          item: line.item,
          description: line.description,
          unitPrice: line.unitPrice,
        })),
      },
    },
    include: { lines: { orderBy: { sequence: "asc" } } },
  });
}

export async function deleteServicesInvoice(invoiceId: string) {
  await ensureServicesInvoiceSchema();
  const existing = await prisma.servicesInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, invoiceNumber: true },
  });
  if (!existing) return null;
  await prisma.$transaction([
    prisma.servicesInvoiceLine.deleteMany({ where: { invoiceId } }),
    prisma.servicesInvoice.delete({ where: { id: invoiceId } }),
  ]);
  return existing;
}

export async function listServicesInvoices(propertyId: string) {
  await ensureServicesInvoiceSchema();
  return prisma.servicesInvoice.findMany({
    where: { propertyId },
    orderBy: { invoiceNumber: "desc" },
    include: {
      unit: {
        select: {
          label: true,
          property: {
            select: { propertyType: { select: { unitPrefix: true, hasFloors: true } } },
          },
        },
      },
    },
  });
}
