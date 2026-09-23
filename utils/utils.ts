import { redirect } from "next/navigation";

/**
 * Redirects to a specified path with an encoded message as a query parameter.
 * @param {('error' | 'success')} type - The type of message, either 'error' or 'success'.
 * @param {string} path - The path to redirect to.
 * @param {string} message - The message to be encoded and added as a query parameter.
 * @returns {never} This function doesn't return as it triggers a redirect.
 */
export function encodedRedirect(
  type: "error" | "success",
  path: string,
  message: string,
) {
  return redirect(
    `${path}${path.includes("?") ? "&" : "?"}${type}=${encodeURIComponent(message)}`,
  );
}

/** Only follow in-app paths from a form's `redirectTo` field. */
export function internalPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback: string,
): string {
  const path = typeof value === "string" ? value : value?.toString();
  if (!path) return fallback;
  if (!path.startsWith("/protected")) return fallback;
  if (path.startsWith("//") || path.includes("\\")) return fallback;
  return path;
}
