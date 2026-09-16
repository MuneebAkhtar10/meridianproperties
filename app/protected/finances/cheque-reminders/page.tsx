import { format } from "date-fns";
import { AlertTriangle, Calendar, CircleDollarSign, Clock } from "lucide-react";

import { updatePaymentClearanceAction } from "@/app/finance-actions";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { SummaryTile } from "@/components/summary-tile";
import { PendingLink } from "@/components/ui/pending-link";
import { formatMoney } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

type BucketFilter = "all" | "dueToday" | "dueSoon" | "awaiting" | "bounced";

const DUE_SOON_WINDOW_DAYS = 7;

/**
 * Spec #31 "Cheque Reminders" — cheque dates feed directly into this
 * dashboard. A cheque stays in the queue until its outcome (cleared or
 * bounced) is recorded here.
 */
export default async function ChequeRemindersPage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);

  const params = (await searchParams) as unknown as { bucket?: string };
  const bucketFilter = (params.bucket ?? "all") as BucketFilter;

  const cheques = await prisma.payment.findMany({
    where: {
      method: "cheque",
      clearanceStatus: { not: "cleared" },
    },
    orderBy: [{ chequeDate: "asc" }],
    select: {
      id: true,
      amount: true,
      chequeNumber: true,
      chequeDate: true,
      bank: true,
      clearanceStatus: true,
      charge: {
        select: {
          tenant: { select: { firstName: true, lastName: true, email: true } },
          unit: {
            select: {
              label: true,
              property: {
                select: {
                  name: true,
                  propertyType: { select: { unitPrefix: true, hasFloors: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonCutoff = new Date(today.getTime() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = cheques.map((cheque) => {
    const isPending = cheque.clearanceStatus !== "bounced";
    const isDueToday =
      isPending &&
      cheque.chequeDate &&
      cheque.chequeDate.getTime() === today.getTime();
    const isDueSoon =
      isPending &&
      cheque.chequeDate &&
      cheque.chequeDate.getTime() > today.getTime() &&
      cheque.chequeDate.getTime() <= soonCutoff.getTime();
    const isBounced = cheque.clearanceStatus === "bounced";

    return {
      id: cheque.id,
      tenantName:
        [cheque.charge.tenant.firstName, cheque.charge.tenant.lastName]
          .filter(Boolean)
          .join(" ") || cheque.charge.tenant.email,
      unitLabel: formatUnitLabel(
        cheque.charge.unit.property.propertyType,
        cheque.charge.unit.label,
      ),
      propertyName: cheque.charge.unit.property.name,
      chequeNumber: cheque.chequeNumber,
      bank: cheque.bank,
      amount: cheque.amount,
      chequeDate: cheque.chequeDate,
      clearanceStatus: cheque.clearanceStatus ?? "pending",
      isDueToday,
      isDueSoon,
      isBounced,
      isPending,
    };
  });

  const dueTodayCount = rows.filter((r) => r.isDueToday).length;
  const dueSoonCount = rows.filter((r) => r.isDueSoon).length;
  const awaitingCount = rows.filter((r) => r.isPending).length;
  const bouncedCount = rows.filter((r) => r.isBounced).length;

  const displayedRows = rows.filter((row) => {
    switch (bucketFilter) {
      case "dueToday":
        return row.isDueToday;
      case "dueSoon":
        return row.isDueSoon;
      case "awaiting":
        return row.isPending;
      case "bounced":
        return row.isBounced;
      default:
        return true;
    }
  });

  const buildHref = (bucket: BucketFilter) =>
    bucket === "all"
      ? "/protected/finances/cheque-reminders"
      : `/protected/finances/cheque-reminders?bucket=${bucket}`;

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Cheque Reminders"
        description="Every cheque due, until its outcome is recorded."
        back={{ href: "/protected/finances", label: "Rent & Bills" }}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          icon={<Calendar className="h-4 w-4" />}
          value={dueTodayCount}
          label="Cheques Due Today"
          accent="bg-orange-500"
          iconBg="bg-orange-50 text-orange-600"
          href={buildHref(bucketFilter === "dueToday" ? "all" : "dueToday")}
          active={bucketFilter === "dueToday"}
        />
        <SummaryTile
          icon={<Clock className="h-4 w-4" />}
          value={dueSoonCount}
          label="Cheques Due Soon"
          accent="bg-amber-500"
          iconBg="bg-amber-50 text-amber-600"
          href={buildHref(bucketFilter === "dueSoon" ? "all" : "dueSoon")}
          active={bucketFilter === "dueSoon"}
        />
        <SummaryTile
          icon={<CircleDollarSign className="h-4 w-4" />}
          value={awaitingCount}
          label="Awaiting Clearance"
          accent="bg-sky-500"
          iconBg="bg-sky-50 text-sky-600"
          href={buildHref(bucketFilter === "awaiting" ? "all" : "awaiting")}
          active={bucketFilter === "awaiting"}
        />
        <SummaryTile
          icon={<AlertTriangle className="h-4 w-4" />}
          value={bouncedCount}
          label="Returned / Bounced"
          accent="bg-rose-500"
          iconBg="bg-rose-50 text-rose-600"
          href={buildHref(bucketFilter === "bounced" ? "all" : "bounced")}
          active={bucketFilter === "bounced"}
        />
      </div>

      {bucketFilter !== "all" && (
        <PendingLink
          href={buildHref("all")}
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          Clear filter
        </PendingLink>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Cheque No.</th>
              <th className="px-3 py-2">Bank</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Cheque Date</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No cheques match this filter.
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 align-top">{row.tenantName}</td>
                  <td className="px-3 py-2 align-top">
                    {row.propertyName} · {row.unitLabel}
                  </td>
                  <td className="px-3 py-2 align-top">{row.chequeNumber ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{row.bank ?? "—"}</td>
                  <td className="px-3 py-2 text-right align-top font-medium">
                    {formatMoney(row.amount)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.chequeDate ? format(row.chequeDate, "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        row.isBounced
                          ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                          : "bg-sky-50 text-sky-700 ring-sky-600/20"
                      }`}
                    >
                      {row.isBounced ? "Bounced" : "Pending"}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {!row.isBounced && (
                        <form>
                          <input type="hidden" name="paymentId" value={row.id} />
                          <input type="hidden" name="clearanceStatus" value="cleared" />
                          <SubmitButton
                            formAction={updatePaymentClearanceAction}
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            pendingText="Saving..."
                          >
                            Mark cleared
                          </SubmitButton>
                        </form>
                      )}
                      <form>
                        <input type="hidden" name="paymentId" value={row.id} />
                        <input
                          type="hidden"
                          name="clearanceStatus"
                          value={row.isBounced ? "pending" : "bounced"}
                        />
                        <SubmitButton
                          formAction={updatePaymentClearanceAction}
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                          pendingText="Saving..."
                        >
                          {row.isBounced ? "Reopen" : "Mark bounced"}
                        </SubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
