/**
 * Upload limits live here rather than in `lib/storage.ts` because the browser
 * needs them too, and `lib/storage.ts` is server-only.
 *
 * The ceiling is not ours to pick. A Server Action body is capped by Next
 * (`serverActions.bodySizeLimit` in `next.config.ts`, 1MB if unset) and, on
 * Vercel, by the platform's 4.5MB request limit. Whatever goes over is rejected
 * before any of our code runs, so the action never gets to redirect back with a
 * reason: the user just gets a bare "server error" page and no idea that the
 * file was simply too big. Keeping our own cap below the request ceiling means
 * we do the rejecting, in the form, with a message.
 */

/** Per file. Must stay under `serverActions.bodySizeLimit` with room for the other fields. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const MAX_UPLOAD_LABEL = "4MB";

/** The limit applies to the whole request body, so several files share one budget. */
export const MAX_REQUEST_UPLOAD_BYTES = MAX_UPLOAD_BYTES;

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

export const ALLOWED_DOCUMENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "application/pdf",
];

/**
 * `accept` values built from the allowlists, so the picker only offers what the
 * server takes. This also makes iOS hand over a JPEG copy of a HEIC photo
 * instead of the HEIC itself, which we would have to reject.
 */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");
export const DOCUMENT_ACCEPT = ALLOWED_DOCUMENT_TYPES.join(",");

const TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

/**
 * Some apps hand a file over with no MIME type at all, or a generic one — a PDF
 * shared out of a banking app is a common case. The extension is the only hint
 * left, and rejecting a valid receipt over a missing header helps nobody.
 */
export function fileMimeType(file: { name: string; type: string }): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXTENSION[extension] ?? file.type;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))}KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Why this file cannot be uploaded, or null when it is fine. */
export function fileRejectionReason(
  file: { name: string; type: string; size: number },
  allowed: readonly string[] = ALLOWED_DOCUMENT_TYPES,
): string | null {
  if (file.size === 0) {
    return `"${file.name}" is empty.`;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `"${file.name}" is ${formatBytes(file.size)}. Maximum is ${MAX_UPLOAD_LABEL} per file.`;
  }

  if (!allowed.includes(fileMimeType(file))) {
    return allowed.includes("application/pdf")
      ? `"${file.name}" must be a PDF or an image (PNG, JPG, GIF or WebP).`
      : `"${file.name}" must be an image (PNG, JPG, GIF or WebP).`;
  }

  return null;
}

/** Why this batch cannot be uploaded together, or null when it fits. */
export function batchRejectionReason(
  files: Array<{ name: string; type: string; size: number }>,
  allowed: readonly string[] = ALLOWED_DOCUMENT_TYPES,
): string | null {
  for (const file of files) {
    const reason = fileRejectionReason(file, allowed);
    if (reason) {
      return reason;
    }
  }

  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_REQUEST_UPLOAD_BYTES) {
    return `Those files add up to ${formatBytes(total)}. One upload can carry ${MAX_UPLOAD_LABEL} in total — send the rest separately.`;
  }

  return null;
}
