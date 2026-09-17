import { format } from "date-fns";
import { AlertTriangle, FileWarning } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SummaryTile } from "@/components/summary-tile";
import { Card } from "@/components/ui/card";
import { PendingLink } from "@/components/ui/pending-link";
import {
  EXPIRY_BUCKET_LABEL,
  expiryBucket,
  getAgreementExpiryAlerts,
  type ExpiryAlertKind,
  type ExpiryBucket,
} from "@/lib/agreement-expiry";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const KIND_LABEL: Record<ExpiryAlertKind, string> = {
  tenant_agreement: "Tenant Agreement",
  building_contract: "Building Contract",
};

const KIND_BADGE: Record<ExpiryAlertKind, string> = {
  tenant_agreement: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  building_contract: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
};

const BUCKET_ORDER: ExpiryBucket[] = ["expired", "7", "15", "30", "60", "90"];

const BUCKET_TILE_STYLE: Record<
  ExpiryBucket,
  { accent: string; iconBg: string }
> = {
  expired: { accent: "bg-rose-600", iconBg: "bg-rose-50 text-rose-600" },
  "7": { accent: "bg-red-500", iconBg: "bg-red-50 text-red-600" },
  "15": { accent: "bg-orange-500", iconBg: "bg-orange-50 text-orange-600" },
  "30": { accent: "bg-amber-500", iconBg: "bg-amber-50 text-amber-600" },
  "60": { accent: "bg-sky-500", iconBg: "bg-sky-50 text-sky-600" },
  "90": { accent: "bg-slate-400", iconBg: "bg-slate-50 text-slate-600" },
};

/**
 * Spec #9 "Agreement Expiry" — the full, filterable version of the
 * dashboard's compact widget. Covers both tenant agreements (lease end
 * date) and building/supplier agreements (BuildingServiceContract),
 * bucketed on the same 90/60/30/15/7-day reminder ladder. Expired
 * agreements never drop off this list on their own — they stay until
 * renewed, replaced or closed, same as the spec requires.
 */
export default async function AgreementExpiryReportPage({
  searchParams,
}: PageProps) {
  await requireRole(UserType.admin);

  const params = (await searchParams) as unknown as {
    bucket?: string;
    kind?: string;
  };
  const bucketFilter = BUCKET_ORDER.includes(params.bucket as ExpiryBucket)
    ? (params.bucket as ExpiryBucket)
    : "all";
  const kindFilter =
    params.kind === "tenant_agreement" || params.kind === "building_contract"
      ? (params.kind as ExpiryAlertKind)
      : "all";

  const alerts = await getAgreementExpiryAlerts();

  const counts: Record<ExpiryBucket, number> = {
    expired: 0,
    "7": 0,
    "15": 0,
    "30": 0,
    "60": 0,
    "90": 0,
  };
  for (const alert of alerts) counts[expiryBucket(alert.daysRemaining)]++;

  const filtered = alerts.filter((alert) => {
    if (kindFilter !== "all" && alert.kind !== kindFilter) return false;
    if (bucketFilter !== "all" && expiryBucket(alert.daysRemaining) !== bucketFilter) {
      return false;
    }
    return true;
  });

  const buildHref = (next: { bucket?: string; kind?: string }) => {
    const query = new URLSearchParams();
    const bucket = next.bucket ?? bucketFilter;
    const kind = next.kind ?? kindFilter;
    if (bucket !== "all") query.set("bucket", bucket);
    if (kind !== "all") query.set("kind", kind);
    const qs = query.toString();
    return `/protected/reports/agreement-expiry${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Agreement Expiry"
        description="Every tenant, building and supplier agreement approaching or past its expiry date."
        back={{ href: "/protected/reports", label: "Reports" }}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {BUCKET_ORDER.map((bucket) => (
          <SummaryTile
            key={bucket}
            icon={
              bucket === "expired" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <FileWarning className="h-4 w-4" />
              )
            }
            value={counts[bucket]}
            label={EXPIRY_BUCKET_LABEL[bucket]}
            accent={BUCKET_TILE_STYLE[bucket].accent}
            iconBg={BUCKET_TILE_STYLE[bucket].iconBg}
            href={buildHref({ bucket: bucketFilter === bucket ? "all" : bucket })}
            active={bucketFilter === bucket}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-1">
        {(
          [
            { value: "all", label: "All types" },
            { value: "tenant_agreement", label: "Tenant Agreements" },
            { value: "building_contract", label: "Building Contracts" },
          ] as const
        ).map((option) => {
          const active = kindFilter === option.value;
          return (
            <PendingLink
              key={option.value}
              href={buildHref({ kind: option.value })}
              className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "bg-white text-foreground shadow-sm ring-1 ring-border/60"
                  : "text-muted-foreground hover:bg-white/60 hover:text-foreground"
              }`}
            >
              {option.label}
            </PendingLink>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="Nothing expiring here"
          description={
            alerts.length === 0
              ? "No tenant or building agreements are expiring within 90 days, and none are overdue."
              : "Try a different filter."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Agreement</th>
                  <th className="px-4 py-2.5">Property / Vendor</th>
                  <th className="px-4 py-2.5">Expiry date</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((alert) => {
                  const expired = alert.daysRemaining < 0;
                  return (
                    <tr key={alert.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${KIND_BADGE[alert.kind]}`}
                        >
                          {KIND_LABEL[alert.kind]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium">{alert.title}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {alert.subtitle}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {format(alert.endDate, "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                            expired
                              ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                              : "bg-amber-50 text-amber-700 ring-amber-600/20"
                          }`}
                        >
                          {expired
                            ? `Expired ${Math.abs(alert.daysRemaining)}d ago`
                            : `Due in ${alert.daysRemaining}d`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <PendingLink
                          href={alert.href}
                          className="font-medium text-primary hover:underline"
                        >
                          Manage
                        </PendingLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
