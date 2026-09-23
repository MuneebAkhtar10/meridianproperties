import "server-only";

import { format, startOfMonth, subMonths } from "date-fns";

import { getAgreementExpiryAlerts } from "@/lib/agreement-expiry";
import {
  NON_UTILITY_CHARGE_TYPES,
  chargeBalance,
  moneyValue,
} from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { serviceChargeTone } from "@/lib/service-charge-status";
import {
  ChargeStatus,
  PaymentStatus,
  RequestStatus,
  UserType,
} from "@/lib/generated/prisma/client";

export type CollectionMonth = {
  key: string;
  label: string;
  rent: number;
  serviceCharge: number;
  expenses: number;
};

export type AdminDashboardMetrics = {
  requestCounts: Record<RequestStatus, number>;
  openRequests: number;
  unitCount: number;
  occupiedCount: number;
  vacantCount: number;
  workerCount: number;
  propertyCount: number;
  activeTenancies: number;
  outstandingRent: number;
  pendingRentProofs: number;
  rentCollectedThisMonth: number;
  scheduledMonthlyRent: number;
  scPendingAmount: number;
  scPendingUnits: number;
  scOverdueUnits: number;
  scDueSoonUnits: number;
  scCollectedThisMonth: number;
  scActivePlans: number;
  expensesThisMonth: number;
  invoicesIssuedThisMonth: number;
  communicationsThisWeek: number;
  pendingApprovals: number;
  awaitingCheques: number;
  pendingSupplyRequests: number;
  collectionMonths: CollectionMonth[];
  expiryAlerts: Awaited<ReturnType<typeof getAgreementExpiryAlerts>>;
  properties: {
    id: string;
    name: string;
    occupied: number;
    units: number;
    openRequests: number;
  }[];
  recentRequests: {
    id: string;
    title: string;
    status: RequestStatus;
    email: string;
    location: string;
  }[];
};

function emptyRequestCounts(): Record<RequestStatus, number> {
  return {
    pending: 0,
    en_route: 0,
    in_progress: 0,
    on_hold: 0,
    completed: 0,
  };
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function countInvoicesThisMonth(monthStart: Date): Promise<number> {
  try {
    return await prisma.serviceChargeInvoice.count({
      where: { issueDate: { gte: monthStart } },
    });
  } catch {
    return 0;
  }
}

async function countCommunicationsThisWeek(): Promise<number> {
  const weekAgo = new Date();
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  try {
    return await prisma.communicationLog.count({
      where: { occurredAt: { gte: weekAgo } },
    });
  } catch {
    return 0;
  }
}

export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const trendStart = startOfMonth(subMonths(monthStart, 5));

  const [
    byStatus,
    properties,
    unitCount,
    occupiedCount,
    workerCount,
    recent,
    openCharges,
    pendingPayments,
    collectedThisMonth,
    scheduledMonthlyRent,
    expiryAlerts,
    pendingApprovals,
    awaitingRentCheques,
    awaitingServiceCharges,
    pendingSupplyRequests,
    scUnits,
    scCollectedThisMonth,
    scActivePlans,
    expensesThisMonth,
    activeTenancies,
    rentTrend,
    scTrend,
    expenseTrend,
    invoicesIssuedThisMonth,
  ] = await Promise.all([
    prisma.maintenanceRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.property.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { units: true } },
        units: {
          select: {
            tenantId: true,
            requests: {
              where: { status: { not: RequestStatus.completed } },
              select: { id: true },
            },
          },
        },
      },
    }),
    prisma.unit.count(),
    prisma.unit.count({ where: { tenantId: { not: null } } }),
    prisma.user.count({ where: { userType: UserType.worker } }),
    prisma.maintenanceRequest.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true } },
        unit: {
          include: {
            property: {
              select: {
                name: true,
                propertyType: { select: { hasFloors: true, unitPrefix: true } },
              },
            },
          },
        },
      },
    }),
    prisma.charge.findMany({
      where: {
        status: ChargeStatus.open,
        type: { in: NON_UTILITY_CHARGE_TYPES },
      },
      select: {
        amount: true,
        status: true,
        payments: { select: { amount: true, status: true } },
      },
    }),
    prisma.payment.count({
      where: {
        status: PaymentStatus.pending,
        charge: { type: { in: NON_UTILITY_CHARGE_TYPES } },
      },
    }),
    prisma.payment.aggregate({
      where: {
        status: PaymentStatus.approved,
        charge: { type: { in: NON_UTILITY_CHARGE_TYPES } },
        paidAt: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.tenancy.aggregate({
      where: { endDate: null },
      _sum: { monthlyRent: true },
    }),
    getAgreementExpiryAlerts(),
    prisma.property.count({
      where: { approved: false, submittedAt: { not: null } },
    }),
    prisma.payment.count({
      where: { method: "cheque", clearanceStatus: { not: "cleared" } },
    }),
    prisma.serviceChargePayment.count({
      where: { paymentMethod: "cheque", clearanceStatus: { not: "cleared" } },
    }),
    prisma.supplyRequest.count({ where: { status: "pending" } }),
    prisma.unit.findMany({
      where: { serviceChargeAmount: { not: null } },
      select: {
        serviceChargeAmount: true,
        serviceChargeDueDate: true,
        serviceChargeBalance: true,
      },
    }),
    prisma.serviceChargePayment.aggregate({
      where: { paidAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.serviceChargeInstallmentPlan.count({
      where: {
        cancelledAt: null,
        installments: { some: { paidAt: null } },
      },
    }),
    prisma.expense.aggregate({
      where: { date: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.tenancy.count({ where: { endDate: null } }),
    prisma.payment.findMany({
      where: {
        status: PaymentStatus.approved,
        charge: { type: { in: NON_UTILITY_CHARGE_TYPES } },
        paidAt: { gte: trendStart },
      },
      select: { amount: true, paidAt: true },
    }),
    prisma.serviceChargePayment.findMany({
      where: { paidAt: { gte: trendStart } },
      select: { amount: true, paidAt: true },
    }),
    prisma.expense.findMany({
      where: { date: { gte: trendStart } },
      select: { amount: true, date: true },
    }),
    countInvoicesThisMonth(monthStart),
  ]);

  const requestCounts = emptyRequestCounts();
  for (const row of byStatus) {
    requestCounts[row.status] = row._count._all;
  }

  const openRequests =
    requestCounts.pending +
    requestCounts.en_route +
    requestCounts.in_progress +
    requestCounts.on_hold;

  let scPendingAmount = 0;
  let scPendingUnits = 0;
  let scOverdueUnits = 0;
  let scDueSoonUnits = 0;
  for (const unit of scUnits) {
    const balance = moneyValue(unit.serviceChargeBalance);
    if (balance > 0) {
      scPendingAmount += balance;
      scPendingUnits += 1;
    }
    const tone = serviceChargeTone(unit);
    if (tone === "overdue") scOverdueUnits += 1;
    if (tone === "dueSoon") scDueSoonUnits += 1;
  }

  const collectionMonths: CollectionMonth[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const date = subMonths(monthStart, i);
    const key = monthKey(date);
    collectionMonths.push({
      key,
      label: format(date, "MMM"),
      rent: 0,
      serviceCharge: 0,
      expenses: 0,
    });
  }
  const monthIndex = new Map(collectionMonths.map((month, index) => [month.key, index]));
  for (const payment of rentTrend) {
    const index = monthIndex.get(monthKey(payment.paidAt));
    if (index == null) continue;
    collectionMonths[index].rent += moneyValue(payment.amount);
  }
  for (const payment of scTrend) {
    const index = monthIndex.get(monthKey(payment.paidAt));
    if (index == null) continue;
    collectionMonths[index].serviceCharge += moneyValue(payment.amount);
  }
  for (const expense of expenseTrend) {
    const index = monthIndex.get(monthKey(expense.date));
    if (index == null) continue;
    collectionMonths[index].expenses += moneyValue(expense.amount);
  }

  return {
    requestCounts,
    openRequests,
    unitCount,
    occupiedCount,
    vacantCount: Math.max(0, unitCount - occupiedCount),
    workerCount,
    propertyCount: properties.length,
    activeTenancies,
    outstandingRent: openCharges.reduce(
      (total, charge) => total + chargeBalance(charge),
      0,
    ),
    pendingRentProofs: pendingPayments,
    rentCollectedThisMonth: moneyValue(collectedThisMonth._sum.amount ?? 0),
    scheduledMonthlyRent: moneyValue(scheduledMonthlyRent._sum.monthlyRent ?? 0),
    scPendingAmount,
    scPendingUnits,
    scOverdueUnits,
    scDueSoonUnits,
    scCollectedThisMonth: moneyValue(scCollectedThisMonth._sum.amount ?? 0),
    scActivePlans,
    expensesThisMonth: moneyValue(expensesThisMonth._sum.amount ?? 0),
    invoicesIssuedThisMonth,
    communicationsThisWeek: await countCommunicationsThisWeek(),
    pendingApprovals,
    awaitingCheques: awaitingRentCheques + awaitingServiceCharges,
    pendingSupplyRequests,
    collectionMonths,
    expiryAlerts,
    properties: properties.map((property) => ({
      id: property.id,
      name: property.name,
      occupied: property.units.filter((unit) => unit.tenantId).length,
      units: property._count.units,
      openRequests: property.units.reduce(
        (sum, unit) => sum + unit.requests.length,
        0,
      ),
    })),
    recentRequests: recent.map((request) => ({
      id: request.id,
      title: request.title,
      status: request.status,
      email: request.user.email,
      location: request.unit
        ? `${request.unit.property.name} · ${formatUnitLabel(
            request.unit.property.propertyType,
            request.unit.label,
          )}`
        : "No unit",
    })),
  };
}
