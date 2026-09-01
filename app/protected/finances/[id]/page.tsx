import { format } from "date-fns";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  Landmark,
  Receipt,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { notFound } from "next/navigation";

import {
  reviewPaymentAction,
  submitPaymentAction,
  waiveChargeAction,
} from "@/app/finance-actions";
import { ChargeStatusBadge } from "@/components/charge-status-badge";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { UploadFileInput } from "@/components/upload-file-input";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CHARGE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  approvedTotal,
  chargeBalance,
  dateInputValue,
  formatMoney,
  pendingTotal,
} from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { formatUnitLabel } from "@/lib/property-types";
import { requireUser } from "@/lib/session";
import {
  ChargeStatus,
  PaymentStatus,
  UserType,
} from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending review",
    className: "bg-sky-50 text-sky-700 ring-sky-600/20",
  },
  approved: {
    label: "Approved",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  rejected: {
    label: "Rejected",
    className: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
};

export default async function FinanceDetailPage({
  params,
  searchParams,
}: PageProps) {
  const user = await requireUser();
  if (user.userType === UserType.worker) notFound();

  const { id } = await params;
  const message = (await searchParams) as unknown as Message;
  const charge = await prisma.charge.findUnique({
    where: { id },
    include: {
      tenant: true,
      unit: { include: { property: { include: { propertyType: true } } } },
      tenancy: true,
      createdBy: { select: { email: true, userType: true } },
      attachments: { orderBy: { createdAt: "asc" } },
      payments: {
        orderBy: { createdAt: "desc" },
        include: {
          submittedBy: {
            select: { email: true, firstName: true, lastName: true },
          },
          reviewedBy: { select: { email: true } },
          attachments: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (
    !charge ||
    (user.userType === UserType.user && charge.tenantId !== user.id)
  ) {
    notFound();
  }

  const balance = chargeBalance(charge);
  const approved = approvedTotal(charge.payments);
  const pending = pendingTotal(charge.payments);
  const availableToSubmit = Math.max(0, balance - pending);
  const tenantName = [charge.tenant.firstName, charge.tenant.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      <PageHeader
        title={charge.title}
        description={`${CHARGE_TYPE_LABEL[charge.type]} · ${charge.unit.property.name} · ${formatUnitLabel(
          charge.unit.property.propertyType,
          charge.unit.label,
        )}`}
        back={{ href: "/protected/finances", label: "Rent & bills" }}
      >
        <ChargeStatusBadge charge={charge} />
      </PageHeader>

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary
          label="Amount due"
          value={formatMoney(charge.amount)}
          icon={<Banknote />}
        />
        <Summary
          label="Approved"
          value={formatMoney(approved)}
          icon={<ShieldCheck />}
        />
        <Summary
          label="Remaining balance"
          value={formatMoney(balance)}
          icon={<Landmark />}
          danger={balance > 0}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Charge details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <Detail
                  icon={<UserRound />}
                  label="Tenant"
                  value={tenantName || charge.tenant.email}
                  hint={charge.tenant.email}
                />
                <Detail
                  icon={<CalendarDays />}
                  label="Due date"
                  value={format(charge.dueDate, "dd MMMM yyyy")}
                />
                <Detail
                  icon={<Receipt />}
                  label="Billing period"
                  value={
                    charge.periodStart
                      ? format(charge.periodStart, "MMMM yyyy")
                      : "Not specified"
                  }
                />
                <Detail
                  icon={<FileText />}
                  label="Added by"
                  value={charge.createdBy?.email ?? "System"}
                  hint={
                    charge.createdBy?.userType === UserType.user
                      ? "Tenant-reported bill"
                      : undefined
                  }
                />
              </div>

              {charge.notes && (
                <div className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                  {charge.notes}
                </div>
              )}

              {charge.attachments.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Bill / invoice
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {charge.attachments.map((attachment) => (
                      <ButtonLink
                        key={attachment.id}
                        href={`/api/financial-attachment/${attachment.id}`}
                        target="_blank"
                        rel="noreferrer"
                        variant="outline"
                        size="sm"
                      >
                        <FileText className="h-4 w-4" />
                        {attachment.fileName}
                        <ExternalLink className="h-3 w-3" />
                      </ButtonLink>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment history</CardTitle>
            </CardHeader>
            <CardContent>
              {charge.payments.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted-foreground">
                  No payment or proof has been recorded yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {charge.payments.map((payment) => {
                    const meta = PAYMENT_STATUS_META[payment.status];
                    const submitter = [
                      payment.submittedBy.firstName,
                      payment.submittedBy.lastName,
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div key={payment.id} className="rounded-xl border p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold">
                              {formatMoney(payment.amount)}
                            </p>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {PAYMENT_METHOD_LABEL[payment.method]} · paid{" "}
                              {format(payment.paidAt, "dd MMM yyyy")}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Submitted by{" "}
                              {submitter || payment.submittedBy.email} on{" "}
                              {format(payment.createdAt, "dd MMM yyyy, h:mm a")}
                            </p>
                          </div>
                          <span
                            className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.className}`}
                          >
                            {meta.label}
                          </span>
                        </div>

                        {(payment.reference || payment.notes) && (
                          <div className="mt-3 space-y-1 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                            {payment.reference && (
                              <p>
                                <span className="font-medium text-foreground">
                                  Reference:
                                </span>{" "}
                                {payment.reference}
                              </p>
                            )}
                            {payment.notes && <p>{payment.notes}</p>}
                          </div>
                        )}

                        {payment.attachments.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {payment.attachments.map((attachment) => (
                              <ButtonLink
                                key={attachment.id}
                                href={`/api/financial-attachment/${attachment.id}`}
                                target="_blank"
                                rel="noreferrer"
                                variant="outline"
                                size="sm"
                              >
                                <Receipt className="h-4 w-4" />
                                View {attachment.fileName}
                                <ExternalLink className="h-3 w-3" />
                              </ButtonLink>
                            ))}
                          </div>
                        )}

                        {payment.reviewedAt && (
                          <p className="mt-3 text-xs text-muted-foreground">
                            Reviewed{" "}
                            {format(payment.reviewedAt, "dd MMM yyyy, h:mm a")}
                            {payment.reviewedBy
                              ? ` by ${payment.reviewedBy.email}`
                              : ""}
                            {payment.reviewNotes
                              ? ` · ${payment.reviewNotes}`
                              : ""}
                          </p>
                        )}

                        {user.userType === UserType.admin &&
                          payment.status === PaymentStatus.pending && (
                            <form className="mt-4 space-y-3 border-t pt-4">
                              <input
                                type="hidden"
                                name="paymentId"
                                value={payment.id}
                              />
                              <div className="space-y-1.5">
                                <Label htmlFor={`review-${payment.id}`}>
                                  Review note (optional)
                                </Label>
                                <Input
                                  id={`review-${payment.id}`}
                                  name="reviewNotes"
                                  placeholder="Reason or confirmation note"
                                />
                              </div>
                              <div className="flex gap-2">
                                <SubmitButton
                                  formAction={reviewPaymentAction.bind(
                                    null,
                                    "approve",
                                  )}
                                  size="sm"
                                  pendingText="Saving..."
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Approve
                                </SubmitButton>
                                <SubmitButton
                                  formAction={reviewPaymentAction.bind(
                                    null,
                                    "reject",
                                  )}
                                  variant="outline"
                                  size="sm"
                                  pendingText="Saving..."
                                  className="text-rose-700"
                                >
                                  <XCircle className="h-4 w-4" />
                                  Reject
                                </SubmitButton>
                              </div>
                            </form>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          {charge.status === ChargeStatus.open && availableToSubmit > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {user.userType === UserType.admin
                    ? "Record a payment"
                    : "Submit payment proof"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" encType="multipart/form-data">
                  <input type="hidden" name="chargeId" value={charge.id} />
                  <Field label="Amount (OMR)">
                    <Input
                      name="amount"
                      type="number"
                      min="0.001"
                      max={availableToSubmit}
                      step="0.001"
                      defaultValue={availableToSubmit.toFixed(3)}
                      required
                    />
                  </Field>
                  <Field label="Paid on">
                    <Input
                      name="paidAt"
                      type="date"
                      defaultValue={dateInputValue()}
                      required
                    />
                  </Field>
                  <Field label="Payment method">
                    <Select name="method" defaultValue="bank_transfer">
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {PAYMENT_METHOD_LABEL[method]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Reference / transaction ID">
                    <Input name="reference" placeholder="Optional" />
                  </Field>
                  <Field
                    label={
                      user.userType === UserType.admin
                        ? "Receipt (optional)"
                        : "Receipt / screenshot *"
                    }
                  >
                    <UploadFileInput
                      name="receipt"
                      required={user.userType === UserType.user}
                    />
                  </Field>
                  <Field label="Notes">
                    <Textarea name="notes" className="min-h-16" />
                  </Field>
                  <SubmitButton
                    formAction={submitPaymentAction}
                    className="w-full"
                    pendingText="Submitting..."
                  >
                    {user.userType === UserType.admin
                      ? "Record as approved"
                      : "Send proof for review"}
                  </SubmitButton>
                  {pending > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(pending)} is already waiting for review.
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          )}

          {user.userType === UserType.admin &&
            charge.status === ChargeStatus.open && (
              <Card>
                <CardContent className="space-y-3 p-5">
                  <p className="text-sm font-medium">
                    Administrative adjustment
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Waiving closes the full charge and keeps it in the audit
                    history. It is blocked when a payment is approved or
                    pending.
                  </p>
                  <form>
                    <input type="hidden" name="chargeId" value={charge.id} />
                    <SubmitButton
                      formAction={waiveChargeAction}
                      variant="outline"
                      size="sm"
                      className="w-full"
                      pendingText="Waiving..."
                    >
                      Waive charge
                    </SubmitButton>
                  </form>
                </CardContent>
              </Card>
            )}
        </div>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  icon,
  danger = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </span>
        <div>
          <p
            className={`text-xl font-semibold ${danger ? "text-rose-700" : ""}`}
          >
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
