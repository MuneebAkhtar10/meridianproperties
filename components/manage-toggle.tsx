"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Settings2 } from "lucide-react";

/**
 * A single collapsible "Manage" section — used to bundle several admin-only
 * forms (edit profile, documents, reset password, role/delete, etc.) behind
 * one toggle instead of stacking them all open by default. Cuts a long list
 * of cards down to a scannable height; anyone who needs the detail clicks in.
 */
export function ManageToggle({
  label = "Manage account",
  hint,
  icon,
  defaultOpen = false,
  children,
}: {
  label?: string;
  hint?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted/50"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
          {icon ?? <Settings2 className="h-3.5 w-3.5" />}
        </span>
        <span>
          {label}
          {hint && (
            <span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">
              {hint}
            </span>
          )}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-4 border-t bg-muted/10 p-3 sm:p-4">
          {children}
        </div>
      )}
    </div>
  );
}
