"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  LayoutDashboard,
  Users,
  XCircle,
} from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { WorkerHrModal } from "@/components/worker-hr-modal";
import { EXPIRY_STATUS_META, getHrIssues, type WorkerHrRecord } from "@/lib/hr";
import type { EntityDocumentCategory } from "@/lib/generated/prisma/client";

type DocumentItem = {
  id: string;
  category: EntityDocumentCategory;
  label: string | null;
  fileName: string;
  fileSize: number;
  createdAt: Date;
  canDelete?: boolean;
};

type OverviewWorker = {
  id: string;
  name: string;
  record: WorkerHrRecord;
  documents: DocumentItem[];
};

type Row = {
  worker: OverviewWorker;
  issues: ReturnType<typeof getHrIssues>;
};

const VISIBLE_ROWS = 3;

/**
 * A true dashboard strip at the top of the People page: bold gradient KPI
 * cards plus a ranked "needs attention" list that opens straight into the
 * relevant worker's HR modal on click — built so an admin never has to
 * scroll the full people list just to see whose paperwork is at risk. Only
 * the top 3 are shown inline; the rest are one click away in "View all".
 */
export function HrOverview({ workers }: { workers: OverviewWorker[] }) {
  const rows: Row[] = workers
    .map((worker) => ({ worker, issues: getHrIssues(worker.record) }))
    .filter((row) => row.issues.length > 0)
    .sort((a, b) => {
      const worst = (issues: Row["issues"]) =>
        issues.some((i) => i.status === "expired") ? 0 : 1;
      return worst(a.issues) - worst(b.issues);
    });

  const expiredCount = rows.reduce(
    (sum, row) => sum + row.issues.filter((i) => i.status === "expired").length,
    0,
  );
  const expiringCount = rows.reduce(
    (sum, row) => sum + row.issues.filter((i) => i.status === "expiring").length,
    0,
  );
  const clearCount = workers.length - rows.length;
  const visibleRows = rows.slice(0, VISIBLE_ROWS);
  const hiddenCount = rows.length - visibleRows.length;

  if (workers.length === 0) return null;

  return (
    <div className="space-y-5 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm">
          <LayoutDashboard className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">HR documents dashboard</h2>
          <p className="text-xs text-muted-foreground">
            In-house worker paperwork — passports, Bataka, and vehicle
            documents.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          value={workers.length}
          label="Tracked workers"
          tone="bg-slate-50 ring-slate-200 text-slate-700"
          iconTone="bg-slate-600/10 text-slate-700"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          value={expiringCount}
          label="Documents expiring soon"
          tone="bg-amber-50 ring-amber-200 text-amber-800"
          iconTone="bg-amber-500/15 text-amber-700"
        />
        <KpiCard
          icon={<XCircle className="h-5 w-5" />}
          value={expiredCount}
          label="Documents expired"
          tone="bg-rose-50 ring-rose-200 text-rose-800"
          iconTone="bg-rose-500/15 text-rose-700"
        />
      </div>

      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          All tracked HR documents are valid — nothing needs attention right
          now.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Needs attention · {rows.length} of {workers.length}
              {clearCount > 0 ? ` (${clearCount} fully up to date)` : ""}
            </p>
            {hiddenCount > 0 && (
              <Modal
                trigger={
                  <button
                    type="button"
                    className="text-xs font-semibold text-violet-700 hover:underline"
                  >
                    View all {rows.length} →
                  </button>
                }
                title="Needs attention"
                description="Every in-house worker with a passport, Bataka, or vehicle document that's expiring soon or already expired."
                widthClassName="max-w-2xl"
                headerClassName="bg-gradient-to-r from-violet-700 to-indigo-600 border-transparent text-white [&_h2]:text-white [&_p]:text-white/70 [&_button]:text-white/70 [&_button:hover]:bg-white/15 [&_button:hover]:text-white"
                icon={
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                }
              >
                <div className="overflow-hidden rounded-xl border border-border/60">
                  <div className="divide-y divide-border/60">
                    {rows.map((row) => (
                      <AttentionRow key={row.worker.id} row={row} />
                    ))}
                  </div>
                </div>
              </Modal>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <div className="divide-y divide-border/60">
              {visibleRows.map((row) => (
                <AttentionRow key={row.worker.id} row={row} />
              ))}
            </div>
            {hiddenCount > 0 && (
              <p className="bg-muted/30 px-4 py-2 text-center text-[11px] text-muted-foreground">
                +{hiddenCount} more — see &ldquo;View all&rdquo; above
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AttentionRow({ row: { worker, issues } }: { row: Row }) {
  const worst = issues.some((i) => i.status === "expired")
    ? "expired"
    : "expiring";

  return (
    <WorkerHrModal
      userId={worker.id}
      record={worker.record}
      documents={worker.documents}
      trigger={
        <button
          type="button"
          className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${EXPIRY_STATUS_META[worst].dot}`}
          />
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            {worker.name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {worker.name}
            </span>
          </span>
          <span className="hidden flex-wrap justify-end gap-1.5 sm:flex">
            {issues.map(({ doc, status }) => (
              <span
                key={doc.key}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${EXPIRY_STATUS_META[status].pill}`}
              >
                {doc.label}
              </span>
            ))}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      }
    />
  );
}

function KpiCard({
  icon,
  value,
  label,
  tone,
  iconTone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  /** Soft background + ring + text color for the card itself. */
  tone: string;
  /** Background + icon color for the small icon chip. */
  iconTone: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl p-4 shadow-sm ring-1 ring-inset ${tone}`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconTone}`}
      >
        {icon}
      </span>
      <div>
        <p className="text-2xl font-semibold leading-tight">{value}</p>
        <p className="text-xs opacity-80">{label}</p>
      </div>
    </div>
  );
}
