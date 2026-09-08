import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";

import {
  deleteEntityDocumentAction,
  uploadEntityDocumentsAction,
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
}) {
  const fieldPrefix = `${targetType}-${targetId}`;
  // A single fixed category (the common case when embedded in a specific
  // document's own card) doesn't need a picker — it would just be a
  // one-option dropdown restating what the card title already says.
  const singleCategory = categories.length === 1 ? categories[0] : null;

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
          className="flex items-center gap-2"
          encType="multipart/form-data"
        >
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="back" value={back} />
          {singleCategory && (
            <input type="hidden" name="category" value={singleCategory} />
          )}
          <UploadFileInput
            id={`${fieldPrefix}-documents`}
            name="documents"
            multiple
            required
            hint=""
            className="text-xs"
          />
          <SubmitButton
            formAction={uploadEntityDocumentsAction}
            variant="outline"
            size="sm"
            pendingText="…"
            className="shrink-0 px-2.5"
          >
            <Upload className="h-3.5 w-3.5" />
          </SubmitButton>
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
                <p className="truncate text-[11px] text-muted-foreground">
                  {ENTITY_DOCUMENT_CATEGORY_LABEL[document.category]} ·{" "}
                  {formatFileSize(document.fileSize)} ·{" "}
                  {document.createdAt.toLocaleDateString("en-OM")}
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
      <form className="space-y-3" encType="multipart/form-data">
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="back" value={back} />
        {singleCategory && (
          <input type="hidden" name="category" value={singleCategory} />
        )}
        <div
          className={
            singleCategory ? "space-y-1.5" : "grid gap-3 sm:grid-cols-2"
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
          formAction={uploadEntityDocumentsAction}
          variant="outline"
          size="sm"
          pendingText="Uploading..."
        >
          <Upload className="h-4 w-4" />
          Upload documents
        </SubmitButton>
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
