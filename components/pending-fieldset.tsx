"use client";

import { type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Wraps a form's fields (submit button included) so the whole row visibly
 * dims and stops responding to clicks while that form is submitting — the
 * submit button's own spinner is easy to miss on a fast local network, so
 * dimming the row makes the pending state unmistakable. This has to be the
 * element carrying the layout classes (e.g. the grid) itself, since
 * `useFormStatus` needs a real rendered box here to fade — must be used
 * inside the `<form>` it tracks. */
export function PendingFieldset({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <div
      className={className}
      style={{
        opacity: pending ? 0.6 : 1,
        pointerEvents: pending ? "none" : undefined,
        transition: "opacity 150ms",
      }}
    >
      {children}
    </div>
  );
}
