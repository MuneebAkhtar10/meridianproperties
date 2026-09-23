"use client";

import { useActionState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { AlertTriangle, Check, ExternalLink, FileText, Trash2, Upload } from "lucide-react";

import {
  deleteEntityDocumentAction,
  uploadEntityDocumentsAction,
  uploadEntityDocumentsInlineAction,
  type UploadDocumentsState,
} from "@/app/document-actions";
import { SubmitButton } from "@/components/submit-button";
import { UploadFileInput } from "@/components/upload-file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ENTITY_DOCUMENT_CATEGORY_LABEL,
  categoriesForTarget,
  type EntityDocumentTargetType,
} from "@/lib/entity-documents";
import { MAX_UPLOAD_LABEL } from "@/lib/upload-limits";
import { dateInputValue } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { EntityDocumentCategory } from "@/lib/generated/prisma/client";

export type DocumentItem = {
  id: string;
  category: EntityDocumentCategory;
  label: string | null;
  fileName: string;
  fileSize: number;
  createdAt: Date;
  /** When this document stops being valid — null means it doesn't expire.
   * Feeds the same 90/60/30/15/7-day reminder ladder as tenant and
   * building agreements, see lib/agreement-expiry.ts. */
  expiresAt?: Date | null;
  canDelete?: boolean;
};

/** A short "Expires in 12d" / "Expired 3d ago" chip, styled by urgency —
 * amber inside the 30-day reminder window, rose once it's actually passed.
 * Returns null when the document has no expiry date at all. */
function ExpiryChip({ expiresAt }: { expiresAt: Date | null | undefined }) {
  if (!expiresAt) return null;
  const days = differenceInCalendarDays(expiresAt, new Date());
  const expired = days < 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        expired
          ? "bg-rose-100 text-rose-700"
          : days <= 30
            ? "bg-amber-100 text-amber-700"
            : "bg-muted text-muted-foreground",
      )}
    >
      {(expired || days <= 30) && <AlertTriangle className="h-2.5 w-2.5" />}
      {expired
        ? `Expired ${Math.abs(days)}d ago`
        : `Expires ${expiresAt.toLocaleDateString("en-GB")}`}
    </span>
  );
}

/** The upload result banner shown right inside the form (inline mode
 * only) — green on success, amber on error — instead of a page-level
 * message a caller (e.g. a modal) might otherwise cover up. */
function UploadResultBanner({ state }: { state: UploadDocumentsState }) {
  if (!state) return null;
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium",
        state.ok
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-800",
      )}
    >
      {state.ok ? (
        <Check className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      )}
      {state.message}
    </p>
  );
}

export function EntityDocumentManager({
  documents,
  targetType,
  targetId,
  back,
  title = "Documents",
  description = `Private PDFs and images. Maximum ${MAX_UPLOAD_LABEL} per file.`,
  categories = categoriesForTarget(targetType),
  /** Drops the outer bordered section, heading and description — for
   * embedding directly inside another card (e.g. one HR document's own
   * card) instead of as a standalone block. */
  compact = false,
  /** Hides upload and delete controls entirely — for viewers (e.g. property
   * owners) who can see documents but never manage them. */
  readOnly = false,
  /** Uploads without navigating away — for a form embedded inside a modal,
   * where a redirect-driven success/error message would either close the
   * modal or land on a page-level banner the modal itself covers up. Shows
   * the result right inside this component instead. */
  inline = false,
  /** Overrides the default "tenancy documents always have a term" rule
   * below — set for any other document type that also always has a
   * real-world expiry (e.g. an ownership contract or miscellaneous file).
   * Must agree with performDocumentUpload's matching server-side check in
   * app/document-actions.ts, since the client-side `required` here is a UX
   * nicety, not the actual enforcement. */
  expiryRequired: expiryRequiredOverride,
}: {
  documents: DocumentItem[];
  targetType: EntityDocumentTargetType;
  targetId: string;
  back: string;
  title?: string;
  description?: string;
  categories?: readonly EntityDocumentCategory[];
  compact?: boolean;
  readOnly?: boolean;
  inline?: boolean;
  expiryRequired?: boolean;
}) {
  const fieldPrefix = `${targetType}-${targetId}`;
  // A single fixed category (the common case when embedded in a specific
  // document's own card) doesn't need a picker — it would just be a
  // one-option dropdown restating what the card title already says.
  const singleCategory = categories.length === 1 ? categories[0] : null;
  // A tenancy document (agreement, municipality registration, ...) always
  // has a real-world term — see performDocumentUpload's matching
  // server-side check in app/document-actions.ts.
  const expiryRequired = expiryRequiredOverride ?? targetType === "tenancy";

  const [uploadState, uploadFormAction] = useActionState<
    UploadDocumentsState,
    FormData
  >(uploadEntityDocumentsInlineAction, null);

  if (compact) {
    // A tight, single-purpose variant for embedding inside a document's own
    // card: existing files as small chips, then one inline row (file picker
    // + upload button) — no type/label fields, since the category is fixed
    // and a label would just repeat the card's own title.
    return (
      <div className="space-y-2">
        {documents.length > 0 && (
          <div className="space-y-1">
            {documents.map((document) => (
              <div
                key={document.id}
                className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <a
                  href={`/api/entity-document/${document.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs font-medium hover:text-primary hover:underline"
                >
                  <span className="truncate">
                    {document.label || document.fileName}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatFileSize(document.fileSize)}
                </span>
                <ExpiryChip expiresAt={document.expiresAt} />
                {!readOnly && document.canDelete !== false && (
                  <form>
                    <input
                      type="hidden"
                      name="documentId"
                      value={document.id}
                    />
                    <input type="hidden" name="back" value={back} />
                    <SubmitButton
                      formAction={deleteEntityDocumentAction}
                      variant="ghost"
                      size="iconSm"
                      pendingText="…"
                      className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${document.fileName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </SubmitButton>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
        {!readOnly && (
        <form
          className="space-y-2"
          // React sets encType itself when action is a function (inline
          // mode) and warns if it's also set explicitly here.
          encType={inline ? undefined : "multipart/form-data"}
          action={inline ? uploadFormAction : undefined}
        >
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="back" value={back} />
          {singleCategory && (
            <input type="hidden" name="category" value={singleCategory} />
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <UploadFileInput
                id={`${fieldPrefix}-documents`}
                name="documents"
                multiple
                required
                hint=""
                className="text-xs"
              />
            </div>
            <div className="shrink-0 space-y-1">
              <Label
                htmlFor={`${fieldPrefix}-expires-compact`}
                className="text-xs"
              >
                Expiry date{expiryRequired ? "" : " (optional)"}
              </Label>
              <Input
                id={`${fieldPrefix}-expires-compact`}
                type="date"
                name="expiresAt"
                min={dateInputValue()}
                required={expiryRequired}
                className="h-9 w-40 text-xs"
              />
            </div>
            <SubmitButton
              formAction={inline ? undefined : uploadEntityDocumentsAction}
              variant="outline"
              size="sm"
              pendingText="…"
              className="shrink-0 px-2.5"
            >
              <Upload className="h-3.5 w-3.5" />
            </SubmitButton>
          </div>
          {inline && <UploadResultBanner state={uploadState} />}
        </form>
        )}
      </div>
    );
  }

  const body = (
    <>
      {documents.length > 0 ? (
        <div className="divide-y rounded-lg border">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/entity-document/${document.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 truncate text-sm font-medium hover:text-primary hover:underline"
                >
                  <span className="truncate">
                    {document.label || document.fileName}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <p className="flex flex-wrap items-center gap-1 truncate text-[11px] text-muted-foreground">
                  {ENTITY_DOCUMENT_CATEGORY_LABEL[document.category]} ·{" "}
                  {formatFileSize(document.fileSize)} ·{" "}
                  {document.createdAt.toLocaleDateString("en-OM")}
                  <ExpiryChip expiresAt={document.expiresAt} />
                </p>
              </div>
              {!readOnly && document.canDelete !== false && (
                <form>
                  <input type="hidden" name="documentId" value={document.id} />
                  <input type="hidden" name="back" value={back} />
                  <SubmitButton
                    formAction={deleteEntityDocumentAction}
                    variant="ghost"
                    size="iconSm"
                    pendingText="…"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${document.fileName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No documents uploaded yet.
        </p>
      )}

      {!readOnly && (
      <form
        className="space-y-3"
        // React sets encType itself when action is a function (inline
        // mode) and warns if it's also set explicitly here.
        encType={inline ? undefined : "multipart/form-data"}
        action={inline ? uploadFormAction : undefined}
      >
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="back" value={back} />
        {singleCategory && (
          <input type="hidden" name="category" value={singleCategory} />
        )}
        <div
          className={
            singleCategory
              ? "grid gap-3 sm:grid-cols-2"
              : "grid gap-3 sm:grid-cols-3"
          }
        >
          {!singleCategory && (
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldPrefix}-category`} className="text-xs">
                Document type
              </Label>
              <Select
                id={`${fieldPrefix}-category`}
                name="category"
                defaultValue={categories[0]}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {ENTITY_DOCUMENT_CATEGORY_LABEL[category]}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldPrefix}-label`} className="text-xs">
              Document label
            </Label>
            <Input
              id={`${fieldPrefix}-label`}
              name="label"
              placeholder="Optional description"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldPrefix}-expires`} className="text-xs">
              Expiry date{expiryRequired ? "" : " (optional)"}
            </Label>
            <Input
              id={`${fieldPrefix}-expires`}
              type="date"
              name="expiresAt"
              min={dateInputValue()}
              required={expiryRequired}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldPrefix}-documents`} className="text-xs">
            PDF or image files
          </Label>
          <UploadFileInput
            id={`${fieldPrefix}-documents`}
            name="documents"
            multiple
            required
          />
        </div>
        <SubmitButton
          formAction={inline ? undefined : uploadEntityDocumentsAction}
          variant="outline"
          size="sm"
          pendingText="Uploading..."
        >
          <Upload className="h-4 w-4" />
          Upload documents
        </SubmitButton>
        {inline && <UploadResultBanner state={uploadState} />}
      </form>
      )}
    </>
  );

  return (
    <section className="space-y-4 rounded-xl border bg-background p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" />
          {title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {body}
    </section>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
