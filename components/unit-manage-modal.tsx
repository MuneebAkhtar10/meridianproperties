"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeftRight,
  FileStack,
  FileText,
  KeyRound,
  Pencil,
  Settings2,
  Trash2,
} from "lucide-react";

import {
  assignTenantAction,
  deleteUnitAction,
  transferUnitOwnershipAction,
  updateUnitAction,
} from "@/app/admin-actions";
import {
  EntityDocumentManager,
  type DocumentItem,
} from "@/components/entity-document-manager";
import { UnitServiceChargePanel } from "@/components/unit-service-charge-panel";
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
} from "@/lib/finance";
import { cn, personDisplayName as ownerDisplayName } from "@/lib/utils";
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
  tenant: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  } | null;
  /** The unit's currently-active tenancy (endDate: null), if any — its own
   * documents (tenancy agreement, municipality registration, ...) show as
   * the "Tenant Contract" section in the Agreements tab, below the
   * ownership contract. Null when the unit has no tenant right now. */
  activeTenancy: { id: string; documents: DocumentItem[] } | null;
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
    dueDate: Date;
    graceDays: number;
    periodStart: Date;
    periodEnd: Date;
    currentAmount: string;
    previousBalance: string;
    amountPayable: string;
    billedOwner: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }[];
  serviceChargePayments: {
    id: string;
    amount: string;
    paidAt: Date;
    note: string | null;
    transactionNumber: string | null;
    originalAmount: string | null;
    correctionNote: string | null;
    fromInstallment: boolean;
    billedOwner: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
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
    keptInstallmentPlan: boolean;
    notes: string | null;
    createdAt: Date;
    fromOwner: { email: string; firstName: string | null; lastName: string | null } | null;
    toOwner: { email: string; firstName: string | null; lastName: string | null };
    createdBy: { email: string; firstName: string | null; lastName: string | null } | null;
  }[];
};

type TabKey = "details" | "ownership" | "charge" | "documents" | "misc" | "danger";

/** The tenant-change confirmation modal — a Select + Save button identical
 * to the one this replaced, just tucked behind an explicit "Manage"/"Assign"
 * action with a warning first, since swapping the tenant isn't a cosmetic
 * edit: assignTenantAction (app/admin-actions.ts) ends the unit's current
 * tenancy record today and opens a new zero-rent placeholder one for
 * whoever is assigned next, which then needs its real terms filled in on
 * Tenancies. The Select/Save target the outer Details-tab form via the
 * `form` attribute, so they work the same whether rendered inline or, as
 * here, inside a nested modal portalled elsewhere in the DOM. */
function ChangeTenantModal({
  unit,
  unitNoun,
  availableTenants,
  tenantFormId,
}: {
  unit: ManagedUnit;
  unitNoun: string;
  availableTenants: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }[];
  tenantFormId: string;
}) {
  return (
    <Modal
      title={unit.tenant ? "Change tenant" : "Assign tenant"}
      description={`Move a different tenant into this ${unitNoun}.`}
      overlayZClassName="z-[70]"
      trigger={
        <Button type="button" variant="outline" size="sm" className="shrink-0">
          {unit.tenant ? "Manage" : "Assign"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>
            {unit.tenant
              ? `Changing the tenant ends ${ownerDisplayName(unit.tenant)}'s current tenancy record today and starts a new, zero-rent placeholder agreement for whoever moves in next — you'll need to fill in the real rent, deposit and lease terms afterward in Tenancies.`
              : `Assigning a tenant here starts a new, zero-rent placeholder tenancy — you'll need to fill in the real rent, deposit and lease terms afterward in Tenancies.`}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`u-tenant-${unit.id}`} className="text-xs">
            Tenant
          </Label>
          <Select
            id={`u-tenant-${unit.id}`}
            name="tenantId"
            form={tenantFormId}
            defaultValue={unit.tenant?.id ?? ""}
            aria-label={`Tenant for ${unitNoun} ${unit.label}`}
          >
            <option value="">— Empty —</option>
            {unit.tenant && (
              <option value={unit.tenant.id}>
                {ownerDisplayName(unit.tenant)}
              </option>
            )}
            {availableTenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {ownerDisplayName(tenant)}
              </option>
            ))}
          </Select>
        </div>
        <SubmitButton
          form={tenantFormId}
          formAction={assignTenantAction}
          size="sm"
          className="w-full"
          pendingText="Saving..."
        >
          Save
        </SubmitButton>
      </div>
    </Modal>
  );
}

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
  collectsServiceCharge = true,
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
  /** Independent properties never take service charge — hide that tab. */
  collectsServiceCharge?: boolean;
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
  availableTenants: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }[];
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
  const activePlan = unit.installmentPlans[0] ?? null;
  const currentBalance = moneyValue(unit.serviceChargeBalance);

  const tabs: { key: TabKey; label: string; icon: typeof Pencil }[] = [
    { key: "details", label: "Details", icon: Pencil },
    { key: "ownership", label: "Ownership", icon: ArrowLeftRight },
    ...(collectsServiceCharge
      ? [{ key: "charge" as const, label: "Service charge", icon: Settings2 }]
      : []),
    { key: "documents", label: "Agreements", icon: FileText },
    { key: "misc", label: "Miscellaneous", icon: FileStack },
    { key: "danger", label: "Danger zone", icon: Trash2 },
  ];

  const tenantFormId = `unit-tenant-form-${unit.id}`;
  const persistOpenKey = `unit-manage-open:${unit.id}`;
  const persistTabKey = `unit-manage-tab:${unit.id}`;

  const [tab, setTab] = useState<TabKey>(
    !collectsServiceCharge && defaultTab === "charge" ? "details" : defaultTab,
  );

  useEffect(() => {
    try {
      if (sessionStorage.getItem(persistOpenKey) !== "1") return;
      const stored = sessionStorage.getItem(persistTabKey);
      if (
        stored === "details" ||
        stored === "ownership" ||
        (collectsServiceCharge && stored === "charge") ||
        stored === "documents" ||
        stored === "misc" ||
        stored === "danger"
      ) {
        setTab(stored);
      }
    } catch {
      /* ignore */
    }
  }, [persistOpenKey, persistTabKey, collectsServiceCharge]);

  useEffect(() => {
    try {
      sessionStorage.setItem(persistTabKey, tab);
    } catch {
      /* ignore */
    }
  }, [persistTabKey, tab]);

  return (
    <Modal
      title={`Manage ${unitLabel}`}
      widthClassName="max-w-3xl"
      persistOpenKey={persistOpenKey}
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
              <div className="col-span-full space-y-1.5">
                <Label className="text-xs">Tenant</Label>
                {unit.tenant ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {ownerDisplayName(unit.tenant)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[unit.tenant.phone, unit.tenant.email]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <ChangeTenantModal
                      unit={unit}
                      unitNoun={unitNoun}
                      availableTenants={availableTenants}
                      tenantFormId={tenantFormId}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">
                      This {unitNoun} is empty.
                    </p>
                    <ChangeTenantModal
                      unit={unit}
                      unitNoun={unitNoun}
                      availableTenants={availableTenants}
                      tenantFormId={tenantFormId}
                    />
                  </div>
                )}
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
                  currentBalance={currentBalance}
                  hasActivePlan={Boolean(
                    activePlan?.installments.some((item) => !item.paidAt),
                  )}
                  collectsServiceCharge={collectsServiceCharge}
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
                            {[
                              collectsServiceCharge
                                ? transfer.keptServiceCharge
                                  ? "Kept the existing annual service charge"
                                  : "Annual service charge setup was cleared"
                                : null,
                              collectsServiceCharge
                                ? transfer.keptInstallmentPlan
                                  ? "continued the payment plan"
                                  : "cancelled the payment plan for a new schedule"
                                : null,
                              transfer.createdBy
                                ? `By ${ownerDisplayName(transfer.createdBy)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
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

        {tab === "charge" && collectsServiceCharge && (
          <UnitServiceChargePanel unit={unit} funds={funds} isAdmin={isAdmin} />
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
              inline
              readOnly={!canManageDocuments}
            />
            {!unit.owner && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Assign an owner to this {unitNoun} first — the contract is
                between the property manager and the owner.
              </p>
            )}

            {unit.activeTenancy && (
              <div className="space-y-3 border-t pt-3">
                <div>
                  <h3 className="text-sm font-medium">Tenant contract</h3>
                  <p className="text-xs text-muted-foreground">
                    Agreement, municipality registration and move-in records
                    for this {unitNoun}&rsquo;s current tenancy — the same
                    documents shown on the tenancy&rsquo;s own record.
                  </p>
                </div>
                <EntityDocumentManager
                  documents={unit.activeTenancy.documents}
                  targetType="tenancy"
                  targetId={unit.activeTenancy.id}
                  back={`/protected/properties/${unit.propertyId}`}
                  inline
                  readOnly={!canManageDocuments}
                />
              </div>
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
              inline
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
  currentBalance,
  hasActivePlan,
  collectsServiceCharge,
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
  currentBalance: number;
  hasActivePlan: boolean;
  collectsServiceCharge: boolean;
}) {
  return (
    <Modal
      title="Transfer ownership"
      description="Ends the current ownership on the transfer date and starts the new owner from the same date."
      overlayZClassName="z-[70]"
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

        {collectsServiceCharge ? (
          currentBalance > 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            This unit has an outstanding balance of{" "}
            <span className="font-semibold">{formatMoney(currentBalance)}</span>{" "}
            from the current owner — it carries over to the new owner as-is.
          </p>
        ) : (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            {currentBalance < 0
              ? `This unit is in credit by ${formatMoney(Math.abs(currentBalance))} — the new owner inherits that credit.`
              : "This unit's service charge is fully cleared — nothing outstanding to carry over."}
          </p>
        )
        ) : null}

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

        {collectsServiceCharge && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="keepServiceCharge"
              defaultChecked
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            Keep the current annual service charge for the new owner
          </label>
        )}

        {collectsServiceCharge && hasActivePlan ? (
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">Payment plan</legend>
            <p className="text-xs text-muted-foreground">
              This unit has an active installment plan. Choose whether the new
              owner continues it or starts a different schedule.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="installmentPlanAction"
                value="continue"
                defaultChecked
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              Continue the same payment plan
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="installmentPlanAction"
                value="cancel"
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              Cancel it — the new owner will set up a different plan
            </label>
          </fieldset>
        ) : (
          <input type="hidden" name="installmentPlanAction" value="continue" />
        )}

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
