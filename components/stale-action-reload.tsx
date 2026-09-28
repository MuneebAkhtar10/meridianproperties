"use client";

import { useEffect } from "react";

/**
 * After the app is redeployed (or the dev server restarts) a tab that was
 * already open still holds the old server-action ids, so its next action
 * fails with "Failed to find Server Action" and the page looks broken. This
 * reloads the tab once so it picks up the current build — guarded so a real
 * failure can never cause a reload loop.
 */
const KEY = "stale-action-reloaded-at";

function isStale(reason: unknown): boolean {
  const text =
    reason instanceof Error
      ? `${reason.name} ${reason.message}`
      : typeof reason === "string"
        ? reason
        : "";
  return (
    text.includes("UnrecognizedActionError") ||
    text.includes("Failed to find Server Action") ||
    text.includes("was not found on the server")
  );
}

/** Reloads the tab (at most once per 30s) if `reason` is a stale-action error. */
export function reloadIfStaleAction(reason: unknown): boolean {
  if (!isStale(reason)) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return true;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage unavailable — still reload once below */
  }
  window.location.reload();
  return true;
}

export function StaleActionReload() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) =>
      reloadIfStaleAction(event.reason);
    const onError = (event: ErrorEvent) =>
      reloadIfStaleAction(event.error ?? event.message);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
