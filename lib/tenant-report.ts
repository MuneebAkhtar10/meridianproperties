import "server-only";

import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { UserType } from "@/lib/generated/prisma/client";
import type { SessionUser } from "@/lib/session";

export type TenantReportRow = {
  tenantName: string;
  contact: string;
  area: string;
  agreementNo: string;
  buildingName: string;
  unitNo: string;
  rentPerMonth: { toString(): string };
  startDate: Date;
  leaseEndDate: Date | null;
  status: "Active";
};

export type TenantReportData = {
  propertyName: string;
  /** An OA property never bills rent — the report's own "Scheduled monthly
   * rent" tile is meaningless there and should stay hidden. */
  isOwnerAssociation: boolean;
  rows: TenantReportRow[];
};

/** Every active tenancy in one property — the data behind both the on-screen
 * Tenant Report view and its PDF download, so the two can never disagree.
 * Returns null if the property doesn't exist, or (for an owner) isn't
 * theirs — same scoping the Tenancies page's own property filter uses. */
export async function getTenantReportData(
  propertyId: string,
  user: SessionUser,
): Promise<TenantReportData | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      name: true,
      area: true,
      buildingNumber: true,
      propertyType: { select: { isOwnerAssociation: true } },
    },
  });
  if (!property) return null;

  const isOwner = user.userType === UserType.owner;
  if (isOwner) {
    const ownsHere = await prisma.unit.findFirst({
      where: { propertyId, ownerId: user.id },
      select: { id: true },
    });
    if (!ownsHere) return null;
  }

  const tenancies = await prisma.tenancy.findMany({
    where: {
      endDate: null,
      unit: { propertyId, ...(isOwner ? { ownerId: user.id } : {}) },
    },
    orderBy: { startDate: "desc" },
    include: {
      tenant: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
      unit: { select: { label: true } },
    },
  });

  const buildingName = property.buildingNumber
    ? `${property.name} / ${property.buildingNumber}`
    : property.name;

  const rows: TenantReportRow[] = tenancies.map((tenancy) => ({
    tenantName:
      [tenancy.tenant.firstName, tenancy.tenant.lastName]
        .filter(Boolean)
        .join(" ") || tenancy.tenant.email,
    contact: tenancy.tenant.phone || tenancy.tenant.email,
    area: property.area ?? "-",
    agreementNo: tenancy.agreementRef ?? "-",
    buildingName,
    unitNo: tenancy.unit.label,
    rentPerMonth: tenancy.monthlyRent,
    startDate: tenancy.startDate,
    leaseEndDate: tenancy.leaseEndDate,
    status: "Active",
  }));

  return {
    propertyName: property.name,
    isOwnerAssociation: property.propertyType.isOwnerAssociation,
    rows,
  };
}

export type AgreementListRow = {
  id: string;
  buildingLabel: string;
  agreementNo: string;
  tenantName: string;
  contact: string;
  unitNo: string;
  advancePayment: { toString(): string };
  paymentPerMonth: { toString(): string };
  status: "Active" | "Ending soon" | "Ended";
  expiryDate: Date | null;
  propertyId: string;
};

const ENDING_SOON_WINDOW_DAYS = 30;

/** Spec #25 "Agreement List" — every tenancy (active and ended),
 * portfolio-wide by default, in the exact spec column shape. Shares the
 * same owner-scoping rule as getTenantReportData above. */
export async function getAgreementListData(
  propertyFilter: string,
  user: SessionUser,
  tenantFilter: string = "all",
): Promise<AgreementListRow[]> {
  const isOwner = user.userType === UserType.owner;

  const tenancies = await prisma.tenancy.findMany({
    where: {
      ...(propertyFilter !== "all" ? { unit: { propertyId: propertyFilter } } : {}),
      ...(tenantFilter !== "all" ? { tenantId: tenantFilter } : {}),
      ...(isOwner ? { unit: { ownerId: user.id } } : {}),
    },
    orderBy: [{ endDate: "asc" }, { startDate: "desc" }],
    include: {
      tenant: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
      unit: {
        select: {
          id: true,
          label: true,
          propertyId: true,
          property: {
            select: {
              name: true,
              buildingNumber: true,
              propertyType: { select: { unitPrefix: true, hasFloors: true } },
            },
          },
        },
      },
    },
  });

  const today = new Date();
  const endingSoonCutoff = new Date(
    today.getTime() + ENDING_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  return tenancies.map((tenancy) => {
    const status: AgreementListRow["status"] = tenancy.endDate
      ? "Ended"
      : tenancy.leaseEndDate && tenancy.leaseEndDate <= endingSoonCutoff
        ? "Ending soon"
        : "Active";

    return {
      id: tenancy.id,
      buildingLabel: tenancy.unit.property.buildingNumber
        ? `${tenancy.unit.property.name} / ${tenancy.unit.property.buildingNumber}`
        : tenancy.unit.property.name,
      agreementNo: tenancy.agreementRef ?? "-",
      tenantName:
        [tenancy.tenant.firstName, tenancy.tenant.lastName]
          .filter(Boolean)
          .join(" ") || tenancy.tenant.email,
      contact: tenancy.tenant.phone || tenancy.tenant.email,
      unitNo: formatUnitLabel(tenancy.unit.property.propertyType, tenancy.unit.label),
      advancePayment: tenancy.securityDeposit,
      paymentPerMonth: tenancy.monthlyRent,
      status,
      expiryDate: tenancy.leaseEndDate,
      propertyId: tenancy.unit.propertyId,
    };
  });
}
