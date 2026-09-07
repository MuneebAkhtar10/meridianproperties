"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * A minimal, dependency-free modal dialog (no Radix — this codebase has no
 * @headlessui/@radix dialog primitive installed, and pulling one in for a
 * single use case wasn't worth it). Renders its trigger inline and, when
 * open, portals the dialog to document.body so it isn't clipped by any
 * scroll container or `overflow-hidden` card.
 */
export function Modal({
  trigger,
  title,
  description,
  children,
  widthClassName = "max-w-lg",
  icon,
  headerClassName,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  widthClassName?: string;
  /** Optional icon badge shown to the left of the title. */
  icon?: ReactNode;
  /** Optional class override for the header bar — e.g. a gradient — for
   * modals that want more visual presence than the plain default. */
  headerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {trigger}
      </span>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
                onClick={() => setOpen(false)}
              />
              <div
                className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-xl border border-border/60 bg-card shadow-2xl ${widthClassName}`}
                role="dialog"
                aria-modal="true"
              >
                <div
                  className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${
                    headerClassName ??
                    "border-border/60 bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {icon}
                    <div className="space-y-0.5">
                      <h2 className="text-base font-semibold">{title}</h2>
                      {description && (
                        <p className="text-sm text-muted-foreground">
                          {description}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-black/5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div
                  className="p-5"
                  onClick={(e) => {
                    // A successful form submit inside the modal triggers a
                    // navigation/redirect handled by the server action; the
                    // modal doesn't need to manage its own close-on-submit
                    // since the page reload naturally resets `open` to false.
                    if ((e.target as HTMLElement).closest("[data-close-modal]")) {
                      setOpen(false);
                    }
                  }}
                >
                  {children}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
