import { format } from "date-fns";

import {
  RentStatementModal,
  type LandlordStatementOption,
} from "@/components/rent-statement-modal";
import { PendingLink } from "@/components/ui/pending-link";
import { formatMoney } from "@/lib/finance";
import type { RentPositionRow } from "@/lib/rent-position";

const BUCKET_LABEL: Record<RentPositionRow["bucket"], string> = {
  paid: "Paid",
  partial: "Partially Paid",
  duesoon: "Due",
  overdue: "Overdue",
};

const BUCKET_BADGE: Record<RentPositionRow["bucket"], string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  partial: "bg-sky-50 text-sky-700 ring-sky-600/20",
  duesoon: "bg-amber-50 text-amber-700 ring-amber-600/20",
  overdue: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

function statementOption(row: RentPositionRow): LandlordStatementOption {
  return {
    tenancyId: row.tenancyId,
    unitLabel: row.unitLabel,
    tenantName: row.tenantName,
    ownerName: row.ownerLabel,
    propertyName: row.propertyName,
    monthlyRent: row.monthlyRent,
  };
}

export function RentPositionTable({
  rows,
  emptyLabel = "No units match this filter.",
}: {
  rows: RentPositionRow[];
  emptyLabel?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5">Owner</th>
            <th className="px-3 py-2.5">Building</th>
            <th className="px-3 py-2.5">Unit</th>
            <th className="px-3 py-2.5">Tenant</th>
            <th className="px-3 py-2.5 text-right">Raised</th>
            <th className="px-3 py-2.5 text-right">Collected</th>
            <th className="px-3 py-2.5 text-right">Outstanding</th>
            <th className="px-3 py-2.5">Next Due</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={10}
                className="px-3 py-8 text-center text-sm text-muted-foreground"
              >
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/20">
                <td className="px-3 py-2.5 align-middle">{row.ownerLabel}</td>
                <td className="px-3 py-2.5 align-middle">{row.buildingLabel}</td>
                <td className="px-3 py-2.5 align-middle font-medium">
                  {row.unitLabel}
                </td>
                <td className="px-3 py-2.5 align-middle">{row.tenantName}</td>
                <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                  {formatMoney(row.raised)}
                </td>
                <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                  {formatMoney(row.collected)}
                </td>
                <td className="px-3 py-2.5 text-right align-middle font-medium tabular-nums">
                  {formatMoney(row.outstanding)}
                </td>
                <td className="px-3 py-2.5 align-middle text-muted-foreground">
                  {row.nextDueDate ? format(row.nextDueDate, "d MMM yyyy") : "—"}
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BUCKET_BADGE[row.bucket]}`}
                  >
                    {BUCKET_LABEL[row.bucket]}
                  </span>
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <PendingLink
                      href={`/protected/finances?property=${row.propertyId}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Manage
                    </PendingLink>
                    {row.independent && (
                      <RentStatementModal
                        options={[statementOption(row)]}
                        defaultTenancyId={row.tenancyId}
                        trigger={
                          <button
                            type="button"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Statement
                          </button>
                        }
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
