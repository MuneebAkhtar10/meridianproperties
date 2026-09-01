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
