"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, LoaderCircle, Upload, X } from "lucide-react";

import { reportIssueAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_ACCEPT,
  MAX_UPLOAD_LABEL,
  batchRejectionReason,
} from "@/lib/upload-limits";

export function ReportForm({
  locationOptions: rawLocationOptions,
  unitNoun,
  allowCommonArea = false,
}: {
  /** Where-is-the-problem choices, tailored per property type (villa, shop,
   * office, or whatever an admin has configured). Always ends with "Other". */
  locationOptions: string[] | null | undefined;
  /** e.g. "apartment", "villa", "shop", "office" — used in the field label. */
  unitNoun: string;
  /** Only true when the tenant's property has more than one unit — a
   * single-unit property has no shared space distinct from that unit. */
  allowCommonArea?: boolean;
}) {
  // Falls back to a safe default if a property type predates this column
  // (e.g. its row was never re-saved after the migration ran).
  const locationOptions =
    rawLocationOptions && rawLocationOptions.length > 0
      ? rawLocationOptions
      : ["Other"];

  const [isCommonArea, setIsCommonArea] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const next = [...files, ...selected];

    // Photos travel in the same request body as the report, and a body over the
    // Server Action limit is dropped before the action runs — no redirect, no
    // message, just an error page. So the whole batch is weighed here first.
    const rejection = batchRejectionReason(next, ALLOWED_IMAGE_TYPES);

    if (rejection) {
      setError(rejection);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setFiles(next);
    setError(null);

    // Reset so the same file can be re-picked after being removed.
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    // The file input is deliberately unnamed: only the photos still in `files` after
    // any removals get sent.
    for (const file of files) {
      formData.append("attachments", file);
    }

    try {
      await reportIssueAction(formData);
    } catch (error) {
      // The action always redirects (success or validation error). A redirect
      // surfaces here as a special error carrying a `digest` like "NEXT_REDIRECT".
      // If we swallow it, the router never navigates and the tenant sees a false
      // "could not submit" even though the request was saved. Let it propagate.
      if (
        error !== null &&
        typeof error === "object" &&
        "digest" in error &&
        typeof (error as { digest: unknown }).digest === "string" &&
        (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw error;
      }

      setError("Could not submit the report. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          {allowCommonArea && (
            <div className="space-y-1.5">
              <Label>What is this about?</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsCommonArea(false)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    !isCommonArea
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:bg-muted"
                  }`}
                >
                  My {unitNoun}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCommonArea(true)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    isCommonArea
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:bg-muted"
                  }`}
                >
                  A common area
                </button>
              </div>
              <input
                type="hidden"
                name="isCommonArea"
                value={isCommonArea ? "true" : "false"}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="title">What is the problem?</Label>
            <Input
              id="title"
              name="title"
              placeholder={`e.g. ${locationOptions[0]} light isn't working`}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              {isCommonArea ? (
                <>
                  <Label htmlFor="location">Which common area?</Label>
                  <Input
                    id="location"
                    name="location"
                    placeholder="e.g. Lobby, Parking, Garden, Elevator"
                    required
                  />
                </>
              ) : (
                <>
                  <Label htmlFor="location">Where in your {unitNoun}?</Label>
                  <Select
                    id="location"
                    name="location"
                    defaultValue={locationOptions[0]}
                  >
                    {locationOptions.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </Select>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="priority">How urgent is it?</Label>
              <Select id="priority" name="priority" defaultValue="medium">
                <option value="low">Low — can wait</option>
                <option value="medium">Medium — needs attention soon</option>
                <option value="high">High — urgent</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Describe it</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              placeholder="Tell the maintenance team what is happening, and when it started."
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Photos (optional)</Label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-primary">
                Upload photos
              </span>
              <span className="text-xs text-muted-foreground">
                PNG, JPG, GIF or WebP · up to {MAX_UPLOAD_LABEL} in total
              </span>
            </button>
            <input
              ref={fileInputRef}
              id="attachments"
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {files.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {files.map((file, index) => (
                <FilePreview
                  key={`${file.name}-${index}`}
                  file={file}
                  onRemove={() =>
                    setFiles((prev) => prev.filter((_, i) => i !== index))
                  }
                />
              ))}
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && (
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            )}
            {isSubmitting ? "Submitting..." : "Submit request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [previewUrl] = useState(() => URL.createObjectURL(file));

  return (
    <div className="group relative space-y-1">
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-3 w-3" />
      </button>

      <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
        {file.type.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </span>
        )}
      </div>

      <p className="truncate text-xs text-muted-foreground">{file.name}</p>
    </div>
  );
}
