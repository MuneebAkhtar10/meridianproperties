"use client";

import { useState, type ReactNode } from "react";
import {
  BadgeCheck,
  BookUser,
  Car,
  Fingerprint,
  IdCard,
  LoaderCircle,
  Paperclip,
  Plane,
  ShieldCheck,
} from "lucide-react";

import { updateWorkerHrAction } from "@/app/admin-actions";
import { EntityDocumentManager } from "@/components/entity-document-manager";
import {
  FamilyMembersManager,
  type FamilyMemberItem,
} from "@/components/family-members-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  EXPIRY_STATUS_META,
  HR_DOCUMENTS,
  getExpiryStatus,
  getWorstHrStatus,
  type ExpiryStatus,
  type HrDocumentConfig,
  type WorkerHrRecord,
} from "@/lib/hr";
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

/** Maps an HR document key to the upload category it shares with the
 * existing "Identity documents" file manager, so attaching a scan here and
 * from that section stay the same underlying record. */
const DOCUMENT_UPLOAD_CATEGORY: Record<
  HrDocumentConfig["key"],
  EntityDocumentCategory
> = {
  passport: "passport",
  drivingLicense: "driving_license",
  visa: "visa",
  civilId: "civil_id",
  vehicleRegistration: "vehicle_registration",
  carInsurance: "car_insurance",
};

/** Each document type gets its own accent color, purely for visual variety
 * and quick recognition — independent of expiry status, which is carried by
 * the pill and the card's left edge instead. */
const DOCUMENT_THEME: Record<
  HrDocumentConfig["key"],
  { icon: ReactNode; badge: string; header: string }
> = {
  passport: {
    icon: <BookUser className="h-4 w-4" />,
    badge: "bg-white/70 text-indigo-600 ring-indigo-600/20",
    header: "from-indigo-500/15 to-indigo-500/0",
  },
  drivingLicense: {
    icon: <IdCard className="h-4 w-4" />,
    badge: "bg-white/70 text-sky-600 ring-sky-600/20",
    header: "from-sky-500/15 to-sky-500/0",
  },
  visa: {
    icon: <Plane className="h-4 w-4" />,
    badge: "bg-white/70 text-violet-600 ring-violet-600/20",
    header: "from-violet-500/15 to-violet-500/0",
  },
  civilId: {
    icon: <Fingerprint className="h-4 w-4" />,
    badge: "bg-white/70 text-teal-600 ring-teal-600/20",
    header: "from-teal-500/15 to-teal-500/0",
  },
  vehicleRegistration: {
    icon: <Car className="h-4 w-4" />,
    badge: "bg-white/70 text-orange-600 ring-orange-600/20",
    header: "from-orange-500/15 to-orange-500/0",
  },
  carInsurance: {
    icon: <ShieldCheck className="h-4 w-4" />,
    badge: "bg-white/70 text-cyan-600 ring-cyan-600/20",
    header: "from-cyan-500/15 to-cyan-500/0",
  },
};

const STATUS_RING: Record<ExpiryStatus, string> = {
  expired: "ring-rose-300",
  expiring: "ring-amber-300",
  valid: "ring-emerald-200",
  not_set: "ring-border/60",
};

const STATUS_TOP_BAR: Record<ExpiryStatus, string> = {
  expired: "bg-rose-500",
  expiring: "bg-amber-500",
  valid: "bg-emerald-500",
  not_set: "bg-slate-300",
};

/** The modal's icon badge picks up the worst status color instead of the
 * whole header — a full red/amber header bar reads as an alarm banner
 * rather than a title bar, so the header itself stays a calm, consistent
 * slate and the status lives in the badge and the banner underneath. */
const STATUS_ICON_BADGE: Record<ExpiryStatus, string> = {
  expired: "bg-rose-400/90 text-white",
  expiring: "bg-amber-400/90 text-white",
  valid: "bg-emerald-400/90 text-white",
  not_set: "bg-white/15 text-white",
};

/** The modal's summary banner text — phrased as a call to action for the
 * two states that actually need one, rather than a flat status readout. */
const OVERALL_STATUS_TEXT: Record<ExpiryStatus, string> = {
  expired: "Action needed: documents expired",
  expiring: "Action needed: documents expiring soon",
  valid: "All documents valid",
  not_set: "No documents on file yet",
};

/** Converts a Date to the "yyyy-MM-dd" shape <input type="date"> needs,
 * without pulling in date-fns just for this. */
function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function WorkerHrBadge({
  record,
  familyMembers = [],
}: {
  record: WorkerHrRecord;
  familyMembers?: FamilyMemberItem[];
}) {
  const status = getWorstHrStatus(record, familyMembers);
  const meta = EXPIRY_STATUS_META[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      HR: {meta.label}
    </span>
  );
}

/** One document's full card: number/issuance/expiry fields, and — once the
 * worker's account (and document storage) exists — the file attachment
 * inline right below, so each document is a single self-contained block
 * instead of its fields and its upload living in two separate sections. */
function HrDocumentCard({
  doc,
  idPrefix,
  record,
  formId,
  userId,
  documents,
}: {
  doc: HrDocumentConfig;
  idPrefix: string;
  record: Partial<WorkerHrRecord>;
  formId?: string;
  /** When set (edit mode), the file-attachment uploader for this exact
   * document renders inline below the fields. */
  userId?: string;
  documents?: DocumentItem[];
}) {
  const expiryValue = (record[doc.expiryField] as Date | null) ?? null;
  const { status } = getExpiryStatus(expiryValue, doc.expiringSoonDays);
  const meta = EXPIRY_STATUS_META[status];
  const showStatus = status !== "not_set";
  const theme = DOCUMENT_THEME[doc.key];
  const category = DOCUMENT_UPLOAD_CATEGORY[doc.key];

  return (
    <div
      className={`overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-inset ${STATUS_RING[status]}`}
    >
      <div className={`h-1 ${STATUS_TOP_BAR[status]}`} />
      <div
        className={`space-y-3.5 bg-gradient-to-b p-4 ${theme.header}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${theme.badge}`}
            >
              {theme.icon}
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">
                {doc.label}
              </p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                {doc.alertHint}
              </p>
            </div>
          </div>
          {showStatus && (
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${meta.pill}`}
            >
              {meta.label}
            </span>
          )}
        </div>

        {doc.numberEditable ? (
          <div className="space-y-1.5">
            <Label
              htmlFor={`${idPrefix}-${doc.key}-number`}
              className="text-xs"
            >
              {doc.numberLabel}
            </Label>
            <Input
              id={`${idPrefix}-${doc.key}-number`}
              name={`${doc.key}Number`}
              form={formId}
              className="bg-card"
              defaultValue={(record[doc.numberField] as string) ?? ""}
            />
          </div>
        ) : (
          <p className="rounded-lg bg-card/80 px-2.5 py-2 text-xs text-muted-foreground ring-1 ring-inset ring-border/40">
            {doc.numberLabel} is edited above, under &ldquo;Oman identity
            &amp; contact record&rdquo;.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label
              htmlFor={`${idPrefix}-${doc.key}-issuance`}
              className="text-xs"
            >
              Issuance date
            </Label>
            <Input
              id={`${idPrefix}-${doc.key}-issuance`}
              name={`${doc.key}Issuance`}
              form={formId}
              type="date"
              max={toDateInputValue(new Date())}
              className="bg-card"
              defaultValue={toDateInputValue(
                (record[doc.issuanceField] as Date | null) ?? null,
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor={`${idPrefix}-${doc.key}-expiry`}
              className="text-xs"
            >
              Expiry date
            </Label>
            <Input
              id={`${idPrefix}-${doc.key}-expiry`}
              name={`${doc.key}Expiry`}
              form={formId}
              type="date"
              className="bg-card"
              defaultValue={toDateInputValue(expiryValue)}
            />
          </div>
        </div>

        {userId && documents ? (
          <div className="space-y-1.5 border-t border-border/40 pt-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Paperclip className="h-3 w-3" />
              Scan
            </p>
            <EntityDocumentManager
              documents={documents.filter((d) => d.category === category)}
              targetType="user"
              targetId={userId}
              back="/protected/users"
              categories={[category]}
              compact
            />
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Paperclip className="h-3 w-3 shrink-0" />
            The scan can be attached once the account is created.
          </p>
        )}
      </div>
    </div>
  );
}

/** The checkbox that gates the vehicle-only documents, shared in look
 * between the edit and creation modals. */
function VehicleToggle({
  checked,
  onChange,
  formId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  formId?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm font-medium transition-colors ${
        checked
          ? "border-orange-300 bg-orange-50/70"
          : "border-border/60 hover:bg-muted/40"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${
          checked
            ? "bg-orange-100 text-orange-600 ring-orange-300"
            : "bg-muted text-muted-foreground ring-border/60"
        }`}
      >
        <Car className="h-4 w-4" />
      </span>
      <span className="flex-1">Does this employee have / drive a vehicle for work?</span>
      <input
        type="checkbox"
        name="hasVehicle"
        value="on"
        form={formId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-orange-500"
      />
    </label>
  );
}

/** Individual vs. family employee — mirrors VehicleToggle's look. A family
 * employee gets a dependents section (spouse/father/mother) below the
 * standard documents, each with their own Bataka record. */
function EmployeeTypeToggle({
  value,
  onChange,
  formId,
}: {
  value: "individual" | "family";
  onChange: (value: "individual" | "family") => void;
  formId: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Employee type</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(["individual", "family"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
              value === option
                ? "border-teal-400 bg-teal-50 text-teal-700"
                : "border-input text-muted-foreground hover:bg-muted"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <input type="hidden" name="employeeType" value={value} form={formId} />
    </div>
  );
}

export function WorkerHrModal({
  userId,
  record,
  documents,
  employeeType = "individual",
  familyMembers = [],
  trigger,
}: {
  userId: string;
  record: WorkerHrRecord;
  documents: DocumentItem[];
  /** "individual" (default) or "family" — a family employee's dependents
   * get their own Bataka records tracked below. */
  employeeType?: string;
  familyMembers?: FamilyMemberItem[];
  /** Custom trigger element — used by the People page's HR overview to open
   * this same modal from a summary row instead of the default button. */
  trigger?: ReactNode;
}) {
  const [hasVehicle, setHasVehicle] = useState(record.hasVehicle);
  const [employeeTypeValue, setEmployeeTypeValue] = useState<
    "individual" | "family"
  >(employeeType === "family" ? "family" : "individual");
  // useFormStatus (what SubmitButton normally uses for its spinner) only
  // reports pending state for a <form> that's an actual React ancestor —
  // this button triggers a form it's not nested inside (see the note by
  // formId below), so the pending state is tracked by hand instead.
  const [saving, setSaving] = useState(false);
  const worstStatus = getWorstHrStatus(record, familyMembers);
  const meta = EXPIRY_STATUS_META[worstStatus];
  // Each document's own file-attachment uploader is now inline inside its
  // card (see HrDocumentCard), and it renders its own real <form>. A
  // <form> can't contain another <form> in HTML, so the HR-fields form
  // below can't literally wrap the cards — instead it's an empty <form>
  // tag placed as a sibling, and every field associates with it via the
  // HTML `form` attribute (the same technique NewWorkerHrModal already
  // uses to submit through the "Add a person" form despite the modal
  // portal).
  const formId = `hr-form-${userId}`;

  return (
    <Modal
      trigger={
        trigger ?? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Paperclip className="h-3.5 w-3.5" />
            HR Record
          </button>
        )
      }
      title="HR document record"
      description="Passport, driving license, Bataka, and — if applicable — vehicle documents required for employing this worker."
      widthClassName="max-w-3xl"
      headerClassName="bg-gradient-to-r from-violet-700 to-indigo-600 border-transparent text-white [&_h2]:text-white [&_p]:text-white/70 [&_button]:text-white/70 [&_button:hover]:bg-white/15 [&_button:hover]:text-white"
      icon={
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${STATUS_ICON_BADGE[worstStatus]}`}
        >
          <BadgeCheck className="h-5 w-5" />
        </span>
      }
    >
      <div
        className={`mb-5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ring-1 ring-inset ${meta.pill}`}
      >
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
        {OVERALL_STATUS_TEXT[worstStatus]}
      </div>

      {/* Empty on purpose — every field below joins it via `form={formId}`
          instead of DOM nesting, since some of those fields sit inside
          cards that also contain their own upload <form>. */}
      <form id={formId} action={updateWorkerHrAction} className="hidden" />

      <div className="space-y-5">
        <input type="hidden" name="userId" value={userId} form={formId} />

        <EmployeeTypeToggle
          value={employeeTypeValue}
          onChange={setEmployeeTypeValue}
          formId={formId}
        />

        {employeeTypeValue === "individual" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {HR_DOCUMENTS.filter((doc) => !doc.vehicleOnly).map((doc) => (
                <HrDocumentCard
                  key={doc.key}
                  doc={doc}
                  idPrefix={`edit-${userId}`}
                  record={record}
                  formId={formId}
                  userId={userId}
                  documents={documents}
                />
              ))}
            </div>

            <VehicleToggle
              checked={hasVehicle}
              onChange={setHasVehicle}
              formId={formId}
            />

            {hasVehicle && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Vehicle documents
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {HR_DOCUMENTS.filter((doc) => doc.vehicleOnly).map((doc) => (
                    <HrDocumentCard
                      key={doc.key}
                      doc={doc}
                      idPrefix={`edit-${userId}`}
                      record={record}
                      formId={formId}
                      userId={userId}
                      documents={documents}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <FamilyMembersManager workerId={userId} members={familyMembers} />
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            disabled={saving}
            aria-disabled={saving}
            onClick={() => {
              // The button lives outside the <form> it saves (see the note
              // above), so rather than lean on a plain type="submit" +
              // form={formId} pairing, trigger the submission explicitly —
              // requestSubmit() runs the exact same submit algorithm
              // (including gathering every form={formId}-associated
              // field), just from JS instead of native button wiring. The
              // page navigates away on success (see updateWorkerHrAction's
              // redirect), so `saving` never needs to be reset back to
              // false — the whole component unmounts first.
              setSaving(true);
              const form = document.getElementById(
                formId,
              ) as HTMLFormElement | null;
              form?.requestSubmit();
            }}
          >
            {saving ? (
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <BadgeCheck className="h-4 w-4" />
            )}
            {saving ? "Saving..." : "Save HR record"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The "Add a person" creation form's HR trigger: only meaningful once
 * "Worker" + "In-house" is picked (see components/new-person-fields.tsx),
 * so a brand-new in-house worker's paperwork can be entered in the same
 * step as creating their account rather than as a separate follow-up edit.
 * File attachment isn't offered here since the account (and its document
 * storage) doesn't exist until "Create account" is actually submitted.
 */
export function NewWorkerHrModal({ formId }: { formId: string }) {
  const [hasVehicle, setHasVehicle] = useState(false);

  return (
    <Modal
      trigger={
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border/60 hover:bg-muted hover:text-foreground"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Add HR documents (passport, Bataka...)
        </button>
      }
      title="HR document record"
      description="Optional at creation — saved together with the account below. Scanned documents can be attached afterwards from this person's card."
      widthClassName="max-w-3xl"
      headerClassName="bg-gradient-to-r from-indigo-600 to-violet-600 border-transparent text-white [&_h2]:text-white [&_p]:text-white/80 [&_button]:text-white/80 [&_button:hover]:bg-white/15 [&_button:hover]:text-white"
      icon={
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
          <BadgeCheck className="h-5 w-5" />
        </span>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {HR_DOCUMENTS.filter((doc) => !doc.vehicleOnly).map((doc) => (
            <HrDocumentCard
              key={doc.key}
              doc={doc}
              idPrefix="new-worker"
              record={{}}
              formId={formId}
            />
          ))}
        </div>

        <VehicleToggle
          checked={hasVehicle}
          onChange={setHasVehicle}
          formId={formId}
        />

        {hasVehicle && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vehicle documents
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {HR_DOCUMENTS.filter((doc) => doc.vehicleOnly).map((doc) => (
                <HrDocumentCard
                  key={doc.key}
                  doc={doc}
                  idPrefix="new-worker"
                  record={{}}
                  formId={formId}
                />
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          These are saved together when you click &ldquo;Create
          account&rdquo; below — no separate save needed here.
        </p>
      </div>
    </Modal>
  );
}
