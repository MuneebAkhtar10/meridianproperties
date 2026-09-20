import "server-only";

import { differenceInCalendarDays } from "date-fns";

import { ENTITY_DOCUMENT_CATEGORY_LABEL } from "@/lib/entity-documents";
import { formatUnitLabel } from "@/lib/property-types";
import { personDisplayName } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

export type ExpiryAlertKind =
  | "tenant_agreement"
  | "building_contract"
  | "document";

export type ExpiryAlert = {
  id: string;
  kind: ExpiryAlertKind;
  title: string;
  subtitle: string;
  endDate: Date;
  /** Negative = already expired that many days ago. */
  daysRemaining: number;
  href: string;
};

export type ExpiryBucket = "expired" | "7" | "15" | "30" | "60" | "90";

export const EXPIRY_BUCKET_LABEL: Record<ExpiryBucket, string> = {
  expired: "Expired",
  "7": "Due in 7 days",
  "15": "Due in 15 days",
  "30": "Due in 30 days",
  "60": "Due in 60 days",
  "90": "Due in 90 days",
};

/** Spec #9 "Agreement Expiry" — the 90/60/30/15/7-day reminder ladder. An
 * item's bucket is the *tightest* threshold it still falls within, so
 * something 12 days out shows as "Due in 15 days", not "Due in 30 days". */
export function expiryBucket(daysRemaining: number): ExpiryBucket {
  if (daysRemaining < 0) return "expired";
  if (daysRemaining <= 7) return "7";
  if (daysRemaining <= 15) return "15";
  if (daysRemaining <= 30) return "30";
  if (daysRemaining <= 60) return "60";
  return "90";
}

const LOOKAHEAD_DAYS = 90;

/** Every tenant agreement and building/supplier agreement expiring within
 * the reminder window, plus every one already expired — expired ones stay
 * on this list indefinitely (spec: "must remain visible... until renewed,
 * replaced or closed"), there's no cutoff that drops them. Shared between
 * the dashboard's compact widget and the full Agreement Expiry report. */
export async function getAgreementExpiryAlerts(): Promise<ExpiryAlert[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const [tenancies, contracts, documents] = await Promise.all([
    prisma.tenancy.findMany({
      where: { endDate: null, leaseEndDate: { lte: horizon } },
      select: {
        id: true,
        leaseEndDate: true,
        tenant: { select: { firstName: true, lastName: true, email: true } },
        unit: {
          select: {
            label: true,
            propertyId: true,
            property: {
              select: {
                name: true,
                propertyType: { select: { unitPrefix: true, hasFloors: true } },
              },
            },
          },
        },
      },
    }),
    prisma.buildingServiceContract.findMany({
      where: { endDate: { lte: horizon } },
      select: {
        id: true,
        endDate: true,
        contractType: true,
        propertyId: true,
        property: { select: { name: true } },
        supplier: { select: { companyName: true } },
      },
    }),
    // Any document with an expiry date — an ID, insurance policy, ownership
    // or tenancy contract, ... — feeds the same reminder ladder, regardless
    // of which of the four possible parents (property/unit/tenancy/user)
    // it's attached to.
    prisma.entityDocument.findMany({
      where: { expiresAt: { lte: horizon } },
      select: {
        id: true,
        label: true,
        category: true,
        expiresAt: true,
        property: { select: { id: true, name: true } },
        unit: {
          select: {
            propertyId: true,
            label: true,
            property: {
              select: {
                name: true,
                propertyType: { select: { unitPrefix: true, hasFloors: true } },
              },
            },
          },
        },
        tenancy: {
          select: {
            unit: {
              select: {
                propertyId: true,
                label: true,
                property: {
                  select: {
                    name: true,
                    propertyType: {
                      select: { unitPrefix: true, hasFloors: true },
                    },
                  },
                },
              },
            },
          },
        },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
  ]);

  const alerts: ExpiryAlert[] = [];

  for (const t of tenancies) {
    if (!t.leaseEndDate) continue;
    const tenantName =
      [t.tenant.firstName, t.tenant.lastName].filter(Boolean).join(" ") ||
      t.tenant.email;
    alerts.push({
      id: `tenancy-${t.id}`,
      kind: "tenant_agreement",
      title: tenantName,
      subtitle: `${t.unit.property.name} · ${formatUnitLabel(t.unit.property.propertyType, t.unit.label)}`,
      endDate: t.leaseEndDate,
      daysRemaining: differenceInCalendarDays(t.leaseEndDate, today),
      href: `/protected/tenancies?property=${t.unit.propertyId}`,
    });
  }

  for (const c of contracts) {
    if (!c.endDate) continue;
    alerts.push({
      id: `contract-${c.id}`,
      kind: "building_contract",
      title: c.contractType,
      subtitle: c.supplier
        ? `${c.property.name} · ${c.supplier.companyName}`
        : c.property.name,
      endDate: c.endDate,
      daysRemaining: differenceInCalendarDays(c.endDate, today),
      href: `/protected/properties/${c.propertyId}/building-contracts`,
    });
  }

  for (const d of documents) {
    if (!d.expiresAt) continue;
    const title = d.label || ENTITY_DOCUMENT_CATEGORY_LABEL[d.category];
    const unitContext = d.unit ?? d.tenancy?.unit;
    const subtitle = d.property
      ? d.property.name
      : unitContext
        ? `${unitContext.property.name} · ${formatUnitLabel(unitContext.property.propertyType, unitContext.label)}`
        : d.user
          ? personDisplayName(d.user)
          : "—";
    const href = d.property
      ? `/protected/properties/${d.property.id}`
      : unitContext
        ? `/protected/properties/${unitContext.propertyId}`
        : "/protected/users";
    alerts.push({
      id: `document-${d.id}`,
      kind: "document",
      title,
      subtitle,
      endDate: d.expiresAt,
      daysRemaining: differenceInCalendarDays(d.expiresAt, today),
      href,
    });
  }

  // Expired first (most recently expired first, so the newest problem is
  // the most visible), then upcoming ones soonest-first.
  alerts.sort((a, b) => {
    const aExpired = a.daysRemaining < 0;
    const bExpired = b.daysRemaining < 0;
    if (aExpired !== bExpired) return aExpired ? -1 : 1;
    return aExpired
      ? b.daysRemaining - a.daysRemaining
      : a.daysRemaining - b.daysRemaining;
  });

  return alerts;
}
