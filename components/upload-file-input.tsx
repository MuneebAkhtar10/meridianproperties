"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Input } from "@/components/ui/input";
import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  DOCUMENT_ACCEPT,
  IMAGE_ACCEPT,
  MAX_REQUEST_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  batchRejectionReason,
  formatBytes,
} from "@/lib/upload-limits";

/**
 * File inputs that turn away what the server would refuse anyway.
 *
 * The refusal has to happen in the browser. Once an oversized body is posted,
 * the Server Action limit kills the request before the action runs, so nothing
 * can redirect back with a reason — the user lands on a blank error page and
 * cannot tell whether their payment or document was saved. Catching it here
 * keeps the problem inside the form, where it can be read and fixed.
 */

type UploadBudget = {
  /** Records this input's selection, or returns why the form as a whole is too heavy. */
  claim: (id: string, files: File[]) => string | null;
  release: (id: string) => void;
};

const UploadBudgetContext = createContext<UploadBudget | null>(null);

/**
 * Shares one request-body budget between the file inputs of a single form.
 *
 * A form with three document fields can pass every field's own check and still
 * post a body over the limit, so the fields have to be weighed together.
 */
export function UploadBudgetProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = useRef(new Map<string, number>());

  const budget = useMemo<UploadBudget>(
    () => ({
      claim(id, files) {
        const claimed = files.reduce((total, file) => total + file.size, 0);
        let total = claimed;

        for (const [key, bytes] of claims.current) {
          if (key !== id) total += bytes;
        }

        if (total > MAX_REQUEST_UPLOAD_BYTES) {
          return `The files on this form add up to ${formatBytes(total)}. One submission can carry ${MAX_UPLOAD_LABEL} in total — save this first, then add the rest from the detail page.`;
        }

        claims.current.set(id, claimed);
        return null;
      },
      release(id) {
        claims.current.delete(id);
      },
    }),
    [],
  );

  return (
    <UploadBudgetContext.Provider value={budget}>
      {children}
    </UploadBudgetContext.Provider>
  );
}

export function UploadFileInput({
  kind = "document",
  hint,
  onChange,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  kind?: "document" | "image";
  hint?: string;
}) {
  const [rejection, setRejection] = useState<string | null>(null);
  const budget = useContext(UploadBudgetContext);
  const id = useId();

  useEffect(() => () => budget?.release(id), [budget, id]);

  const allowedTypes =
    kind === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_DOCUMENT_TYPES;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const reason =
      batchRejectionReason(files, allowedTypes) ??
      budget?.claim(id, files) ??
      null;

    setRejection(reason);

    if (reason) {
      // Drop the selection: a `required` input then blocks the submit, the
      // budget stays truthful, and re-picking the same file after shrinking it
      // still fires a change event.
      event.target.value = "";
      budget?.release(id);
      return;
    }

    onChange?.(event);
  };

  return (
    <div className="space-y-1.5">
      <Input
        type="file"
        accept={kind === "image" ? IMAGE_ACCEPT : DOCUMENT_ACCEPT}
        aria-invalid={rejection ? true : undefined}
        onChange={handleChange}
        {...props}
      />
      {rejection ? (
        <p className="text-xs font-medium text-destructive">{rejection}</p>
      ) : hint !== "" ? (
        <p className="text-xs text-muted-foreground">
          {hint ??
            (kind === "image"
              ? `PNG, JPG, GIF or WebP · up to ${MAX_UPLOAD_LABEL}`
              : `PDF, PNG, JPG, GIF or WebP · up to ${MAX_UPLOAD_LABEL}`)}
        </p>
      ) : null}
    </div>
  );
}
