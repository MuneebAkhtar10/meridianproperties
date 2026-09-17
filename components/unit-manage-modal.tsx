"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeftRight,
  Check,
  FileStack,
  FileText,
  KeyRound,
  Mail,
  Pencil,
  Receipt,
  ScrollText,
  Send,
  Settings2,
  Trash2,
  Wallet,
} from "lucide-react";

import {
  assignTenantAction,
  deleteUnitAction,
  transferUnitOwnershipAction,
  updateUnitAction,
  updateUnitServiceChargeAction,
} from "@/app/admin-actions";
import {
  generateServiceChargeInvoiceAction,
  recordServiceChargePaymentAction,
  sendServiceChargeInvoiceAction,
} from "@/app/service-charge-invoice-actions";
import {
  cancelServiceChargeInstallmentPlanAction,
  createServiceChargeInstallmentPlanAction,
  markInstallmentPaidAction,
  sendInstallmentInvoiceAction,
} from "@/app/service-charge-installment-actions";
import {
  EntityDocumentManager,
  type DocumentItem,
} from "@/components/entity-document-manager";
import { CloseModalOnSubmit, Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import {
  dateInputValue,
  formatMoney,
  moneyValue,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
} from "@/lib/finance";
import { cn } from "@/lib/utils";
import { EntityDocumentCategory } from "@/lib/generated/prisma/client";

/** Compact mode shows no category picker — it's built for exactly one fixed
 * category, which the ownership contract is. */
const UNIT_CONTRACT_CATEGORY = [
  EntityDocumentCategory.ownership_contract,
] as const;

/** The "Miscellaneous" tab's fixed category — any other supporting file
 * that isn't the ownership contract itself (insurance, correspondence,
 * inspection photos, etc.), reusing the catch-all "other" category rather
 * than adding a new enum value for it. */
const UNIT_MISC_CATEGORY = [EntityDocumentCategory.other] as const;

function ownerDisplayName(owner: {
  email: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  return [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email;
}

/** A short avatar-badge label — initials from the name, or just the first
 * letter of the email when there's no name on file. */
function ownerInitials(owner: {
  email: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  const initials = [owner.firstName, owner.lastName]
    .filter(Boolean)
    .map((part) => part!.charAt(0))
    .join("");
  return (initials || owner.email.charAt(0)).toUpperCase();
}

export type ManagedUnit = {
  id: string;
  propertyId: string;
  label: string;
  floor: number | null;
  bedrooms: number | null;
  ownerId: string | null;
  tenantId: string | null;
  owner: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  tenant: { id: string; email: string } | null;
  rentBillsEnabled: boolean;
  maintenanceEnabled: boolean;
  /** Decimal fields arrive pre-serialized to plain strings by every call
   * site (see toManagedUnit in this file) — a raw Prisma Decimal is a class
   * instance, not a plain object, and React's RSC flight protocol refuses
   * to pass those from a Server Component into this "use client" one. */
  serviceChargeAmount: string | null;
  serviceChargeCycleMonths: number | null;
  serviceChargeDueDate: Date | null;
  serviceChargeLastReceivedAt: Date | null;
  entitlements: number | null;
  serviceChargeBalance: string;
  serviceChargeInvoices: {
    id: string;
    invoiceNumber: string;
    issueDate: Date;
    currentAmount: string;
    previousBalance: string;
    amountPayable: string;
  }[];
  installmentPlans: {
    id: string;
    installmentCount: number;
    frequencyMonths: number;
    installments: {
      id: string;
      sequence: number;
      amount: string;
      dueDate: Date;
      paidAt: Date | null;
      reminderSentAt: Date | null;
    }[];
  }[];
  documents: DocumentItem[];
  ownershipTransfers: {
    id: string;
    transferDate: Date;
    keptServiceCharge: boolean;
    notes: string | null;
    createdAt: Date;
    fromOwner: { email: string; firstName: string | null; lastName: string | null } | null;
    toOwner: { email: string; firstName: string | null; lastName: string | null };
    createdBy: { email: string; firstName: string | null; lastName: string | null } | null;
  }[];
};

type TabKey = "details" | "ownership" | "charge" | "documents" | "misc" | "danger";

/** One consolidated "Manage" surface for a unit, organized into tabs
 * (Details, Tenant, Service charge, Danger zone) rather than one long
 * scrolling stack — each tab is its own independent form, same as before. */
export function UnitManageModal({
  unit,
  unitLabel,
  unitNoun,
  unitNounCap,
  hasFloors,
  hasBedrooms,
  isAdmin,
  isBuildingType,
  canManageDocuments,
  owners,
  availableTenants,
  funds,
  defaultTab = "details",
  triggerLabel = "Manage",
}: {
  unit: ManagedUnit;
  unitLabel: string;
  unitNoun: string;
  unitNounCap: string;
  hasFloors: boolean;
  hasBedrooms: boolean;
  isAdmin: boolean;
  /** An OA/building property never bills rent — hides the rent & bills /
   * maintenance-request toggles entirely instead of just defaulting them
   * off, since there's nothing here for an admin to opt back into. */
  isBuildingType: boolean;
  /** Admin, or this specific unit's own owner — anyone else viewing the
   * modal (e.g. an owner looking at a co-owner's unit on a shared property)
   * gets a read-only documents list. */
  canManageDocuments: boolean;
  owners: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }[];
  availableTenants: { id: string; email: string }[];
  /** OA accounting funds (General Administrative, Admin, Sinking, ...) —
   * every invoice/payment picks one, see UnitFundBalance in schema.prisma. */
  funds: { id: string; label: string }[];
  /** Opens straight to a given tab — used by the Service Charge Ledger
   * page so "Manage" jumps right to the charge tab instead of Details. */
  defaultTab?: TabKey;
  /** The trigger button's own label — e.g. Collection Position calls it
   * "Take Action" since this is the row's one and only action there,
   * rather than one of several. */
  triggerLabel?: string;
}) {
  const hasCharge = Boolean(
    unit.serviceChargeAmount && unit.serviceChargeDueDate,
  );
  const activePlan = unit.installmentPlans[0] ?? null;
  const currentBalance = moneyValue(unit.serviceChargeBalance);
  const defaultFundId = funds[0]?.id ?? "";
  const [paymentMethod, setPaymentMethod] = useState<string>("");

  // Service charge invoices are billed for a full calendar year — default
  // the period to Jan 1–Dec 31 of the year the invoice is being issued in,
  // and the due date to 10 days after issuing, so the common case (invoice
  // this year's charge, right now) needs no manual date entry at all.
  const today = new Date();
  const currentYear = today.getFullYear();
  const defaultPeriodStart = `${currentYear}-01-01`;
  const defaultPeriodEnd = `${currentYear}-12-31`;
  const defaultInvoiceDueDate = dateInputValue(
    new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000),
  );

  const tabs: { key: TabKey; label: string; icon: typeof Pencil }[] = [
    { key: "details", label: "Details", icon: Pencil },
    { key: "ownership", label: "Ownership", icon: ArrowLeftRight },
    { key: "charge", label: "Service charge", icon: Settings2 },
    { key: "documents", label: "Agreements", icon: FileText },
    { key: "misc", label: "Miscellaneous", icon: FileStack },
    { key: "danger", label: "Danger zone", icon: Trash2 },
  ];

  const tenantFormId = `unit-tenant-form-${unit.id}`;

  const [tab, setTab] = useState<TabKey>(defaultTab);

  return (
    <Modal
      title={`Manage ${unitLabel}`}
      widthClassName="max-w-3xl"
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60"
        >
          <Pencil className="h-3.5 w-3.5" />
          {triggerLabel}
        </button>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
                tab === key
                  ? "bg-white text-foreground shadow-sm ring-1 ring-border/60"
                  : "text-muted-foreground hover:bg-white/60 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Details ──────────────────────────────────────────────────── */}
        {tab === "details" && (
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="unitId" value={unit.id} />
            <div className="space-y-1">
              <Label htmlFor={`u-label-${unit.id}`} className="text-xs">
                {unitNounCap} number
              </Label>
              <Input
                id={`u-label-${unit.id}`}
                name="label"
                defaultValue={unit.label}
                required
              />
            </div>
            {hasFloors && (
              <div className="space-y-1">
                <Label htmlFor={`u-floor-${unit.id}`} className="text-xs">
                  Floor
                </Label>
                <Input
                  id={`u-floor-${unit.id}`}
                  name="floor"
                  type="number"
                  defaultValue={unit.floor ?? ""}
                />
              </div>
            )}
            {hasBedrooms && (
              <div className="space-y-1">
                <Label htmlFor={`u-beds-${unit.id}`} className="text-xs">
                  Bedrooms
                </Label>
                <Input
                  id={`u-beds-${unit.id}`}
                  name="bedrooms"
                  type="number"
                  min={0}
                  defaultValue={unit.bedrooms ?? ""}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor={`u-entitlements-${unit.id}`} className="text-xs">
                Unit entitlement (m²)
              </Label>
              <Input
                id={`u-entitlements-${unit.id}`}
                name="entitlements"
                type="number"
                min={0}
                placeholder="e.g. 70"
                defaultValue={unit.entitlements ?? ""}
              />
            </div>
            {isAdmin && !unit.owner && (
              <div className="col-span-full space-y-1">
                <Label htmlFor={`u-owner-${unit.id}`} className="text-xs">
                  Owner
                </Label>
                <Select
                  id={`u-owner-${unit.id}`}
                  name="ownerId"
                  defaultValue=""
                >
                  <option value="">— Unassigned —</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {ownerDisplayName(owner)}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Once assigned, reassigning to someone else moves to the
                  Ownership tab, which keeps a transfer history.
                </p>
              </div>
            )}
            {isAdmin && (
              <div className="col-span-full space-y-1">
                <Label htmlFor={`u-tenant-${unit.id}`} className="text-xs">
                  Tenant
                </Label>
                <div className="flex items-center gap-2">
                  <Select
                    id={`u-tenant-${unit.id}`}
                    name="tenantId"
                    form={tenantFormId}
                    defaultValue={unit.tenant?.id ?? ""}
                    className="flex-1"
                    aria-label={`Tenant for ${unitNoun} ${unit.label}`}
                  >
                    <option value="">— Empty —</option>
                    {unit.tenant && (
                      <option value={unit.tenant.id}>
                        {unit.tenant.email}
                      </option>
                    )}
                    {availableTenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.email}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton
                    form={tenantFormId}
                    formAction={assignTenantAction}
                    variant="outline"
                    size="sm"
                    pendingText="Saving..."
                  >
                    Save
                  </SubmitButton>
                </div>
              </div>
            )}
            {isAdmin && !isBuildingType && (
              <div className="col-span-full space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-3.5">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="rentBillsEnabled"
                    defaultChecked={unit.rentBillsEnabled}
                    className="h-4 w-4 rounded border-input"
                  />
                  Charge rent &amp; bills for this {unitNoun}
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="maintenanceEnabled"
                    defaultChecked={unit.maintenanceEnabled}
                    className="h-4 w-4 rounded border-input"
                  />
                  Accept maintenance requests
                </label>
              </div>
            )}
            <div className="col-span-full">
              <SubmitButton
                formAction={updateUnitAction}
                size="sm"
                className="w-full"
                pendingText="Saving..."
              >
                Save details
              </SubmitButton>
            </div>
            <CloseModalOnSubmit />
          </form>
        )}

        {/* The tenant Select + Save button above live inside the details
         * form's DOM (right under Owner) but target THIS form via the
         * `form=""` attribute, so assigning a tenant stays its own
         * independent save — it doesn't get bundled into "Save details". */}
        {tab === "details" && isAdmin && (
          <form id={tenantFormId}>
            <input type="hidden" name="unitId" value={unit.id} />
            <CloseModalOnSubmit />
          </form>
        )}

        {/* ── Ownership ────────────────────────────────────────────────── */}
        {tab === "ownership" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {unit.owner ? ownerInitials(unit.owner) : "—"}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Current owner</p>
                <p className="truncate text-sm font-medium">
                  {unit.owner ? ownerDisplayName(unit.owner) : "Unassigned"}
                </p>
              </div>
            </div>

            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                Only an admin can transfer ownership.
              </p>
            )}
            {isAdmin && !unit.owner && (
              <p className="text-xs text-muted-foreground">
                This {unitNoun} has no owner yet — assign one from the
                Details tab first. Once it has an owner, transferring it to
                someone else (with a recorded history) happens here.
              </p>
            )}
            {isAdmin && unit.owner && (
              <div>
                <TransferOwnershipModal
                  unitId={unit.id}
                  unitLabel={unitLabel}
                  currentOwnerName={ownerDisplayName(unit.owner)}
                  owners={owners.filter((owner) => owner.id !== unit.owner?.id)}
                />
              </div>
            )}

            {isAdmin && unit.owner && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Transfer history
                </p>
                {unit.ownershipTransfers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/60 p-3.5 text-xs text-muted-foreground">
                    No ownership transfers recorded for this {unitNoun} yet.
                  </p>
                ) : (
                  <div className="divide-y rounded-xl border border-border/60">
                    {unit.ownershipTransfers.map((transfer) => (
                      <div key={transfer.id} className="flex gap-3 p-3.5 text-xs">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                            <span className="font-medium text-foreground">
                              {transfer.fromOwner
                                ? ownerDisplayName(transfer.fromOwner)
                                : "Unassigned"}{" "}
                              &rarr; {ownerDisplayName(transfer.toOwner)}
                            </span>
                            <span className="text-muted-foreground">
                              {format(transfer.transferDate, "d MMM yyyy")}
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            {transfer.keptServiceCharge
                              ? "Kept the existing service charge and billing setup"
                              : "Service charge and billing setup was cleared"}
                            {transfer.createdBy &&
                              ` · By ${ownerDisplayName(transfer.createdBy)}`}
                          </p>
                          {transfer.notes && (
                            <p className="italic text-muted-foreground">
                              &ldquo;{transfer.notes}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Service charge ──────────────────────────────────────────── */}
        {tab === "charge" && (
          <div className="space-y-4">
            {hasCharge && unit.serviceChargeLastReceivedAt && (
              <p className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                <Check className="h-3 w-3" />
                Last invoiced{" "}
                {format(unit.serviceChargeLastReceivedAt, "d MMM yyyy")}
              </p>
            )}

            {isAdmin ? (
              <>
                <form className="space-y-3 rounded-xl border border-border bg-muted/10 p-4 shadow-sm">
                  <input type="hidden" name="unitId" value={unit.id} />
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Settings2 className="h-4 w-4 text-primary" />
                    Service charge settings
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label
                        htmlFor={`sc-amount-${unit.id}`}
                        className="text-xs"
                      >
                        Amount (OMR)
                      </Label>
                      <Input
                        id={`sc-amount-${unit.id}`}
                        name="serviceChargeAmount"
                        type="number"
                        step="0.001"
                        min="0"
                        defaultValue={
                          unit.serviceChargeAmount
                            ? String(unit.serviceChargeAmount)
                            : ""
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`sc-cycle-${unit.id}`}
                        className="text-xs"
                      >
                        Repeats every
                      </Label>
                      <Select
                        id={`sc-cycle-${unit.id}`}
                        name="serviceChargeCycleMonths"
                        defaultValue={
                          unit.serviceChargeCycleMonths?.toString() ?? "12"
                        }
                        required
                      >
                        <option value="1">1 month</option>
                        <option value="3">3 months</option>
                        <option value="6">6 months</option>
                        <option value="12">12 months</option>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`sc-due-${unit.id}`} className="text-xs">
                      Due date
                    </Label>
                    <Input
                      id={`sc-due-${unit.id}`}
                      name="serviceChargeDueDate"
                      type="date"
                      defaultValue={
                        unit.serviceChargeDueDate
                          ? unit.serviceChargeDueDate
                              .toISOString()
                              .slice(0, 10)
                          : ""
                      }
                      required
                    />
                  </div>
                  <SubmitButton
                    formAction={updateUnitServiceChargeAction}
                    size="sm"
                    className="w-full"
                    pendingText="Saving..."
                  >
                    Save service charge
                  </SubmitButton>
                  <CloseModalOnSubmit />
                </form>

                {/* ── Unit ledger ──────────────────────────────────────────── */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                      <ScrollText className="h-4 w-4 text-muted-foreground" />
                      Unit Ledger
                    </h3>
                    <a
                      href={`/protected/properties/${unit.propertyId}/units/${unit.id}/ledger`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      View full ledger
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Balance
                    </span>
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        moneyValue(unit.serviceChargeBalance) < 0
                          ? "text-emerald-600"
                          : moneyValue(unit.serviceChargeBalance) > 0
                            ? "text-rose-600"
                            : "text-muted-foreground",
                      )}
                    >
                      {moneyValue(unit.serviceChargeBalance) < 0
                        ? `Credit ${formatMoney(Math.abs(moneyValue(unit.serviceChargeBalance)))}`
                        : formatMoney(unit.serviceChargeBalance)}
                    </span>
                  </div>

                  {/* ── Payment plan ───────────────────────────────────── */}
                  {activePlan ? (
                    <div className="space-y-2 rounded-xl border border-border bg-muted/10 p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Payment plan
                        </p>
                        <form>
                          <input type="hidden" name="planId" value={activePlan.id} />
                          <SubmitButton
                            formAction={cancelServiceChargeInstallmentPlanAction}
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-rose-600 hover:text-rose-700"
                            pendingText="Cancelling..."
                          >
                            Cancel plan
                          </SubmitButton>
                        </form>
                      </div>
                      <div className="divide-y rounded-md border">
                        {activePlan.installments.map((installment) => (
                          <div key={installment.id} className="p-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span>
                                #{installment.sequence} ·{" "}
                                {formatMoney(installment.amount)} · due{" "}
                                {format(installment.dueDate, "d MMM yyyy")}
                              </span>
                              {installment.paidAt && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
                                  <Check className="h-3 w-3" />
                                  Paid {format(installment.paidAt, "d MMM yyyy")}
                                </span>
                              )}
                            </div>
                            {!installment.paidAt && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <form>
                                  <input
                                    type="hidden"
                                    name="installmentId"
                                    value={installment.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="amount"
                                    value={String(installment.amount)}
                                  />
                                  <input
                                    type="hidden"
                                    name="paidAt"
                                    value={dateInputValue()}
                                  />
                                  <SubmitButton
                                    formAction={markInstallmentPaidAction}
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    pendingText="Saving..."
                                  >
                                    Mark paid
                                  </SubmitButton>
                                </form>
                                <form>
                                  <input
                                    type="hidden"
                                    name="installmentId"
                                    value={installment.id}
                                  />
                                  <SubmitButton
                                    formAction={sendInstallmentInvoiceAction}
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    pendingText="Sending..."
                                  >
                                    <Mail className="h-3 w-3" />
                                    Send invoice
                                  </SubmitButton>
                                </form>
                                {installment.reminderSentAt && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Sent{" "}
                                    {format(installment.reminderSentAt, "d MMM")}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    currentBalance > 0 && (
                      <details className="rounded-xl border border-border bg-muted/10 p-4 shadow-sm">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Set up a payment plan
                        </summary>
                        <form className="mt-2 space-y-2">
                          <input type="hidden" name="unitId" value={unit.id} />
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Installments</Label>
                              <Input
                                name="installmentCount"
                                type="number"
                                min="2"
                                max="24"
                                defaultValue="3"
                                className="h-8 text-xs"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Every</Label>
                              <Select
                                name="frequencyMonths"
                                defaultValue="1"
                                className="h-8 text-xs"
                              >
                                <option value="1">1 month</option>
                                <option value="2">2 months</option>
                                <option value="3">3 months</option>
                                <option value="6">6 months</option>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Start date</Label>
                            <Input
                              name="startDate"
                              type="date"
                              defaultValue={dateInputValue()}
                              className="h-8 text-xs"
                              required
                            />
                          </div>
                          <SubmitButton
                            formAction={createServiceChargeInstallmentPlanAction}
                            variant="outline"
                            size="sm"
                            className="w-full"
                            pendingText="Creating..."
                          >
                            Create payment plan for {formatMoney(currentBalance)}
                          </SubmitButton>
                        </form>
                      </details>
                    )
                  )}

                  {hasCharge && (
                    <form className="space-y-2 rounded-xl border border-border bg-muted/10 p-4 shadow-sm">
                      <input type="hidden" name="unitId" value={unit.id} />
                      <input type="hidden" name="fundId" value={defaultFundId} />
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Receipt className="h-4 w-4 text-primary" />
                        Generate invoice
                      </p>
                      <div className="space-y-1">
                        <Label className="text-xs">Amount (OMR)</Label>
                        <Input
                          name="currentAmount"
                          type="number"
                          min="0.001"
                          step="0.001"
                          defaultValue={
                            unit.serviceChargeAmount
                              ? String(unit.serviceChargeAmount)
                              : ""
                          }
                          className="h-8 text-xs"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Period start</Label>
                          <Input
                            name="periodStart"
                            type="date"
                            defaultValue={defaultPeriodStart}
                            className="h-8 text-xs"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Period end</Label>
                          <Input
                            name="periodEnd"
                            type="date"
                            defaultValue={defaultPeriodEnd}
                            className="h-8 text-xs"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Issue date</Label>
                          <Input
                            name="issueDate"
                            type="date"
                            defaultValue={dateInputValue()}
                            className="h-8 text-xs"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Due date</Label>
                          <Input
                            name="dueDate"
                            type="date"
                            defaultValue={defaultInvoiceDueDate}
                            className="h-8 text-xs"
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Grace (days)</Label>
                        <Input
                          name="graceDays"
                          type="number"
                          min="0"
                          defaultValue="0"
                          className="h-8 text-xs"
                        />
                      </div>
                      <SubmitButton
                        formAction={generateServiceChargeInvoiceAction}
                        variant="outline"
                        size="sm"
                        className="w-full"
                        pendingText="Generating..."
                      >
                        Generate invoice
                      </SubmitButton>
                    </form>
                  )}

                  <form className="space-y-2 rounded-xl border border-border bg-muted/10 p-4 shadow-sm">
                    <input type="hidden" name="unitId" value={unit.id} />
                    <input type="hidden" name="fundId" value={defaultFundId} />
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Wallet className="h-4 w-4 text-primary" />
                      Record payment
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        name="amount"
                        type="number"
                        min="0.001"
                        step="0.001"
                        placeholder="Amount"
                        defaultValue={
                          unit.serviceChargeAmount
                            ? String(unit.serviceChargeAmount)
                            : ""
                        }
                        className="h-8 text-xs"
                        required
                      />
                      <Input
                        name="paidAt"
                        type="date"
                        defaultValue={dateInputValue()}
                        className="h-8 text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Payment method</Label>
                      <Select
                        name="paymentMethod"
                        defaultValue=""
                        className="h-8 text-xs"
                        onChange={(event) => setPaymentMethod(event.target.value)}
                      >
                        <option value="">—</option>
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {PAYMENT_METHOD_LABEL[method]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Transaction number</Label>
                      <Input
                        name="transactionNumber"
                        className="h-8 text-xs"
                        placeholder="Bank ref / receipt no."
                      />
                    </div>
                    {paymentMethod === "cheque" && (
                      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Cheque number</Label>
                          <Input name="chequeNumber" className="h-8 text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Cheque date</Label>
                          <Input name="chequeDate" type="date" className="h-8 text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Bank</Label>
                          <Input name="bank" className="h-8 text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Clearance status</Label>
                          <Select
                            name="clearanceStatus"
                            defaultValue="pending"
                            className="h-8 text-xs"
                          >
                            <option value="pending">Pending</option>
                            <option value="cleared">Cleared</option>
                            <option value="bounced">Bounced</option>
                          </Select>
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Notes</Label>
                      <Input name="note" className="h-8 text-xs" />
                    </div>
                    <SubmitButton
                      formAction={recordServiceChargePaymentAction}
                      variant="outline"
                      size="sm"
                      className="w-full"
                      pendingText="Recording..."
                    >
                      Record payment
                    </SubmitButton>
                  </form>

                  {unit.serviceChargeInvoices.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Past invoices
                      </p>
                      <div className="divide-y rounded-xl border border-border/60">
                        {unit.serviceChargeInvoices.map((invoice) => {
                          const credit = -moneyValue(invoice.previousBalance);
                          return (
                          <div
                            key={invoice.id}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <span className="flex flex-wrap items-center gap-1.5">
                                #{invoice.invoiceNumber} ·{" "}
                                {format(invoice.issueDate, "d MMM yyyy")}
                              </span>
                              {credit > 0 ? (
                                <p className="text-muted-foreground">
                                  Invoice {formatMoney(invoice.currentAmount)} &minus;
                                  Credit {formatMoney(credit)} ={" "}
                                  <span className="font-medium text-foreground">
                                    Payable {formatMoney(invoice.amountPayable)}
                                  </span>
                                </p>
                              ) : (
                                <p className="font-medium text-foreground">
                                  {formatMoney(invoice.amountPayable)}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <a
                                href={`/api/service-charge-invoices/${invoice.id}/pdf`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-primary hover:underline"
                              >
                                PDF
                              </a>
                              {unit.owner && (
                                <form>
                                  <input type="hidden" name="invoiceId" value={invoice.id} />
                                  <SubmitButton
                                    formAction={sendServiceChargeInvoiceAction}
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-xs text-primary hover:text-primary"
                                    pendingText="Sending..."
                                  >
                                    <Send className="h-3 w-3" />
                                    Send
                                  </SubmitButton>
                                </form>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : hasCharge ? (
              <p className="text-sm text-muted-foreground">
                {formatMoney(unit.serviceChargeAmount!)} every{" "}
                {unit.serviceChargeCycleMonths}{" "}
                {unit.serviceChargeCycleMonths === 1 ? "month" : "months"} ·
                Due {format(unit.serviceChargeDueDate!, "d MMM yyyy")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No service charge set up yet.
              </p>
            )}
          </div>
        )}

        {/* ── Agreements ───────────────────────────────────────────────── */}
        {tab === "documents" && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Ownership contract</h3>
              <p className="text-xs text-muted-foreground">
                The signed contract establishing this unit&rsquo;s owner.
                Private to admins and the unit&rsquo;s owner.
              </p>
            </div>
            <EntityDocumentManager
              documents={unit.documents.filter(
                (d) => d.category === EntityDocumentCategory.ownership_contract,
              )}
              targetType="unit"
              targetId={unit.id}
              back={`/protected/properties/${unit.propertyId}`}
              categories={UNIT_CONTRACT_CATEGORY}
              compact
              readOnly={!canManageDocuments}
            />
            {!unit.owner && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Assign an owner to this {unitNoun} first — the contract is
                between the property manager and the owner.
              </p>
            )}
          </div>
        )}

        {/* ── Miscellaneous ────────────────────────────────────────────── */}
        {tab === "misc" && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Other documents</h3>
              <p className="text-xs text-muted-foreground">
                Anything else worth keeping on file for this {unitNoun} —
                insurance, correspondence, inspection photos, and the like.
              </p>
            </div>
            <EntityDocumentManager
              documents={unit.documents.filter(
                (d) => d.category === EntityDocumentCategory.other,
              )}
              targetType="unit"
              targetId={unit.id}
              back={`/protected/properties/${unit.propertyId}`}
              categories={UNIT_MISC_CATEGORY}
              compact
              readOnly={!canManageDocuments}
            />
          </div>
        )}

        {/* ── Danger zone ──────────────────────────────────────────────── */}
        {tab === "danger" && (
          <div className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="h-4 w-4 shrink-0 text-destructive" />
              Deleting a {unitNoun} cannot be undone. It must be empty and
              have no tenancy or financial history.
            </p>
            <form>
              <input type="hidden" name="unitId" value={unit.id} />
              <SubmitButton
                formAction={deleteUnitAction}
                variant="outline"
                size="sm"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
                pendingText="Deleting..."
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {unitNoun}
              </SubmitButton>
              <CloseModalOnSubmit />
            </form>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Ends the current ownership and starts the new one on the same transfer
 * date, with a recorded OwnershipTransfer row — the professional
 * alternative to just overwriting the unit's owner. */
function TransferOwnershipModal({
  unitId,
  unitLabel,
  currentOwnerName,
  owners,
}: {
  unitId: string;
  unitLabel: string;
  currentOwnerName: string;
  owners: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }[];
}) {
  return (
    <Modal
      title="Transfer ownership"
      description="Ends the current ownership on the transfer date and starts the new owner from the same date."
      trigger={
        <Button type="button" variant="outline" size="sm">
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Transfer
        </Button>
      }
    >
      <form action={transferUnitOwnershipAction} className="space-y-4">
        <input type="hidden" name="unitId" value={unitId} />
        <p className="text-sm text-muted-foreground">
          Current owner: <span className="font-medium text-foreground">{currentOwnerName}</span>
        </p>

        <div className="space-y-1.5">
          <Label htmlFor={`transfer-owner-${unitId}`}>New owner</Label>
          <Select id={`transfer-owner-${unitId}`} name="newOwnerId" required defaultValue="">
            <option value="" disabled>
              Select an owner
            </option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {ownerDisplayName(owner)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`transfer-date-${unitId}`}>Transfer date</Label>
          <Input
            id={`transfer-date-${unitId}`}
            name="transferDate"
            type="date"
            defaultValue={dateInputValue()}
            required
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="keepServiceCharge"
            defaultChecked
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          Keep the current service charge and billing setup
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="alsoTransferOtherUnits"
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          Also transfer the units currently held by the same owner
        </label>

        <div className="space-y-1.5">
          <Label htmlFor={`transfer-notes-${unitId}`}>Notes</Label>
          <Textarea id={`transfer-notes-${unitId}`} name="notes" className="min-h-20" />
        </div>

        <SubmitButton className="w-full" pendingText="Transferring...">
          Transfer {unitLabel}
        </SubmitButton>
        <CloseModalOnSubmit />
      </form>
    </Modal>
  );
}
