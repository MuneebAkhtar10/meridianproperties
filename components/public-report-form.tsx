"use client";

import { useRef, useState } from "react";
import { Home, Image as ImageIcon, LoaderCircle, Upload, X } from "lucide-react";

import {
  lookupTenantUnitAction,
  reportIssuePublicAction,
  type PhoneLookupResult,
} from "@/app/public-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/phone-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_ACCEPT,
  MAX_UPLOAD_LABEL,
  batchRejectionReason,
} from "@/lib/upload-limits";

type Step = "phone" | "form" | "done";

/**
 * The public, logged-out report flow scanned in from a QR code: enter your
 * phone number, confirm it's you, then fill in the same fields the signed-in
 * form asks for. Two steps because the location dropdown depends on the
 * tenant's property type, which we don't know until the phone resolves.
 */
export function PublicReportForm() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [unitInfo, setUnitInfo] = useState<
    Extract<PhoneLookupResult, { ok: true }> | null
  >(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lookupPhone = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLookingUp(true);
    setLookupError(null);

    const formData = new FormData();
    formData.append("phone", phone);

    try {
      const result = await lookupTenantUnitAction(formData);
      if (result.ok) {
        setUnitInfo(result);
        setStep("form");
      } else {
        setLookupError(result.message);
      }
    } catch {
      setLookupError("Something went wrong. Please try again.");
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const next = [...files, ...selected];
    const rejection = batchRejectionReason(next, ALLOWED_IMAGE_TYPES);

    event.target.value = "";

    if (rejection) {
      setSubmitError(rejection);
      return;
    }

    setFiles(next);
    setSubmitError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    const formData = new FormData(event.currentTarget);
    formData.set("phone", phone);
    for (const file of files) {
      formData.append("attachments", file);
    }

    try {
      const result = await reportIssuePublicAction(formData);
      if (result.ok) {
        setSuccessMessage(result.message);
        setStep("done");
      } else {
        setSubmitError(result.message);
      }
    } catch {
      setSubmitError("Could not submit the report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "done") {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-center">
          <p className="text-lg font-semibold">Request submitted</p>
          <p className="text-sm text-muted-foreground">{successMessage}</p>
        </CardContent>
      </Card>
    );
  }

  if (step === "phone") {
    return (
      <Card>
        <CardContent className="p-6">
          <form className="space-y-4" onSubmit={lookupPhone}>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Your phone number</Label>
              <PhoneInput
                id="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+968XXXXXXXX"
                required
              />
              <p className="text-xs text-muted-foreground">
                This must match the phone number on file with the admin, so
                we know which apartment to file your request against.
              </p>
            </div>

            {lookupError && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {lookupError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isLookingUp}>
              {isLookingUp && (
                <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              )}
              {isLookingUp ? "Checking…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // step === "form" — unitInfo is guaranteed set here.
  const info = unitInfo!;

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-accent/40">
        <CardContent className="flex items-center gap-3 p-4">
          <Home className="h-4 w-4 text-accent-foreground" />
          <p className="text-sm">
            Reporting for <span className="font-medium">{info.unitLabel}</span>{" "}
            at {info.propertyName}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="title">What is the problem?</Label>
              <Input
                id="title"
                name="title"
                placeholder={`e.g. ${info.locationOptions[0]} light isn't working`}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="location">Where in your {info.unitNoun}?</Label>
                <Select
                  id="location"
                  name="location"
                  defaultValue={info.locationOptions[0]}
                >
                  {info.locationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </Select>
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

            {submitError && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {submitError}
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
    </div>
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
