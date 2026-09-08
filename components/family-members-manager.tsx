"use client";

import { useActionState, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, Paperclip, Plus, Trash2, User } from "lucide-react";

import {
  addFamilyMemberAction,
  deleteFamilyMemberAction,
  updateFamilyMemberAction,
  type FamilyMemberActionResult,
} from "@/app/admin-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  EXPIRY_STATUS_META,
  FAMILY_CIVIL_ID_EXPIRING_SOON_DAYS,
  getExpiryStatus,
} from "@/lib/hr";
import type { FamilyRelationship } from "@/lib/generated/prisma/client";

export type FamilyMemberItem = {
  id: string;
  name: string;
  relationship: FamilyRelationship;
  civilIdIssuance: Date | null;
  civilIdExpiry: Date | null;
  documentFileName: string | null;
  documentFileSize: number | null;
};

const RELATIONSHIPS: FamilyRelationship[] = ["spouse", "father", "mother"];

const RELATIONSHIP_LABEL: Record<FamilyRelationship, string> = {
  spouse: "Spouse",
  father: "Father",
  mother: "Mother",
};

const LIMITS: Record<FamilyRelationship, number> = {
  spouse: 4,
  father: 1,
  mother: 1,
};

const NO_RESULT: FamilyMemberActionResult = { ok: true, message: "" };

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function counts(members: FamilyMemberItem[]): Record<FamilyRelationship, number> {
  return {
    spouse: members.filter((m) => m.relationship === "spouse").length,
    father: members.filter((m) => m.relationship === "father").length,
    mother: members.filter((m) => m.relationship === "mother").length,
  };
}

/** Relationship options still open, plus `keepValue` if given (so editing an
 * existing member always keeps their own current relationship selectable,
 * even though it already fills that slot). Once 1/1 father or 1/1 mother
 * (or 4/4 spouse) is on file, that option disappears from every other
 * picker instead of letting the admin pick it and hit a rejected save. */
function availableRelationships(
  memberCounts: Record<FamilyRelationship, number>,
  keepValue?: FamilyRelationship,
): FamilyRelationship[] {
  return RELATIONSHIPS.filter(
    (r) => r === keepValue || memberCounts[r] < LIMITS[r],
  );
}

function ActionError({ result }: { result: FamilyMemberActionResult }) {
  if (result.ok || !result.message) return null;
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
      {result.message}
    </p>
  );
}

/** One existing family member — strictly the fields relevant to a
 * dependent's own record (name, relationship, Bataka dates, document),
 * collapsible so a long list of dependents stays scannable. Driven by
 * useActionState rather than a plain form action: the underlying actions
 * no longer redirect (a redirect would close the HR modal this list lives
 * in), so this is what surfaces the pending spinner and any error inline
 * and keeps the admin exactly where they were. */
function FamilyMemberCard({
  member,
  index,
  relationshipOptions,
}: {
  member: FamilyMemberItem;
  index: number;
  relationshipOptions: FamilyRelationship[];
}) {
  const [open, setOpen] = useState(true);
  const expiry = getExpiryStatus(
    member.civilIdExpiry,
    FAMILY_CIVIL_ID_EXPIRING_SOON_DAYS,
  );
  const expiryMeta = EXPIRY_STATUS_META[expiry.status];
  const [updateResult, updateAction, updatePending] = useActionState(
    (_prev: FamilyMemberActionResult, formData: FormData) =>
      updateFamilyMemberAction(formData),
    NO_RESULT,
  );
  const [deleteResult, deleteAction, deletePending] = useActionState(
    (_prev: FamilyMemberActionResult, formData: FormData) =>
      deleteFamilyMemberAction(formData),
    NO_RESULT,
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-semibold">
            Family Member {index + 1}
            <span className="ml-1.5 font-normal text-muted-foreground">
              ({RELATIONSHIP_LABEL[member.relationship]})
            </span>
          </span>
        </button>
        {expiry.status !== "not_set" && (
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${expiryMeta.pill}`}
          >
            {expiryMeta.label}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <form action={deleteAction}>
            <input type="hidden" name="memberId" value={member.id} />
            <button
              type="submit"
              disabled={deletePending}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              aria-label={`Remove ${member.name || "family member"}`}
            >
              {deletePending ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </form>
        </div>
      </div>

      {open && (
        <form action={updateAction} className="space-y-4 p-4">
          <input type="hidden" name="memberId" value={member.id} />

          <ActionError result={updateResult} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`fm-name-${member.id}`} className="text-xs">
                Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                id={`fm-name-${member.id}`}
                name="name"
                placeholder="Full name"
                defaultValue={member.name}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`fm-rel-${member.id}`} className="text-xs">
                Relationship <span className="text-rose-500">*</span>
              </Label>
              <Select
                id={`fm-rel-${member.id}`}
                name="relationship"
                defaultValue={member.relationship}
              >
                {relationshipOptions.map((r) => (
                  <option key={r} value={r}>
                    {RELATIONSHIP_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Bataka (ID Card)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`fm-issue-${member.id}`} className="text-xs">
                  Issue Date
                </Label>
                <Input
                  id={`fm-issue-${member.id}`}
                  name="civilIdIssuance"
                  type="date"
                  max={toDateInputValue(new Date())}
                  defaultValue={toDateInputValue(member.civilIdIssuance)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`fm-expiry-${member.id}`} className="text-xs">
                  Expiry Date
                </Label>
                <Input
                  id={`fm-expiry-${member.id}`}
                  name="civilIdExpiry"
                  type="date"
                  defaultValue={toDateInputValue(member.civilIdExpiry)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Document File</Label>
            {member.documentFileName && (
              <a
                href={`/api/family-document/${member.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-2 text-xs text-foreground hover:bg-muted/60"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{member.documentFileName}</span>
                {member.documentFileSize != null && (
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {formatBytes(member.documentFileSize)}
                  </span>
                )}
              </a>
            )}
            <input
              type="file"
              name="document"
              accept="application/pdf,image/*"
              className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border/60 file:bg-card file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/60"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={updatePending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-60"
            >
              {updatePending && (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              )}
              {updatePending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** The "+ Add Family Member" form — collapsed to a single button until
 * clicked. Closes itself (via the useEffect below) the moment the add
 * succeeds, rather than needing the admin to dismiss it manually. */
function AddFamilyMemberForm({
  workerId,
  index,
  relationshipOptions,
  onDone,
}: {
  workerId: string;
  index: number;
  relationshipOptions: FamilyRelationship[];
  onDone: () => void;
}) {
  const [result, formAction, pending] = useActionState(
    (_prev: FamilyMemberActionResult, formData: FormData) =>
      addFamilyMemberAction(formData),
    NO_RESULT,
  );

  useEffect(() => {
    if (result.ok && result.message) onDone();
    // Only react to a genuine completed submission, not the initial state —
    // NO_RESULT.message is "" precisely so it never matches here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-lg border border-border/60 bg-background"
    >
      <input type="hidden" name="workerId" value={workerId} />

      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-3">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Family Member {index + 1}</span>
      </div>

      <div className="space-y-4 p-4">
        <ActionError result={result} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="fm-new-name" className="text-xs">
              Name <span className="text-rose-500">*</span>
            </Label>
            <Input id="fm-new-name" name="name" placeholder="Full name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fm-new-rel" className="text-xs">
              Relationship <span className="text-rose-500">*</span>
            </Label>
            <Select
              id="fm-new-rel"
              name="relationship"
              defaultValue={relationshipOptions[0]}
            >
              {relationshipOptions.map((r) => (
                <option key={r} value={r}>
                  {RELATIONSHIP_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Bataka (ID Card)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fm-new-issue" className="text-xs">
                Issue Date
              </Label>
              <Input
                id="fm-new-issue"
                name="civilIdIssuance"
                type="date"
                max={toDateInputValue(new Date())}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fm-new-expiry" className="text-xs">
                Expiry Date
              </Label>
              <Input id="fm-new-expiry" name="civilIdExpiry" type="date" />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fm-new-document" className="text-xs">
            Document File
          </Label>
          <input
            id="fm-new-document"
            type="file"
            name="document"
            accept="application/pdf,image/*"
            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border/60 file:bg-card file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/60"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onDone}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {pending && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            {pending ? "Adding..." : "Add family member"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function FamilyMembersManager({
  workerId,
  members,
}: {
  workerId: string;
  members: FamilyMemberItem[];
}) {
  const [adding, setAdding] = useState(false);
  const memberCounts = counts(members);
  const newMemberOptions = availableRelationships(memberCounts);
  const atCapacity = newMemberOptions.length === 0;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
        <p className="text-muted-foreground">
          Up to {LIMITS.spouse} spouses · {LIMITS.father} father ·{" "}
          {LIMITS.mother} mother
        </p>
        <p className="font-medium">
          Spouses: {memberCounts.spouse}/{LIMITS.spouse} · Father:{" "}
          {memberCounts.father}/{LIMITS.father} · Mother:{" "}
          {memberCounts.mother}/{LIMITS.mother}
        </p>
      </div>

      <div className="space-y-3">
        {members.map((member, index) => (
          <FamilyMemberCard
            key={member.id}
            member={member}
            index={index}
            relationshipOptions={availableRelationships(
              memberCounts,
              member.relationship,
            )}
          />
        ))}
        {adding && (
          <AddFamilyMemberForm
            workerId={workerId}
            index={members.length}
            relationshipOptions={newMemberOptions}
            onDone={() => setAdding(false)}
          />
        )}
      </div>

      {!adding && (
        <button
          type="button"
          disabled={atCapacity}
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border/60 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Family Member
        </button>
      )}
      {atCapacity && !adding && (
        <p className="text-center text-xs text-muted-foreground">
          All family member slots are filled.
        </p>
      )}
    </div>
  );
}
