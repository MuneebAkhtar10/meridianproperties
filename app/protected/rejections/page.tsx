import { format } from "date-fns";
import { Ban, Building2, PackageX, Receipt } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { requireAnyRole } from "@/lib/session";
import { PaymentStatus, RejectionKind, UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const KIND_META: Record<
  RejectionKind,
  { label: string; icon: typeof Ban; className: string }
> = {
  property: {
    label: "Property",
    icon: Building2,
    className: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  payment: {
    label: "Payment",
    icon: Receipt,
    className: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
  supply_request: {
    label: "Supply request",
    icon: PackageX,
    className: "bg-slate-100 text-slate-700 ring-slate-500/20",
  },
};

export default async function RejectionsPage({ searchParams }: PageProps) {
  const user = await requireAnyRole(UserType.admin, UserType.user);

  if (user.userType === UserType.user) {
    return <TenantRejections tenantId={user.id} />;
  }

  const params = await searchParams;
  const kindFilter =
    typeof params.kind === "string" &&
    (Object.keys(KIND_META) as string[]).includes(params.kind)
      ? (params.kind as RejectionKind)
      : "all";

  const logs = await prisma.rejectionLog.findMany({
    where: kindFilter !== "all" ? { kind: kindFilter } : {},
    orderBy: { createdAt: "desc" },
    include: { rejectedBy: { select: { email: true } } },
    take: 200,
  });

  const counts = await prisma.rejectionLog.groupBy({
    by: ["kind"],
    _count: { _all: true },
  });
  const countByKind = Object.fromEntries(
    counts.map((c) => [c.kind, c._count._all]),
  ) as Partial<Record<RejectionKind, number>>;
  const total = counts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <PageHeader
        title="Rejections"
        description="A permanent log of every property, payment, and supply request that was rejected — who rejected it, and why."
      />

      <div className="flex flex-wrap gap-2">
        <FilterLink
          href="/protected/rejections"
          active={kindFilter === "all"}
          label={`All (${total})`}
        />
        {(Object.keys(KIND_META) as RejectionKind[]).map((kind) => (
          <FilterLink
            key={kind}
            href={`/protected/rejections?kind=${kind}`}
            active={kindFilter === kind}
            label={`${KIND_META[kind].label} (${countByKind[kind] ?? 0})`}
          />
        ))}
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={Ban}
          title="No rejections"
          description="Rejected properties, payments, and supply requests will show up here with the reason and who rejected them."
        />
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const meta = KIND_META[log.kind];
            const Icon = meta.icon;
            return (
              <Card key={log.id}>
                <CardContent className="flex flex-wrap items-start gap-3 py-4">
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.className}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">{log.entityLabel}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(log.createdAt, "d MMM yyyy, h:mm a")} · Rejected
                      by {log.rejectedBy.email}
                      {log.affectedUser ? ` · Affects ${log.affectedUser}` : ""}
                      {log.amount ? ` · ${formatMoney(Number(log.amount))}` : ""}
                    </p>
                    {log.reason && (
                      <p className="text-sm text-foreground/80">
                        “{log.reason}”
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Tenant's own view: just their rejected payments, with the reason and a
 * link straight to the bill to resubmit — no cross-tenant data, unlike the
 * admin log above. */
async function TenantRejections({ tenantId }: { tenantId: string }) {
  const payments = await prisma.payment.findMany({
    where: { status: PaymentStatus.rejected, charge: { tenantId } },
    orderBy: { reviewedAt: "desc" },
    include: {
      charge: { select: { id: true, title: true } },
      reviewedBy: { select: { email: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <PageHeader
        title="Rejections"
        description="Payments and bills you submitted that were rejected — with the reason, so you know what to fix before submitting again."
      />

      {payments.length === 0 ? (
        <EmptyState
          icon={Ban}
          title="No rejections"
          description="If a payment you submit is ever rejected, it'll show up here with the reason."
        />
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => (
            <Card key={payment.id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{payment.charge.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatMoney(payment.amount)}
                      {payment.reviewedAt
                        ? ` · Rejected ${format(payment.reviewedAt, "d MMM yyyy")}`
                        : ""}
                      {payment.reviewedBy
                        ? ` by ${payment.reviewedBy.email}`
                        : ""}
                    </p>
                  </div>
                  <ButtonLink
                    href={`/protected/finances/${payment.charge.id}`}
                    variant="outline"
                    size="sm"
                  >
                    View bill
                  </ButtonLink>
                </div>
                {payment.reviewNotes && (
                  <p className="text-sm text-rose-800">
                    <span className="font-medium">Reason:</span>{" "}
                    {payment.reviewNotes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <a
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-input text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </a>
  );
}
