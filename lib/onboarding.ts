import "server-only";

import { prisma } from "@/lib/prisma";

export type OnboardingChecklistItem =
  | "units"
  | "owner"
  | "serviceCharge"
  | "contract"
  | "gps"
  | "documents";

export const ONBOARDING_CHECKLIST_LABEL: Record<OnboardingChecklistItem, string> = {
  units: "Units added",
  owner: "Owner assigned",
  serviceCharge: "Service charge set",
  contract: "Contract on file",
  gps: "GPS location",
  documents: "Documents uploaded",
};

export type OnboardingStatus = "active" | "pending" | "rejected" | "draft";

export type OnboardingPropertyRow = {
  id: string;
  name: string;
  propertyTypeLabel: string;
  unitCount: number;
  unitsWithOwnerCount: number;
  unitsWithoutOwnerCount: number;
  /** The property-level checklist (units added / owner on every unit / GPS
   * / documents) — a pass/fail per item, not how far along any one of them
   * is. */
  progressPercent: number;
  /** How far along JUST the "every unit has an owner" item is, as its own
   * fraction — a property with 8 of 12 units owned is clearly further
   * along than one with 0 of 12, even though both fail the same checklist
   * item above. Null when the property has no units yet at all. */
  unitOwnerProgressPercent: number | null;
  missing: OnboardingChecklistItem[];
  status: OnboardingStatus;
};

export type OnboardingTotals = {
  activeCount: number;
  draftCount: number;
  readyToActivateCount: number;
  withoutOwnerCount: number;
  withoutGpsCount: number;
  unitsWithoutOwnerCount: number;
};

/**
 * The admin-facing "what's still missing before each property can go live"
 * dashboard — the checklist an owner-submitted (or admin-drafted) property
 * needs to clear before approvePropertyAction makes it visible everywhere.
 * `includeActive` widens every tally and the table below from "still in
 * draft" to the whole portfolio, for spotting an already-live property
 * that's still missing something (e.g. GPS).
 */
export async function getOnboardingData(includeActive: boolean): Promise<{
  rows: OnboardingPropertyRow[];
  totals: OnboardingTotals;
}> {
  const [activeCount, scopedProperties] = await Promise.all([
    prisma.property.count({ where: { approved: true } }),
    prisma.property.findMany({
      where: includeActive ? {} : { approved: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        approved: true,
        submittedAt: true,
        rejectedAt: true,
        latitude: true,
        longitude: true,
        propertyType: { select: { label: true } },
        units: {
          select: {
            ownerId: true,
            serviceChargeAmount: true,
            _count: { select: { documents: true } },
          },
        },
        _count: { select: { documents: true } },
      },
    }),
  ]);

  const totals: OnboardingTotals = {
    activeCount,
    draftCount: 0,
    readyToActivateCount: 0,
    withoutOwnerCount: 0,
    withoutGpsCount: 0,
    unitsWithoutOwnerCount: 0,
  };

  const rows: OnboardingPropertyRow[] = scopedProperties.map((property) => {
    const unitCount = property.units.length;
    const unitsWithoutOwnerCount = property.units.filter((u) => !u.ownerId).length;
    const unitsWithOwnerCount = unitCount - unitsWithoutOwnerCount;
    const unitsWithoutChargeCount = property.units.filter(
      (u) => !u.serviceChargeAmount,
    ).length;
    const unitsWithoutContractCount = property.units.filter(
      (u) => u._count.documents === 0,
    ).length;
    // Every unit needs its own owner, service charge and contract on
    // file — a property with even one unit still missing any of these
    // still counts as missing the item overall.
    const hasOwner = unitCount > 0 && unitsWithoutOwnerCount === 0;
    const hasServiceCharge = unitCount > 0 && unitsWithoutChargeCount === 0;
    const hasContract = unitCount > 0 && unitsWithoutContractCount === 0;
    const hasGps = property.latitude != null && property.longitude != null;
    const hasDocuments = property._count.documents > 0;
    const unitOwnerProgressPercent =
      unitCount === 0 ? null : Math.round((unitsWithOwnerCount / unitCount) * 100);

    const missing: OnboardingChecklistItem[] = [];
    if (unitCount === 0) missing.push("units");
    if (!hasOwner) missing.push("owner");
    if (!hasServiceCharge) missing.push("serviceCharge");
    if (!hasContract) missing.push("contract");
    if (!hasGps) missing.push("gps");
    if (!hasDocuments) missing.push("documents");

    const totalChecks = 6;
    const progressPercent = Math.round(
      ((totalChecks - missing.length) / totalChecks) * 100,
    );

    const status: OnboardingStatus = property.approved
      ? "active"
      : property.rejectedAt
        ? "rejected"
        : property.submittedAt
          ? "pending"
          : "draft";

    if (!property.approved) {
      totals.draftCount++;
      if (missing.length === 0) totals.readyToActivateCount++;
      if (!hasOwner) totals.withoutOwnerCount++;
      if (!hasGps) totals.withoutGpsCount++;
      totals.unitsWithoutOwnerCount += unitsWithoutOwnerCount;
    } else if (includeActive) {
      // Active properties only ever contribute to the finer per-unit tally
      // here — "Draft"/"Ready to activate" are meaningless once approved.
      if (!hasOwner) totals.withoutOwnerCount++;
      if (!hasGps) totals.withoutGpsCount++;
      totals.unitsWithoutOwnerCount += unitsWithoutOwnerCount;
    }

    return {
      id: property.id,
      name: property.name,
      propertyTypeLabel: property.propertyType.label,
      unitCount,
      unitsWithOwnerCount,
      unitsWithoutOwnerCount,
      progressPercent,
      unitOwnerProgressPercent,
      missing,
      status,
    };
  });

  return { rows, totals };
}

export type OnboardingBucketFilter =
  | "all"
  | "active"
  | "draft"
  | "readyToActivate"
  | "withoutOwner"
  | "withoutGps"
  | "unitsWithoutOwner";

/** Same "click a tile, filter the table" idiom as the Service Charge
 * Ledger and Collection Position dashboards. */
export function filterOnboardingRows(
  rows: OnboardingPropertyRow[],
  bucketFilter: OnboardingBucketFilter,
): OnboardingPropertyRow[] {
  return rows.filter((row) => {
    switch (bucketFilter) {
      case "all":
        return true;
      case "active":
        return row.status === "active";
      case "draft":
        return row.status !== "active";
      case "readyToActivate":
        return row.status !== "active" && row.missing.length === 0;
      case "withoutOwner":
        return row.missing.includes("owner");
      case "withoutGps":
        return row.missing.includes("gps");
      case "unitsWithoutOwner":
        return row.unitsWithoutOwnerCount > 0;
      default:
        return true;
    }
  });
}
