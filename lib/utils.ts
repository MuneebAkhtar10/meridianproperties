import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Attachments live in a private bucket, so they are always fetched through the
 * route that checks the caller is allowed to see them.
 */
export function attachmentUrl(attachmentId: string): string {
  return `/api/attachment/${attachmentId}`;
}

/** A person's full name, or their email when no name is on file — the one
 * display rule every owner/tenant list in the app should use instead of
 * showing an email address as the primary label. */
export function personDisplayName(person: {
  email: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.email
  );
}
