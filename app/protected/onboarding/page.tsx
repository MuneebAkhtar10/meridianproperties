import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  MapPinOff,
  UserRoundX,
  Users2,
} from "lucide-react";

import { approvePropertyAction } from "@/app/admin-actions";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { SummaryTile } from "@/components/summary-tile";
import { ButtonLink } from "@/components/ui/button-link";
import { PendingLink } from "@/components/ui/pending-link";
import {
  filterOnboardingRows,
  getOnboardingData,
  ONBOARDING_CHECKLIST_LABEL,
  type OnboardingBucketFilter,
  type OnboardingStatus,
} from "@/lib/onboarding";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const STATUS_BADGE: Record<OnboardingStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700" },
  pending: { label: "Pending approval", className: "bg-amber-50 text-amber-700" },
  rejected: { label: "Rejected", className: "bg-rose-50 text-rose-700" },
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
};

/**
 * "What's still missing before each property can go live" — the checklist
 * an owner-submitted (or admin-drafted) property needs to clear before
 * approvePropertyAction makes it visible everywhere. Second nav item after
 * Dashboard, since it's the first thing worth checking each morning.
 */
export default async function OnboardingPage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);

  const rawParams = (await searchParams) as unknown as {
    includeActive?: string;
    bucket?: string;
  };
  // Shows the whole portfolio by default — ?includeActive=0 is the only way
  // to narrow down to just-drafts, since most days there's more value in
  // seeing every property (including already-active ones still missing an
  // owner or GPS) than in a draft-only queue.
  const includeActive = rawParams.includeActive !== "0";
  const bucketFilter = (rawParams.bucket ?? "all") as OnboardingBucketFilter;

  const { rows: allRows, totals } = await getOnboardingData(
    includeActive || bucketFilter === "active",
  );
  const rows = filterOnboardingRows(allRows, bucketFilter);

  const toggleHref = includeActive
    ? "/protected/onboarding?includeActive=0"
    : "/protected/onboarding";

  const buildBucketHref = (
    next: Partial<{ bucket: OnboardingBucketFilter; includeActive: boolean }>,
  ) => {
    const bucket = next.bucket ?? bucketFilter;
    // The "Active" tile only ever has anything to show once active
    // properties are actually in scope — force that scope on for it,
    // same as the data fetch above does.
    const nextIncludeActive =
      next.includeActive ?? (bucket === "active" ? true : includeActive);
    const query = new URLSearchParams();
    if (bucket !== "all") query.set("bucket", bucket);
    if (!nextIncludeActive) query.set("includeActive", "0");
    const qs = query.toString();
    return `/protected/onboarding${qs ? `?${qs}` : ""}`;
  };

  // Carries the reason an admin came here over into the property page's own
  // unit filters — clicking through on a property that's still missing an
  // owner on one of its units should land straight on the unassigned units,
  // not require re-filtering by hand. The property page's Owner select
  // already understands ?owner=unassigned (see
  // app/protected/properties/[id]/page.tsx's ownerFilter).
  const propertyHref = (propertyId: string, unitsWithoutOwnerCount: number) =>
    unitsWithoutOwnerCount > 0
      ? `/protected/properties/${propertyId}?owner=unassigned`
      : `/protected/properties/${propertyId}`;

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Onboarding"
        description="What's still missing before each property can go live — units, an owner, GPS location and documents."
      >
        <ButtonLink href={toggleHref} variant="outline">
          {includeActive ? "Draft properties only" : "Show all properties"}
        </ButtonLink>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          value={totals.activeCount}
          label="Active"
          accent="bg-emerald-500"
          iconBg="bg-emerald-50 text-emerald-600"
          href={buildBucketHref({ bucket: bucketFilter === "active" ? "all" : "active" })}
          active={bucketFilter === "active"}
        />
        <SummaryTile
          icon={<ClipboardList className="h-4 w-4" />}
          value={totals.draftCount}
          label="Draft"
          accent="bg-slate-400"
          iconBg="bg-slate-50 text-slate-600"
          href={buildBucketHref({ bucket: bucketFilter === "draft" ? "all" : "draft" })}
          active={bucketFilter === "draft"}
        />
        <SummaryTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          value={totals.readyToActivateCount}
          label="Ready to activate"
          accent="bg-indigo-500"
          iconBg="bg-indigo-50 text-indigo-600"
          href={buildBucketHref({
            bucket: bucketFilter === "readyToActivate" ? "all" : "readyToActivate",
          })}
          active={bucketFilter === "readyToActivate"}
        />
        <SummaryTile
          icon={<UserRoundX className="h-4 w-4" />}
          value={totals.withoutOwnerCount}
          label="Without owner"
          accent="bg-rose-500"
          iconBg="bg-rose-50 text-rose-600"
          href={buildBucketHref({
            bucket: bucketFilter === "withoutOwner" ? "all" : "withoutOwner",
          })}
          active={bucketFilter === "withoutOwner"}
        />
        <SummaryTile
          icon={<MapPinOff className="h-4 w-4" />}
          value={totals.withoutGpsCount}
          label="Without GPS"
          accent="bg-amber-500"
          iconBg="bg-amber-50 text-amber-600"
          href={buildBucketHref({
            bucket: bucketFilter === "withoutGps" ? "all" : "withoutGps",
          })}
          active={bucketFilter === "withoutGps"}
        />
        <SummaryTile
          icon={<Users2 className="h-4 w-4" />}
          value={totals.unitsWithoutOwnerCount}
          label="Units without owner"
          accent="bg-sky-500"
          iconBg="bg-sky-50 text-sky-600"
          href={buildBucketHref({
            bucket: bucketFilter === "unitsWithoutOwner" ? "all" : "unitsWithoutOwner",
          })}
          active={bucketFilter === "unitsWithoutOwner"}
        />
      </div>

      {bucketFilter !== "all" && (
        <PendingLink
          href={buildBucketHref({ bucket: "all", includeActive })}
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          Clear filter
        </PendingLink>
      )}

      <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">
          {includeActive ? "All properties" : "Properties to finish"}
        </h2>
        <p className="text-xs text-muted-foreground">
          Every unit should have its own owner — the Unit Owners column
          tracks that separately from the property-level checklist, since a
          property can be otherwise fully set up while some of its units
          still aren&rsquo;t assigned.
        </p>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 py-10 text-center">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Every property is fully set up — nothing left to finish.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Property</th>
                  <th className="px-3 py-2">Progress</th>
                  <th className="px-3 py-2">Unit Owners</th>
                  <th className="px-3 py-2">Missing</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => {
                  const badge = STATUS_BADGE[row.status];
                  return (
                    <tr key={row.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5 align-top">
                        <a
                          href={propertyHref(row.id, row.unitsWithoutOwnerCount)}
                          className="font-medium text-foreground hover:underline"
                        >
                          {row.name}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {row.propertyTypeLabel} · {row.unitCount} unit
                          {row.unitCount === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${row.progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">
                            {row.progressPercent}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {row.unitOwnerProgressPercent == null ? (
                          <span className="text-xs text-muted-foreground">
                            No units yet
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${
                                  row.unitOwnerProgressPercent === 100
                                    ? "bg-emerald-500"
                                    : "bg-rose-500"
                                }`}
                                style={{ width: `${row.unitOwnerProgressPercent}%` }}
                              />
                            </div>
                            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                              {row.unitsWithOwnerCount}/{row.unitCount}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {row.missing.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.missing.map((item) => (
                              <span
                                key={item}
                                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                              >
                                {ONBOARDING_CHECKLIST_LABEL[item]}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {row.status === "active" ? (
                          <a
                            href={propertyHref(row.id, row.unitsWithoutOwnerCount)}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Manage
                          </a>
                        ) : (
                          <div className="flex items-center gap-2">
                            <a
                              href={propertyHref(row.id, row.unitsWithoutOwnerCount)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Manage
                            </a>
                            <form>
                              <input type="hidden" name="propertyId" value={row.id} />
                              <SubmitButton
                                formAction={approvePropertyAction}
                                variant="outline"
                                size="sm"
                                className="h-7 px-2.5 text-xs"
                                pendingText="Activating..."
                              >
                                Activate
                              </SubmitButton>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
