/** Phone numbers everywhere in the app follow the same shape: digits only,
 * with an optional single leading "+", no spaces, and 12 characters total
 * at most (the "+" counts toward that limit). This is the one place that
 * rule lives, so client-side filtering and server-side validation can't
 * drift apart. */
export const PHONE_MAX_LENGTH = 12;
export const PHONE_PATTERN = /^\+?\d{1,12}$/;

/** Strips anything that isn't a digit or a leading "+", and truncates to
 * the max length. Used for live filtering as the user types. */
export function sanitizePhoneInput(value: string): string {
  const hasLeadingPlus = value.trimStart().startsWith("+");
  const digits = value.replace(/[^\d]/g, "");
  const sanitized = (hasLeadingPlus ? "+" : "") + digits;
  return sanitized.slice(0, PHONE_MAX_LENGTH);
}

/** Server-side check for a phone number already trimmed of surrounding
 * whitespace. An empty string is treated as "not provided" — callers
 * should only invoke this on non-empty values. */
export function isValidPhone(value: string): boolean {
  return PHONE_PATTERN.test(value) && value.length <= PHONE_MAX_LENGTH;
}
