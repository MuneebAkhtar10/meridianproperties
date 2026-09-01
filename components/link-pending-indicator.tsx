"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";

/** Must render inside a Next Link; confirms slow navigation without layout shift. */
export function LinkPendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center transition-opacity ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    >
      <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
    </span>
  );
}
